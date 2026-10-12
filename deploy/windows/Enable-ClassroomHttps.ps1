#requires -Version 5.1
#requires -RunAsAdministrator
<#
Separate public-enablement stage. No action without explicit filing and
exposure confirmations. Does not modify existing services, SSH, or RDP.
#>
[CmdletBinding()]
param(
    [string]$ClassroomDomain = 'class.empfreeimpro.xyz',
    [switch]$ConfirmIcpCompleted,
    [switch]$ConfirmPublicExposure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = 'C:\EMPVC'
if ($env:OS -ne 'Windows_NT') { throw 'Run this script on the Windows classroom server.' }
if ($ClassroomDomain -cne 'class.empfreeimpro.xyz') { throw 'Use the approved hostname class.empfreeimpro.xyz without URL components.' }
if (-not $ConfirmIcpCompleted.IsPresent -or -not $ConfirmPublicExposure.IsPresent) {
    throw 'Public HTTPS is disabled. Verify completed ICP filing and obtain explicit authorization for public exposure before passing both confirmation switches.'
}

function Assert-RegularFile([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Required file must be regular: $Path" }
}
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Required command failed: $([IO.Path]::GetFileName($Program))" }
}
function Wait-BackendHealthy {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $response = $null
        try {
            $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:3000/api/health')
            $request.Host = $ClassroomDomain; $request.AllowAutoRedirect = $false
            $request.Proxy = $null; $request.Timeout = 2500
            $response = $request.GetResponse()
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            if ([int]$response.StatusCode -eq 200 -and $body.ok -eq $true) { return }
        } catch { } finally { if ($null -ne $response) { $response.Dispose() } }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The private classroom backend is not healthy; public HTTPS was not enabled.'
}
function Set-PrivateTreePermissions {
    $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $localService = [Security.Principal.SecurityIdentifier]::new('S-1-5-19')
    $writable = @('data', 'backups', 'caddy-data', 'logs', 'temp') | ForEach-Object { Join-Path $Root $_ }
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
        } else { $acl = [Security.AccessControl.FileSecurity]::new(); $inheritance = [Security.AccessControl.InheritanceFlags]::None }
        $acl.SetAccessRuleProtection($true, $false); $acl.SetOwner($administrators)
        foreach ($principal in @($administrators, $system)) {
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,
                [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
                [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
        }
        $rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute
        if ($canWrite) { $rights = [Security.AccessControl.FileSystemRights]::Modify }
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($localService, $rights,
            $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
        Set-Acl -LiteralPath $item.FullName -AclObject $acl
    }
}

# Validate the private installation and public prerequisites before mutations.
$rootItem = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'C:\EMPVC must be a real deployment directory.' }
$ServiceDirectory = Join-Path $Root 'services'
$app = Get-CimInstance -ClassName Win32_Service -Filter "Name='EmpvcClassroom'"
$expectedApp = Join-Path $ServiceDirectory 'EmpvcClassroom.exe'
if ($null -eq $app -or ($app.PathName.Trim() -ine $expectedApp -and $app.PathName.Trim() -ine ('"' + $expectedApp + '"')) -or
    $app.StartName -ine 'NT AUTHORITY\LocalService' -or $app.State -ne 'Running') {
    throw 'The expected private classroom service is not running from this deployment under LocalService.'
}
if ($null -ne (Get-CimInstance -ClassName Win32_Service -Filter "Name='EmpvcHttps'")) { throw 'EmpvcHttps already exists; this enablement script does not overwrite or restart existing services.' }
foreach ($name in @('EMPVC-HTTP', 'EMPVC-HTTPS')) {
    if ($null -ne (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)) { throw "Firewall rule $name already exists; inspect its ownership before continuing." }
}
if (@(Get-NetTCPConnection -State Listen -LocalPort 80,443 -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Port 80 or 443 is occupied; do not stop unrelated services.' }
$records = @(Resolve-DnsName -Name $ClassroomDomain -Type A -DnsOnly -ErrorAction Stop | Where-Object { $_.Type -eq 'A' })
if ($records.Count -eq 0 -or @($records | Where-Object { $_.IPAddress -ne '47.96.236.36' }).Count -gt 0) {
    throw 'The classroom A record must resolve only to the approved server 47.96.236.36 before public enablement.'
}
$ipv6Records = @(Resolve-DnsName -Name $ClassroomDomain -Type AAAA -DnsOnly -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'AAAA' })
if ($ipv6Records.Count -gt 0) { throw 'IPv6 is not configured for this deployment. Review any classroom AAAA records before public enablement.' }
$Caddy = Join-Path $Root 'runtime\caddy\caddy.exe'
$WrapperSource = Join-Path $Root 'runtime\winsw\WinSW-x64.exe'
foreach ($path in @($Caddy, $WrapperSource, $expectedApp, (Join-Path $ServiceDirectory 'EmpvcClassroom.xml'),
    (Join-Path $PSScriptRoot 'EmpvcHttps.xml'), (Join-Path $PSScriptRoot 'Caddyfile.windows'))) { Assert-RegularFile $path }
foreach ($item in @(Get-ChildItem -LiteralPath $Root -Force -Recurse)) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Review deployment reparse points before continuing.' }
}
$winSwVersion = (Get-Item -LiteralPath $WrapperSource).VersionInfo.ProductVersion
if ($winSwVersion -notmatch '^2\.') { throw 'Use the verified WinSW 2.x executable for these XML templates.' }
Invoke-Checked $Caddy @('version')
Wait-BackendHealthy

foreach ($directory in @('caddy-data', 'logs\https', 'temp')) {
    $path = Join-Path $Root $directory
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
    elseif (-not (Get-Item -LiteralPath $path).PSIsContainer) { throw "Expected a directory: $path" }
}
Copy-Item -LiteralPath $WrapperSource -Destination (Join-Path $ServiceDirectory 'EmpvcHttps.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'EmpvcHttps.xml') -Destination (Join-Path $ServiceDirectory 'EmpvcHttps.xml') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Caddyfile.windows') -Destination (Join-Path $ServiceDirectory 'Caddyfile') -Force
Set-PrivateTreePermissions
$oldDomain = [Environment]::GetEnvironmentVariable('CLASSROOM_DOMAIN', 'Process')
try {
    $env:CLASSROOM_DOMAIN = $ClassroomDomain
    Invoke-Checked $Caddy @('validate', '--config', (Join-Path $ServiceDirectory 'Caddyfile'), '--adapter', 'caddyfile')
} finally { [Environment]::SetEnvironmentVariable('CLASSROOM_DOMAIN', $oldDomain, 'Process') }
# ACL/config work may take time; recheck before registering public service.
Wait-BackendHealthy
$HttpsWrapper = Join-Path $ServiceDirectory 'EmpvcHttps.exe'
Invoke-Checked $HttpsWrapper @('install')
New-NetFirewallRule -Name 'EMPVC-HTTP' -DisplayName 'EMPVC HTTP certificate validation and HTTPS redirect' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80 -Program $Caddy -Profile Any | Out-Null
New-NetFirewallRule -Name 'EMPVC-HTTPS' -DisplayName 'EMPVC HTTPS classroom' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Program $Caddy -Profile Any | Out-Null
Invoke-Checked $HttpsWrapper @('start')
Write-Host 'HTTPS service start requested after private health, DNS, filing confirmation, and exposure authorization checks.'
Write-Host "Verify normal public certificate validation at https://$ClassroomDomain/teacher.html before distributing the service address."
