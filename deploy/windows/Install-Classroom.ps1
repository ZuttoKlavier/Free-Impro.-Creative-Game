#requires -Version 5.1
#requires -RunAsAdministrator
<#
Private first installation only, on the classroom Windows Server.
Uses already installed Node and WinSW 2.x; downloads no runtime.
Existing service registrations are refused before making changes.
Starts only the loopback classroom backend. No HTTPS service or inbound rule
is installed. Does not change SSH/RDP or overwrite databases/certificates.
#>
[CmdletBinding()]
param(
    [string]$ClassroomDomain = 'class.empfreeimpro.xyz'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = 'C:\EMPVC'
if ($env:OS -ne 'Windows_NT') { throw 'Run this installer on the Windows classroom server.' }
if ($ClassroomDomain -cne 'class.empfreeimpro.xyz') {
    throw 'This deployment is restricted to the approved host class.empfreeimpro.xyz; provide the hostname only.'
}

function Assert-RegularFile([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Required file must be a regular file: $Path"
    }
}

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "A required deployment command failed: $([IO.Path]::GetFileName($Program))" }
}

function Set-PrivateTreePermissions {
    # Language-independent SIDs; no Everyone/Users grants and no inherited ACLs.
    $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $localService = [Security.Principal.SecurityIdentifier]::new('S-1-5-19')
    $writable = @('data', 'backups', 'caddy-data', 'logs', 'temp') |
        ForEach-Object { Join-Path $Root $_ }
    $items = @(Get-Item -LiteralPath $Root) + @(Get-ChildItem -LiteralPath $Root -Force -Recurse)
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not supported in the deployment tree.' }
        $canWrite = $false
        foreach ($directory in $writable) {
            if ($item.FullName.Equals($directory, [StringComparison]::OrdinalIgnoreCase) -or
                $item.FullName.StartsWith($directory + '\', [StringComparison]::OrdinalIgnoreCase)) { $canWrite = $true; break }
        }
        if ($item.PSIsContainer) {
            $acl = [Security.AccessControl.DirectorySecurity]::new()
            $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
        } else {
            $acl = [Security.AccessControl.FileSecurity]::new()
            $inheritance = [Security.AccessControl.InheritanceFlags]::None
        }
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($administrators)
        foreach ($principal in @($administrators, $system)) {
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,
                [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
                [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
        }
        $rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute
        if ($canWrite) { $rights = [Security.AccessControl.FileSystemRights]::Modify }
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($localService, $rights,
            $inheritance, [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow))
        Set-Acl -LiteralPath $item.FullName -AclObject $acl
    }
}

function Wait-BackendHealthy {
    # HttpWebRequest permits the explicit Host header required by server/cloud.js.
    # This is a bounded loopback check, not an HTTPS certificate bypass.
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $response = $null
        try {
            $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:3000/api/health')
            $request.Host = $ClassroomDomain
            $request.AllowAutoRedirect = $false
            $request.Proxy = $null
            $request.Timeout = 2500
            $response = $request.GetResponse()
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            if ([int]$response.StatusCode -eq 200 -and $body.ok -eq $true) { return }
        } catch { } finally { if ($null -ne $response) { $response.Dispose() } }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Backend did not pass the domain-bound health check; inspect logs\app. No public service was installed.'
}

# All safety checks precede package installation, ACL changes, and registration.
$rootItem = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'C:\EMPVC must be a real directory.' }
$Node = Join-Path $Root 'runtime\node\node.exe'
$Npm = Join-Path $Root 'runtime\node\npm.cmd'
$WrapperSource = Join-Path $Root 'runtime\winsw\WinSW-x64.exe'
$requiredFiles = @($Node, $Npm, $WrapperSource,
    (Join-Path $Root 'server\cloud.js'), (Join-Path $Root 'server\app.js'),
    (Join-Path $Root 'dist\index.html'), (Join-Path $Root 'dist\teacher.html'),
    (Join-Path $Root 'package.json'), (Join-Path $Root 'package-lock.json'),
    (Join-Path $PSScriptRoot 'EmpvcClassroom.xml'))
foreach ($path in $requiredFiles) { Assert-RegularFile $path }
foreach ($item in @(Get-ChildItem -LiteralPath $Root -Force -Recurse)) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Remove reparse points from this deployment package before installation.' }
}
foreach ($name in @('EmpvcClassroom', 'EmpvcHttps')) {
    if ($null -ne (Get-CimInstance -ClassName Win32_Service -Filter "Name='$name'")) {
        throw "Service $name already exists. This first-install script refuses to overwrite or restart an existing installation; use the documented update procedure."
    }
}
if (@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'A listener already owns port 3000. Resolve the conflict without stopping unrelated services.'
}
$nodeText = (& $Node --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeText -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or
    [version]($nodeText.Substring(1)) -lt [version]'24.15.0') { throw 'Install Node.js 24.15.0 or later in runtime\node before continuing.' }
$winSwVersion = (Get-Item -LiteralPath $WrapperSource).VersionInfo.ProductVersion
if ($winSwVersion -notmatch '^2\.') { throw 'Use a WinSW 2.x x64 executable; these XML templates are not WinSW 3.x configuration.' }

$ServiceDirectory = Join-Path $Root 'services'
foreach ($directory in @('services', 'data', 'backups', 'caddy-data', 'logs\app', 'logs\https', 'temp')) {
    $path = Join-Path $Root $directory
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
    elseif (-not (Get-Item -LiteralPath $path).PSIsContainer) { throw "Expected a directory: $path" }
}
# CI installs only runtime dependencies and does not execute package lifecycle scripts.
Push-Location $Root
$oldPath = $env:PATH
try {
    $env:PATH = (Join-Path $Root 'runtime\node') + ';' + $oldPath
    Invoke-Checked $Npm @('ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund')
} finally { $env:PATH = $oldPath; Pop-Location }

Copy-Item -LiteralPath $WrapperSource -Destination (Join-Path $ServiceDirectory 'EmpvcClassroom.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'EmpvcClassroom.xml') -Destination (Join-Path $ServiceDirectory 'EmpvcClassroom.xml') -Force
Set-PrivateTreePermissions

$AppWrapper = Join-Path $ServiceDirectory 'EmpvcClassroom.exe'
Invoke-Checked $AppWrapper @('install')
Invoke-Checked $AppWrapper @('start')
Wait-BackendHealthy
Write-Host 'Private backend health check passed. Only EmpvcClassroom on 127.0.0.1:3000 was installed and started.'
Write-Host 'No HTTPS service or public firewall rule was created. Complete ICP filing and DNS, obtain public-exposure confirmation, then use Enable-ClassroomHttps.ps1.'
