#requires -Version 5.1
#requires -RunAsAdministrator
<#
Frozen 2026-10-21 classroom sync update; completed on 2026-10-22. Stage never stops the live service.
Apply preserves the old program/dependencies and a stopped-service SQLite backup.
No DNS, firewall, HTTPS, runtime, service registration, or real .env changes.
An interrupted Apply is recovered by running Apply again: recovery only, not retry.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Stage', 'Apply', 'Rollback')][string]$Phase,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedHelperSha256,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedLiveCloudSha256,
    [switch]$ResumePreparedStage,
    [switch]$ConfirmRestoreDatabaseSnapshot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = 'C:\EMPVC'
$UpdateRoot = 'C:\EMPVC\updates\20261021-classroom-release'
$Release = Join-Path $UpdateRoot 'release'
$Helper = Join-Path $UpdateRoot 'cloud-candidate-check.mjs'
$Zip = Join-Path $UpdateRoot 'classroom-server-candidate.zip'
$ZipHash = '6b988c8fd55a8781cdb4de609d05144aea7d7cd0874c9f5587d381096d5b9335'
$ManifestHash = 'a1c37957d14b670de4151700cb67d6ec5feff0e4dbd495a3e29ae6fd0da14e54'
$PinnedHelperSha256 = 'c8688780094930e6895f9e2d96a042c329f887818e5a1ce5aafeab209942193d'
$Node = Join-Path $Root 'runtime\node\node.exe'
$Wrapper = Join-Path $Root 'services\EmpvcClassroom.exe'
$ServiceXml = Join-Path $Root 'services\EmpvcClassroom.xml'
$Database = Join-Path $Root 'data\classroom.sqlite'
$StageStatePath = Join-Path $UpdateRoot 'stage-state.json'
$JournalDirectory = Join-Path $UpdateRoot 'journal'
$RollbackProgram = Join-Path $UpdateRoot 'rollback-program'
$ActiveRecord = Join-Path $Root 'active-classroom-release-20261021.json'
$Entries = @('SERVER-RELEASE.md', 'dist', 'package-lock.json', 'package.json', 'public', 'requirements', 'scripts', 'server', 'src', 'release-manifest.json', 'node_modules')
$OriginalHashes = [ordered]@{}
$script:Step = 'preflight'
$transactionLock = $null

function Assert-SafePath([string]$Path, [bool]$MustExist = $true) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -and
        -not $full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped the fixed deployment root.' }
    $current = 'C:\'
    foreach ($part in $full.Substring(3).Split('\')) {
        $current = Join-Path $current $part
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not permitted.' }
        } elseif ($MustExist) { throw 'Required deployment path is absent.' }
    }
    return $full
}
function Assert-File([string]$Path) {
    [void](Assert-SafePath $Path)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer) { throw 'Expected a regular file.' }
}
function Hash-File([string]$Path) {
    Assert-File $Path
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Assert-Hash([string]$Path, [string]$Expected) {
    if ((Hash-File $Path) -cne $Expected.ToLowerInvariant()) { throw 'A pinned file digest did not match.' }
}
function Set-FileAcl([string]$Path, [string]$Mode) {
    [void](Assert-SafePath $Path)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer) {
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    } else { $acl = New-Object Security.AccessControl.FileSecurity; $inheritance = [Security.AccessControl.InheritanceFlags]::None }
    $admins = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $acl.SetOwner($admins); $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @('S-1-5-32-544', 'S-1-5-18')) {
        $identity = New-Object Security.Principal.SecurityIdentifier($sid)
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)))
    }
    if ($Mode -ne 'private') {
        $rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute
        if ($Mode -eq 'database') { $rights = [Security.AccessControl.FileSystemRights]::Modify }
        $identity = New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, $rights,
            $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function New-PrivateDirectory([string]$Path) {
    [void](Assert-SafePath $Path $false)
    if (Test-Path -LiteralPath $Path) {
        if (-not (Get-Item -LiteralPath $Path -Force).PSIsContainer) { throw 'Expected a directory.' }
    } else { [void](New-Item -ItemType Directory -Path $Path) }
    Set-FileAcl $Path 'private'
}
function Walk-Tree([string]$Path) {
    [void](Assert-SafePath $Path)
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Path)
    while ($pending.Count -gt 0) {
        $current = $pending.Pop()
        $item = Get-Item -LiteralPath $current -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in an update/program tree.' }
        Write-Output $item
        if ($item.PSIsContainer) {
            foreach ($child in @(Get-ChildItem -LiteralPath $current -Force)) { $pending.Push($child.FullName) }
        }
    }
}
function Fingerprint-Entry([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { [void](Assert-SafePath $Path $false); return 'ABSENT' }
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($item in @(Walk-Tree $Path | Sort-Object FullName)) {
        $relative = $item.FullName.Substring($Path.Length)
        if ($item.PSIsContainer) { [void]$lines.Add('D:' + $relative) }
        else { [void]$lines.Add('F:' + $relative + ':' + (Hash-File $item.FullName)) }
    }
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}
function Get-ProgramFingerprint {
    $result = [ordered]@{}
    foreach ($entry in $Entries) { $result[$entry] = Fingerprint-Entry (Join-Path $Root $entry) }
    return [pscustomobject]$result
}
function Get-DatabaseFingerprint {
    return [pscustomobject]@{
        main = Fingerprint-Entry $Database
        wal = Fingerprint-Entry ($Database + '-wal')
        shm = Fingerprint-Entry ($Database + '-shm')
    }
}
function Write-NewJson([string]$Path, $Value) {
    [void](Assert-SafePath $Path $false)
    if (Test-Path -LiteralPath $Path) { throw 'Refusing to overwrite an existing state file.' }
    $temporary = $Path + '.partial-' + [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    Set-FileAcl $temporary 'private'
    [IO.File]::Move($temporary, $Path)
}
function Save-Journal($State) {
    New-PrivateDirectory $JournalDirectory
    $State.sequence = [int]$State.sequence + 1
    $State.step = $script:Step
    $State.updatedUtc = [DateTime]::UtcNow.ToString('o')
    Write-NewJson (Join-Path $JournalDirectory ('apply-state.{0:D6}.json' -f $State.sequence)) $State
}
function Read-LastJournal {
    if (-not (Test-Path -LiteralPath $JournalDirectory)) { return $null }
    [void](Assert-SafePath $JournalDirectory)
    $files = @(Get-ChildItem -LiteralPath $JournalDirectory -File | Where-Object { $_.Name -match '^apply-state\.\d{6}\.json$' } | Sort-Object Name)
    if ($files.Count -eq 0) { return $null }
    $latest = $files[$files.Count - 1]
    Assert-File $latest.FullName
    return (Get-Content -LiteralPath $latest.FullName -Raw | ConvertFrom-Json)
}
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    Assert-File $Program
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Program @Arguments 2>&1)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw 'A reviewed native command failed; raw output was suppressed.' }
    return $output
}
function Invoke-InlineNode([string]$JavaScript) {
    # PS 5.1 native invocation can strip double quotes in -e source. Only the
    # constant single-quoted Base64 bootstrap is passed through that boundary.
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($JavaScript))
    $bootstrap = "eval(Buffer.from('$encoded','base64').toString('utf8'))"
    return @(Invoke-Checked $Node @('--no-warnings', '-e', $bootstrap))
}
function Read-SafeXml([string]$Path) {
    Assert-File $Path
    $settings = New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit; $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($Path, $settings)
    try { $xml = New-Object Xml.XmlDocument; $xml.XmlResolver = $null; $xml.Load($reader); return $xml }
    finally { $reader.Dispose() }
}
function Assert-Service([bool]$Running, [bool]$RequireHttpsRunning = $true) {
    $https = Get-CimInstance Win32_Service -Filter "Name='EmpvcHttps'"
    if ($null -eq $https -or ($RequireHttpsRunning -and $https.State -ne 'Running') -or $https.StartName -ine 'NT AUTHORITY\LocalService' -or $https.PathName.Trim().Trim('"') -ine (Join-Path $Root 'services\EmpvcHttps.exe')) { throw 'Expected existing HTTPS service ownership/state.' }
    $service = Get-CimInstance Win32_Service -Filter "Name='EmpvcClassroom'"
    if ($null -eq $service -or ($service.PathName.Trim() -ine $Wrapper -and $service.PathName.Trim() -ine ('"' + $Wrapper + '"')) -or
        $service.StartName -ine 'NT AUTHORITY\LocalService' -or $service.StartMode -ne 'Auto') { throw 'Unexpected classroom service ownership/account/startup.' }
    if ($Running -and $service.State -ne 'Running') { throw 'The existing service must be running.' }
    Assert-Hash $Wrapper '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'
    $xml = Read-SafeXml $ServiceXml
    $expected = [ordered]@{
        '/service/id' = 'EmpvcClassroom'; '/service/executable' = $Node
        '/service/arguments' = '"C:\EMPVC\server\cloud.js"'; '/service/workingdirectory' = $Root
        '/service/startmode' = 'Automatic'; '/service/serviceaccount/domain' = 'NT AUTHORITY'
        '/service/serviceaccount/user' = 'LocalService'
        '/service/env[@name="NODE_ENV"]/@value' = 'production'
        '/service/env[@name="PUBLIC_ORIGIN"]/@value' = 'https://class.empfreeimpro.xyz'
        '/service/env[@name="CLOUD_BIND"]/@value' = '127.0.0.1'
        '/service/env[@name="CLOUD_PORT"]/@value' = '3000'
        '/service/env[@name="FREE_IMPRO_DB"]/@value' = $Database
        '/service/env[@name="DIST_DIRECTORY"]/@value' = 'C:\EMPVC\dist'
        '/service/env[@name="TEMP"]/@value' = 'C:\EMPVC\temp'
        '/service/env[@name="TMP"]/@value' = 'C:\EMPVC\temp'
    }
    foreach ($entry in $expected.GetEnumerator()) {
        if ($xml.SelectNodes($entry.Key).Count -ne 1) { throw 'Unexpected core service XML setting count.' }
        $setting = $xml.SelectSingleNode($entry.Key)
        $actual = if ($entry.Key.EndsWith('/@value')) { [string]$setting.Value } else { [string]$setting.InnerText }
        if ($actual -cne $entry.Value) { throw 'Unexpected core service XML setting.' }
    }
    $adminCount = $xml.SelectNodes('/service/env[@name="ADMIN_ORIGIN"]/@value').Count
    if ($adminCount -gt 1 -or ($adminCount -eq 1 -and $xml.SelectSingleNode('/service/env[@name="ADMIN_ORIGIN"]/@value').Value -cne 'https://admin.empfreeimpro.xyz')) { throw 'Unexpected administrator origin.' }
    # Existing optional production provider values stay in this XML and are never copied, displayed or changed.
    foreach ($name in @('FREE_IMPRO_DB', 'DIST_DIRECTORY', 'PUBLIC_ORIGIN', 'CLOUD_BIND', 'CLOUD_PORT')) { if (@($xml.SelectNodes('/service/env[@name="' + $name + '"]')).Count -ne 1) { throw 'Ambiguous critical environment variable.' } }
    $version = @(Invoke-Checked $Node @('--version'))
    if ($version.Count -ne 1 -or [string]$version[0] -cne 'v24.21.0') { throw 'This update requires the already verified Node 24.21.0 runtime.' }
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 })
    if ($Running) {
        if ($listeners.Count -eq 0) { throw 'Private listener is absent.' }
        foreach ($listener in $listeners) {
            if ($listener.LocalAddress -ne '127.0.0.1') { throw 'Non-loopback listener detected.' }
            $processes = @(Get-CimInstance Win32_Process -Filter ('ProcessId=' + [uint32]$listener.OwningProcess) -Property ProcessId,ParentProcessId,ExecutablePath)
            if ($processes.Count -ne 1 -or $processes[0].ExecutablePath -ine $Node -or $processes[0].ParentProcessId -ne $service.ProcessId) { throw 'Listener is not the service Node child.' }
        }
    }
    return $service
}
function Stop-PrivateService {
    # Stopping the backend also stops its existing dependent HTTPS service.
    $service = Assert-Service $false $false
    if ($service.State -ne 'Stopped') { [void](Invoke-Checked $Wrapper @('stopwait')) }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $current = Get-CimInstance Win32_Service -Filter "Name='EmpvcClassroom'"
        $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 })
        if ($current.State -eq 'Stopped' -and $listeners.Count -eq 0) { return }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Service/listener did not fully stop; no program/database replacement is safe.'
}
function Start-ExistingHttps($ProtectedConfig) {
    Assert-ProtectedConfig $ProtectedConfig
    # WinSW reports Running before its Node child necessarily binds the socket.
    # Wait for the private backend before checking listener ownership or starting HTTPS.
    $backendDeadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $backend = Probe '/api/health'
        if ($backend.status -eq 200 -and $backend.healthy) { break }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $backendDeadline)
    if ($backend.status -ne 200 -or -not $backend.healthy) { throw 'Backend did not become ready before HTTPS restart.' }
    [void](Assert-Service $true $false)
    $https = Get-CimInstance Win32_Service -Filter "Name='EmpvcHttps'"
    if ($https.State -eq 'Stopped') {
        [void](Invoke-Checked (Join-Path $Root 'services\EmpvcHttps.exe') @('start'))
    } elseif ($https.State -ne 'Running') { throw 'Existing HTTPS service is in an unexpected transition.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if ((Get-Service EmpvcHttps).Status -eq 'Running') { [void](Assert-Service $true); return }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Existing HTTPS service did not restart after the backend.'
}
function Probe([string]$Path, [string]$HostName = 'class.empfreeimpro.xyz', [string]$Origin = '') {
    $response = $null
    try {
        $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:3000' + $Path)
        $request.Host = $HostName; $request.Proxy = $null; $request.AllowAutoRedirect = $false
        $request.Timeout = 3000; $request.ReadWriteTimeout = 3000
        if ($Origin) { $request.Headers['Origin'] = $Origin }
        try { $response = $request.GetResponse() } catch [Net.WebException] {
            if ($null -eq $_.Exception.Response) { throw }; $response = $_.Exception.Response
        }
        $healthy = $false
        if ($Path -eq '/api/health' -and [int]$response.StatusCode -eq 200) {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            try {
                $buffer = New-Object char[] 4097; $length = 0
                do { $read = $reader.Read($buffer, $length, $buffer.Length - $length); $length += $read } while ($read -gt 0 -and $length -lt $buffer.Length)
                if ($length -gt 4096) { throw 'Health body is too large.' }
                $body = (New-Object string($buffer, 0, $length)) | ConvertFrom-Json
                $healthy = ($body.ok -is [bool] -and $body.ok -eq $true)
            } finally { $reader.Dispose() }
        }
        return [pscustomobject]@{ status = [int]$response.StatusCode; healthy = $healthy; contentType = $response.ContentType }
    } catch { return [pscustomobject]@{ status = 0; healthy = $false; contentType = '' } }
    finally { if ($null -ne $response) { $response.Dispose() } }
}
function Assert-InternalAcceptance {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $response = Probe '/api/health'
        if ($response.status -eq 200 -and $response.healthy) { break }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $response.healthy) { throw 'Internal liveness did not pass.' }
    $adminNodes = @((Read-SafeXml $ServiceXml).SelectNodes('/service/env[@name="ADMIN_ORIGIN"]/@value'))
    if ($adminNodes.Count -eq 1) {
        if ((Probe '/' 'admin.empfreeimpro.xyz').status -ne 302 -or (Probe '/api/admin/console' 'admin.empfreeimpro.xyz').status -ne 200 -or (Probe '/api/health' 'admin.empfreeimpro.xyz').status -ne 404 -or (Probe '/api/admin/me' 'admin.empfreeimpro.xyz').status -ne 401) { throw 'Administrator host acceptance failed.' }
    } elseif ((Probe '/api/admin/console' 'admin.empfreeimpro.xyz').status -ne 421) { throw 'Disabled administrator host became reachable.' }
    [void](Assert-Service $true)
    foreach ($path in @('/', '/teacher.html')) {
        $page = Probe $path
        if ($page.status -ne 200 -or $page.contentType -notmatch '^text/html(?:;|$)') { throw 'Internal page acceptance failed.' }
    }
    if ((Probe '/api/health' 'readiness.invalid').status -ne 421 -or
        (Probe '/api/health' 'class.empfreeimpro.xyz' 'https://readiness.invalid').status -ne 403) { throw 'Host/Origin rejection failed.' }
    foreach ($path in @('/admin.html', '/api/admin', '/api/admin/status', '/mcp/images', '/api/image-mcp-save-local',
        '/api/teacher/image-mcp-save-local', '/api/student/image-mcp-save-local', '/data/classroom.sqlite', '/.env', '/deployment.json')) {
        if ((Probe $path).status -ne 404) { throw 'Restricted-route rejection failed.' }
    }
}
function Backup-LiveDatabase([string]$Directory) {
    New-PrivateDirectory $Directory
    Assert-Hash (Join-Path $Root 'scripts\cloud-backup.js') $OriginalHashes['scripts\cloud-backup.js']
    $backupModule = (Join-Path $Root 'scripts\cloud-backup.js') | ConvertTo-Json -Compress
    $dbJson = $Database | ConvertTo-Json -Compress
    $targetJson = $Directory | ConvertTo-Json -Compress
    $javascript = "(async()=>{const {pathToFileURL}=require('node:url');const {backupClassroom}=await import(pathToFileURL($backupModule).href);const backupPath=await backupClassroom({dbPath:$dbJson,directory:$targetJson});console.log(JSON.stringify({backupPath}));})().catch(()=>{process.exitCode=1;});"
    $output = @(Invoke-InlineNode $javascript)
    if ($output.Count -ne 1) { throw 'Backup did not return the expected bounded result.' }
    $result = [string]$output[0] | ConvertFrom-Json
    if (-not ([string]$result.backupPath).StartsWith($Directory + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path escaped its private directory.' }
    Assert-File $result.backupPath
    Set-FileAcl $result.backupPath 'private'
    return [string]$result.backupPath
}
function Assert-PackagePath([string]$Name) {
    if ($Name -notmatch '^(?:\.env\.example|SERVER-RELEASE\.md|package(?:-lock)?\.json|src/rhythm-data\.js|(?:deploy/windows|dist|docs|public|requirements|scripts|server)/[A-Za-z0-9._/-]+)$' -or
        $Name.Split('/') -contains '.' -or $Name.Split('/') -contains '..' -or $Name.Contains('//')) { throw 'Unapproved ZIP/manifest path.' }
}
function Get-Manifest([string]$Directory) {
    $path = Join-Path $Directory 'release-manifest.json'
    Assert-Hash $path $ManifestHash
    $manifest = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if (@($manifest.files.PSObject.Properties).Count -ne 56 -or $manifest.baseCommit -cne 'a9b7405ce04a8831b095b1a8d7696eb6feb80e21' -or
        $manifest.publicOrigin -cne 'https://class.empfreeimpro.xyz' -or $manifest.sourceSnapshotSha256 -cne '2da5266f55038a9a36533cdd9c6b2afbf4e6c33a9ecb4deca820c8ea60d4ac26') { throw 'Frozen manifest identity/count did not match.' }
    foreach ($entry in $manifest.files.PSObject.Properties) { Assert-PackagePath $entry.Name; if ($entry.Value -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid manifest digest.' } }
    return $manifest
}
function Assert-FrozenRelease([string]$Directory) {
    $manifest = Get-Manifest $Directory
    $expected = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    [void]$expected.Add('release-manifest.json')
    foreach ($entry in $manifest.files.PSObject.Properties) {
        if (-not $expected.Add($entry.Name)) { throw 'Case-insensitive manifest name collision.' }
        Assert-Hash (Join-Path $Directory $entry.Name.Replace('/', '\')) $entry.Value
    }
    foreach ($entry in @(Get-ChildItem -LiteralPath $Directory -Force)) {
        if ($entry.Name -eq 'node_modules') { [void](Assert-SafePath $entry.FullName); continue }
        foreach ($item in @(Walk-Tree $entry.FullName)) {
            if (-not $item.PSIsContainer) {
                $relative = $item.FullName.Substring($Directory.Length + 1).Replace('\', '/')
                if (-not $expected.Contains($relative)) { throw 'Unexpected file in the frozen release tree.' }
            }
        }
    }
    return $manifest
}
function Prepare-Package {
    if (-not (Test-Path -LiteralPath $Zip)) {
        $partDirectory = Join-Path $UpdateRoot 'cloud-upload-parts'
        $partsFile = Join-Path $partDirectory 'parts.json'
        Assert-File $partsFile
        $parts = Get-Content -LiteralPath $partsFile -Raw | ConvertFrom-Json
        if ($parts.Count -ne 14) { throw 'Unexpected upload-part count.' }
        $partial = $Zip + '.assembling-' + [Guid]::NewGuid().ToString('N')
        $output = [IO.File]::Open($partial, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            for ($i = 0; $i -lt $parts.Count; $i++) {
                $name = 'candidate.part{0:D3}.bin' -f $i
                if ($parts[$i].name -cne $name -or $parts[$i].size -le 0 -or $parts[$i].size -gt 24000 -or $parts[$i].sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid upload-parts metadata.' }
                $path = Join-Path $partDirectory $name
                Assert-Hash $path $parts[$i].sha256
                if ((Get-Item -LiteralPath $path).Length -ne $parts[$i].size) { throw 'Upload-part size mismatch.' }
                $input = [IO.File]::OpenRead($path)
                try { $input.CopyTo($output) } finally { $input.Dispose() }
            }
        } finally { $output.Dispose() }
        Set-FileAcl $partial 'private'
        Assert-Hash $partial $ZipHash
        [IO.File]::Move($partial, $Zip)
    }
    Assert-Hash $Zip $ZipHash
    if (Test-Path -LiteralPath $Release) { throw 'Release directory already exists; preserve and inspect the previous Stage attempt before retrying.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        if ($archive.Entries.Count -ne 57) { throw 'Unexpected frozen archive file count.' }
        $manifestEntry = $null; $total = [int64]0
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -ceq 'release-manifest.json') { $manifestEntry = $entry }
            else { Assert-PackagePath $entry.FullName }
            if (-not $names.Add($entry.FullName) -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'ZIP name collision or symlink.' }
            $total += $entry.Length
            if ($entry.Length -gt 5242880 -or $total -gt 16777216) { throw 'Unexpected expanded package size.' }
        }
        if ($null -eq $manifestEntry -or $manifestEntry.Length -gt 1048576) { throw 'Missing/oversized manifest.' }
        $stream = $manifestEntry.Open(); $hash = [Security.Cryptography.SHA256]::Create()
        try { $digest = ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
        finally { $hash.Dispose(); $stream.Dispose() }
        if ($digest -cne $ManifestHash) { throw 'Embedded manifest hash mismatch.' }
        New-PrivateDirectory $Release
        foreach ($entry in $archive.Entries) {
            $destination = Join-Path $Release $entry.FullName.Replace('/', '\')
            [void](Assert-SafePath $destination $false)
            $parent = [IO.Path]::GetDirectoryName($destination)
            if (-not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
            $input = $entry.Open(); $output = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $input.CopyTo($output) } finally { $input.Dispose(); $output.Dispose() }
        }
    } finally { $archive.Dispose() }
    [void](Assert-FrozenRelease $Release)
}
function Assert-StagedIdentity($StageState) {
    if ($StageState.schema -ne 1 -or $StageState.zipSha256 -cne $ZipHash -or $StageState.manifestSha256 -cne $ManifestHash -or
        $StageState.helperSha256 -ine $ExpectedHelperSha256 -or $StageState.releaseDirectory -cne $Release) { throw 'Stage identity mismatch.' }
    Assert-Hash $Zip $ZipHash; Assert-Hash $Helper $ExpectedHelperSha256
    [void](Assert-FrozenRelease $Release)
    Assert-Hash $Node $StageState.nodeSha256; Assert-ProtectedConfig $StageState.protectedConfig
}
function Assert-NoStageDrift($StageState) {
    foreach ($entry in $OriginalHashes.GetEnumerator()) { Assert-Hash (Join-Path $Root $entry.Key) $entry.Value }
    $current = Get-ProgramFingerprint
    foreach ($entry in $Entries) {
        if ($current.PSObject.Properties[$entry].Value -cne $StageState.oldProgram.PSObject.Properties[$entry].Value) { throw 'Live program/dependencies changed since Stage.' }
    }
    Assert-ProtectedConfig $StageState.protectedConfig
    # Normal classroom writes after Stage are allowed. Apply takes and tests a fresh stopped-service snapshot.
}
function Rollback-Apply($State) {
    $script:Step = 'rollback-stop'; $State.status = 'Recovering'; Save-Journal $State
    Assert-ProtectedConfig $State.protectedConfig
    Stop-PrivateService
    if ($State.swapStarted) {
        if (-not $State.stoppedBackupPath) { throw 'No stopped-service rollback backup is recorded.' }
        [void](Assert-SafePath $State.stoppedBackupPath)
        if (-not ([string]$State.stoppedBackupPath).StartsWith((Join-Path $UpdateRoot 'backups-stopped') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Rollback backup escaped its fixed directory.' }
        Assert-Hash $State.stoppedBackupPath $State.stoppedBackupSha256
        $recovery = Join-Path $UpdateRoot ('recoverable-new-state-' + [Guid]::NewGuid().ToString('N'))
        New-PrivateDirectory $recovery
        $State.recoveryDirectories = @($State.recoveryDirectories) + @($recovery)
        $script:Step = 'rollback-preserve-current-database'; Save-Journal $State
        foreach ($suffix in @('', '-wal', '-shm')) {
            $path = $Database + $suffix
            if (Test-Path -LiteralPath $path) {
                Assert-File $path
                $destination = Join-Path $recovery ('classroom.sqlite' + $suffix)
                [IO.File]::Move($path, $destination)
                Set-FileAcl $destination 'private'
            }
        }
        # All current DB components are preserved, never discarded or overwritten.
        $script:Step = 'rollback-restore-stopped-snapshot'; Save-Journal $State
        [IO.File]::Copy($State.stoppedBackupPath, $Database, $false)
        Set-FileAcl $Database 'database'
        foreach ($entry in $Entries) {
            $live = Join-Path $Root $entry
            $old = Join-Path $RollbackProgram $entry
            $original = $State.oldProgram.PSObject.Properties[$entry].Value
            if (Test-Path -LiteralPath $old) {
                [void](Assert-SafePath $old)
                if (Test-Path -LiteralPath $live) { [void](Assert-SafePath $live); Move-Item -LiteralPath $live -Destination (Join-Path $recovery ('program-' + $entry)) }
                Move-Item -LiteralPath $old -Destination $live
            } elseif ($original -eq 'ABSENT') {
                if (Test-Path -LiteralPath $live) { [void](Assert-SafePath $live); Move-Item -LiteralPath $live -Destination (Join-Path $recovery ('program-' + $entry)) }
            } elseif ((Fingerprint-Entry $live) -cne $original) { throw 'A previously present program entry is not recoverable; leave the service stopped.' }
            if ((Fingerprint-Entry $live) -cne $original) { throw 'Restored old program fingerprint mismatch; leave the service stopped.' }
        }
    } else {
        foreach ($entry in $OriginalHashes.GetEnumerator()) { Assert-Hash (Join-Path $Root $entry.Key) $entry.Value }
    }
    $script:Step = 'rollback-start-original'; Save-Journal $State
    [void](Invoke-Checked $Wrapper @('start'))
    Start-ExistingHttps $State.protectedConfig
    Assert-InternalAcceptance
    $State.status = 'RolledBack'; $script:Step = 'rollback-complete'; Save-Journal $State
    Write-Output 'Original backend restored and internally accepted. New database/program state preserved; existing HTTPS and administrator configuration retained.'
}

function Get-ProtectedConfig {
    $result = [ordered]@{}
    foreach ($relative in @('services\EmpvcClassroom.xml', 'services\Caddyfile', 'services\EmpvcHttps.xml', 'services\EmpvcClassroom.exe', 'services\EmpvcHttps.exe', 'runtime\caddy\caddy.exe')) { $result[$relative] = Hash-File (Join-Path $Root $relative) }
    return [pscustomobject]$result
}
function Assert-ProtectedConfig($Expected) {
    foreach ($entry in $Expected.PSObject.Properties) { Assert-Hash (Join-Path $Root $entry.Name) $entry.Value }
}
function Restore-OriginalHashes($Expected) {
    $script:OriginalHashes = [ordered]@{}
    foreach ($entry in $Expected.PSObject.Properties) { $script:OriginalHashes[$entry.Name] = [string]$entry.Value }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Run on the existing Windows classroom server only.' }
    if ($ResumePreparedStage -and $Phase -ne 'Stage') { throw 'Prepared-stage resume is only valid for Stage.' }
    [void](Assert-SafePath $Root)
    [void](Assert-SafePath $UpdateRoot)
    [void](Assert-SafePath $Helper)
    if ($ExpectedHelperSha256.ToLowerInvariant() -cne $PinnedHelperSha256) { throw 'Helper pin parameter does not match this reviewed update.' }
    Assert-Hash $Helper $ExpectedHelperSha256
    $transactionLock = [IO.File]::Open((Join-Path $UpdateRoot 'transaction.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $lastJournal = Read-LastJournal
    if ($Phase -eq 'Rollback') {
        if (-not $ConfirmRestoreDatabaseSnapshot -or $null -eq $lastJournal -or $lastJournal.status -ne 'Applied') { throw 'Rollback requires an Applied journal and explicit database snapshot confirmation.' }
        if ($lastJournal.zipSha256 -cne $ZipHash -or $lastJournal.helperSha256 -ine $PinnedHelperSha256 -or $lastJournal.rollbackProgramDirectory -cne $RollbackProgram) { throw 'Rollback identity mismatch.' }
        Restore-OriginalHashes $lastJournal.oldKnownHashes
        Rollback-Apply $lastJournal
        exit 0
    }
    if ($Phase -eq 'Apply' -and $null -ne $lastJournal) {
        if ($lastJournal.status -in @('Applied', 'RolledBack')) { throw 'This update already completed; automatic retry is refused.' }
        if ($lastJournal.zipSha256 -cne $ZipHash -or $lastJournal.manifestSha256 -cne $ManifestHash -or
            $lastJournal.helperSha256 -ine $ExpectedHelperSha256 -or $lastJournal.rollbackProgramDirectory -cne $RollbackProgram) { throw 'Recovery journal identity mismatch.' }
        Restore-OriginalHashes $lastJournal.oldKnownHashes
        try { Rollback-Apply $lastJournal } catch { $lastJournal.status = 'RollbackFailed'; Save-Journal $lastJournal; throw 'Recovery incomplete; leave all preserved files intact for an operator.' }
        exit 1
    }
    if ($Phase -eq 'Stage') {
        Assert-Hash (Join-Path $Root 'server\cloud.js') $ExpectedLiveCloudSha256
        foreach ($relative in @('server\cloud.js', 'server\app.js', 'scripts\cloud-backup.js')) { $OriginalHashes[$relative] = Hash-File (Join-Path $Root $relative) }
    } else {
        Assert-File $StageStatePath
        $initialStage = Get-Content -LiteralPath $StageStatePath -Raw | ConvertFrom-Json
        Restore-OriginalHashes $initialStage.oldKnownHashes
        if ($ExpectedLiveCloudSha256.ToLowerInvariant() -cne $OriginalHashes['server\cloud.js']) { throw 'Apply live baseline parameter differs from Stage.' }
    }
    [void](Assert-Service $true)
    foreach ($entry in $OriginalHashes.GetEnumerator()) { Assert-Hash (Join-Path $Root $entry.Key) $entry.Value }
    Assert-InternalAcceptance
    if ($Phase -eq 'Stage') {
        if (Test-Path -LiteralPath $StageStatePath) { throw 'Stage was already completed; do not overwrite its evidence.' }
        $protectedConfigBefore = Get-ProtectedConfig
        $script:Step = 'stage-protect-update-directory'; Set-FileAcl $UpdateRoot 'private'
        $script:Step = 'stage-verify-extract-frozen-package'
        if ($ResumePreparedStage) {
            # Only reuse the private, fully prepared candidate retained after
            # the verified Windows live-database fingerprint failure.
            Assert-Hash $Zip $ZipHash
            [void](Assert-FrozenRelease $Release)
            Assert-File (Join-Path $Release 'node_modules\.package-lock.json')
            foreach ($name in @('empty-npm-userconfig', 'empty-npm-globalconfig')) {
                $path = Join-Path $UpdateRoot $name
                Assert-File $path
                if ((Get-Item -LiteralPath $path).Length -ne 0) { throw 'Prepared NPM configuration is not empty.' }
            }
        } else { Prepare-Package }
        $script:Step = 'stage-production-dependencies'
        # PowerShell 5.1 cannot deserialize the package-lock packages[''] key.
        # Node parses the immutable lockfile and retains the official-registry gate.
        $lockPath = (Join-Path $Release 'package-lock.json') | ConvertTo-Json -Compress
        $lockCheck = "const fs=require('node:fs');const lock=JSON.parse(fs.readFileSync($lockPath,'utf8'));if(!lock.packages||typeof lock.packages!=='object'||Array.isArray(lock.packages))throw Error('Invalid package lock');for(const item of Object.values(lock.packages)){if(item.resolved!=null&&(typeof item.resolved!=='string'||!item.resolved.startsWith('https://registry.npmjs.org/')))throw Error('Non-official registry');}console.log('LOCK_REGISTRY_PASS');"
        $lockResult = @(Invoke-InlineNode $lockCheck)
        if ($lockResult.Count -ne 1 -or [string]$lockResult[0] -cne 'LOCK_REGISTRY_PASS') { throw 'Immutable dependency registry check failed.' }
        if ($ResumePreparedStage) {
            # npm ci and per-file program ACLs completed before the retained
            # backup/drill. Recheck every installed package against the frozen
            # lock and its actual package.json without downloading it again.
            $releaseJson = $Release | ConvertTo-Json -Compress
            $installedCheck = "const fs=require('node:fs'),p=require('node:path'),root=$releaseJson;const frozen=JSON.parse(fs.readFileSync(p.join(root,'package-lock.json'),'utf8')),installed=JSON.parse(fs.readFileSync(p.join(root,'node_modules','.package-lock.json'),'utf8'));if(!installed.packages||!Object.keys(installed.packages).length)throw Error('Missing prepared dependencies');for(const [name,item] of Object.entries(installed.packages)){if(!name.startsWith('node_modules/')||name.split('/').some(x=>x==='..'||x==='.')||name.includes(String.fromCharCode(92)))throw Error('Invalid prepared path');const expected=frozen.packages[name];if(!expected||item.dev)throw Error('Unexpected prepared dependency');for(const key of ['version','resolved','integrity'])if(item[key]!==expected[key])throw Error('Prepared dependency differs from frozen lock');if(JSON.parse(fs.readFileSync(p.join(root,name,'package.json'),'utf8')).version!==expected.version)throw Error('Installed version differs');}console.log('PREPARED_DEPENDENCIES_PASS');"
            $installedResult = @(Invoke-InlineNode $installedCheck)
            if ($installedResult.Count -ne 1 -or [string]$installedResult[0] -cne 'PREPARED_DEPENDENCIES_PASS') { throw 'Prepared dependency verification failed.' }
            Write-Output 'Prepared candidate and every installed dependency match the frozen package lock.'
        } else {
            $npmConfig = Join-Path $UpdateRoot 'empty-npm-userconfig'
            $npmGlobal = Join-Path $UpdateRoot 'empty-npm-globalconfig'
            foreach ($path in @($npmConfig, $npmGlobal)) {
                if (Test-Path -LiteralPath $path) { throw 'NPM configuration file already exists; do not reuse unknown configuration.' }
                [IO.File]::WriteAllText($path, ''); Set-FileAcl $path 'private'
            }
            $oldPath = $env:PATH
            Push-Location $Release
            try {
                $env:PATH = (Join-Path $Root 'runtime\node') + ';' + $oldPath
                [void](Invoke-Checked (Join-Path $Root 'runtime\node\npm.cmd') @('ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
                    '--registry=https://registry.npmjs.org/', ('--cache=' + (Join-Path $UpdateRoot 'npm-cache')), ('--userconfig=' + $npmConfig), ('--globalconfig=' + $npmGlobal)))
            } finally { $env:PATH = $oldPath; Pop-Location }
            [void](Assert-FrozenRelease $Release)
            $script:Step = 'stage-protect-candidate-program'
            foreach ($item in @(Walk-Tree $Release)) { Set-FileAcl $item.FullName 'program' }
        }
        [void](Assert-FrozenRelease $Release)
        $script:Step = 'stage-online-consistent-backup'
        $onlineBackup = Backup-LiveDatabase (Join-Path $UpdateRoot 'backups-online')
        $script:Step = 'stage-isolated-restore-and-synthetic-classroom'
        if ($ResumePreparedStage -and (Test-Path -LiteralPath (Join-Path $UpdateRoot 'restore-drill'))) {
            $priorDrill = Join-Path $UpdateRoot 'restore-drill'
            [void](Assert-SafePath $priorDrill)
            $retainedDrill = Join-Path $UpdateRoot ('restore-drill-retained-' + [Guid]::NewGuid().ToString('N'))
            [void](Assert-SafePath $retainedDrill $false)
            Move-Item -LiteralPath $priorDrill -Destination $retainedDrill
        }
        New-PrivateDirectory (Join-Path $UpdateRoot 'restore-drill')
        Push-Location $UpdateRoot
        try { [void](Invoke-Checked $Node @('--no-warnings', $Helper, $Release, $onlineBackup, (Join-Path $UpdateRoot 'restore-drill'))) }
        finally { Pop-Location }
        [void](Assert-Service $true); Assert-InternalAcceptance; Assert-ProtectedConfig $protectedConfigBefore
        Write-Output 'Fresh online backup, isolated restore, preserved rows/BLOBs, composition upload and synchronized read-only stage passed.'
        $script:Step = 'stage-fingerprint-live-program'
        $oldProgramFingerprint = Get-ProgramFingerprint
        Write-Output 'Existing program and dependency fingerprints recorded.'
        $script:Step = 'stage-fingerprint-candidate'
        $candidateFingerprint = Fingerprint-Entry $Release
        Write-Output 'Candidate program and dependency fingerprint recorded.'
        $script:Step = 'stage-record-evidence'
        $state = [pscustomobject][ordered]@{
            schema = 1; phase = 'Staged'; releaseDirectory = $Release; zipSha256 = $ZipHash; manifestSha256 = $ManifestHash
            helperSha256 = $ExpectedHelperSha256.ToLowerInvariant(); nodeSha256 = (Hash-File $Node); serviceXmlSha256 = (Hash-File $ServiceXml)
            protectedConfig = $protectedConfigBefore; oldKnownHashes = [pscustomobject]$OriginalHashes; oldProgram = $oldProgramFingerprint
            # Live SQLite/WAL/SHM files are intentionally locked on Windows and
            # can change during a lesson. Fingerprint the consistent backup
            # whose restore, migration and preserved contents were just tested.
            databaseFingerprint = [pscustomobject]@{ kind = 'consistent-online-backup'; sha256 = (Hash-File $onlineBackup) }
            candidateProgramFingerprint = $candidateFingerprint; onlineBackupPath = $onlineBackup; onlineBackupSha256 = (Hash-File $onlineBackup)
            createdUtc = [DateTime]::UtcNow.ToString('o'); publicExposureUnchanged = $true
        }
        Write-NewJson $StageStatePath $state
        Write-Output 'Stage complete: frozen package and locked production dependencies verified; online backup, isolated restore, long-note submission and read-only stage passed. Existing service and protected configuration unchanged.'
        exit 0
    }
    $script:Step = 'apply-revalidate-stage'
    Assert-File $StageStatePath
    $stageState = Get-Content -LiteralPath $StageStatePath -Raw | ConvertFrom-Json
    Assert-StagedIdentity $stageState
    $script:Step = 'apply-current-program-fingerprint'
    Write-Output 'Verifying current program and dependencies against Stage.'
    Assert-NoStageDrift $stageState
    Write-Output 'Current program is unchanged. Verifying candidate program and dependencies.'
    $script:Step = 'apply-candidate-program-fingerprint'
    if ((Fingerprint-Entry $Release) -cne $stageState.candidateProgramFingerprint) { throw 'Candidate/dependency tree changed after Stage.' }
    if (Test-Path -LiteralPath $RollbackProgram) { throw 'Rollback program directory already exists without a recovery journal.' }
    New-PrivateDirectory $RollbackProgram
    $applyState = [pscustomobject][ordered]@{
        schema = 1; sequence = 0; status = 'Applying'; step = ''; updatedUtc = ''; zipSha256 = $ZipHash; manifestSha256 = $ManifestHash
        helperSha256 = $ExpectedHelperSha256.ToLowerInvariant(); rollbackProgramDirectory = $RollbackProgram; oldProgram = $stageState.oldProgram
        protectedConfig = $stageState.protectedConfig; oldKnownHashes = $stageState.oldKnownHashes
        stoppedBackupPath = ''; stoppedBackupSha256 = ''; swapStarted = $false; recoveryDirectories = @(); publicExposureUnchanged = $true
    }
    $script:Step = 'apply-before-stop'; Save-Journal $applyState
    try {
        Stop-PrivateService
        $script:Step = 'apply-stopped-consistent-backup'
        $applyState.stoppedBackupPath = Backup-LiveDatabase (Join-Path $UpdateRoot 'backups-stopped')
        $applyState.stoppedBackupSha256 = Hash-File $applyState.stoppedBackupPath
        Save-Journal $applyState
        Assert-ProtectedConfig $stageState.protectedConfig
        $script:Step = 'apply-fresh-backup-isolated-drill'; Save-Journal $applyState
        New-PrivateDirectory (Join-Path $UpdateRoot 'apply-drill')
        [void](Invoke-Checked $Node @('--no-warnings', $Helper, $Release, $applyState.stoppedBackupPath, (Join-Path $UpdateRoot 'apply-drill')))
        Assert-ProtectedConfig $stageState.protectedConfig
        $applyState.swapStarted = $true; $script:Step = 'apply-before-program-swap'; Save-Journal $applyState
        foreach ($entry in $Entries) {
            $live = Join-Path $Root $entry; $candidate = Join-Path $Release $entry
            if (Test-Path -LiteralPath $live) { [void](Assert-SafePath $live); Move-Item -LiteralPath $live -Destination (Join-Path $RollbackProgram $entry) }
            if (Test-Path -LiteralPath $candidate) { [void](Assert-SafePath $candidate); Move-Item -LiteralPath $candidate -Destination $live }
            $script:Step = 'apply-program-entry-' + $entry; Save-Journal $applyState
        }
        $script:Step = 'apply-start-candidate'; Save-Journal $applyState
        [void](Invoke-Checked $Wrapper @('start'))
        Start-ExistingHttps $stageState.protectedConfig
        Assert-InternalAcceptance
        Assert-ProtectedConfig $stageState.protectedConfig
        # This immutable record supplements, and never falsifies, the original
        # runtime/source deployment.json record or the frozen manifest.
        $script:Step = 'apply-write-private-release-record'
        Write-NewJson $ActiveRecord ([pscustomobject][ordered]@{
            manifestSha256 = $ManifestHash; candidateZipSha256 = $ZipHash; sourceBaseCommit = 'a9b7405ce04a8831b095b1a8d7696eb6feb80e21'
            sourceState = 'frozen-uncommitted-snapshot'; serviceXmlChanged = $false; runtimeChanged = $false
            appliedUtc = [DateTime]::UtcNow.ToString('o'); rollbackBackupPath = $applyState.stoppedBackupPath; publicExposureUnchanged = $true
        })
        $applyState.status = 'Applied'; $script:Step = 'apply-complete'; Save-Journal $applyState
        Write-Output 'Classroom candidate applied; internal route acceptance passed. Original program/dependencies and stopped-service backup preserved; existing HTTPS and administrator configuration unchanged.'
        exit 0
    } catch {
        try { Rollback-Apply $applyState }
        catch { $applyState.status = 'RollbackFailed'; Save-Journal $applyState; throw 'Rollback incomplete; inspect durable journal and preserve every database component before further action.' }
        throw 'Apply failed; the original private backend was restored. Preserved new state requires review before any new update.'
    }
} catch {
    # No exception detail, environment contents, native output, or student data.
    Write-Output ('Update failed at step: ' + $script:Step + '; script line ' + $_.InvocationInfo.ScriptLineNumber + '; error type ' + $_.Exception.GetType().Name + '. All staged/backup/recovery files were retained; consult the durable journal and reviewed script.')
    exit 1
}

finally { if ($null -ne $transactionLock) { $transactionLock.Dispose() } }
