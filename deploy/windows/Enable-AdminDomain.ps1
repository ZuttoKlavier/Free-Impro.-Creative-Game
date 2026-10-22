#requires -Version 5.1
#requires -RunAsAdministrator
<#
One reviewed administrator-domain increment for the existing public deployment.
Only server\cloud.js, services\EmpvcClassroom.xml and services\Caddyfile are replaced.
The supplied cloud.js must be a separately reviewed/tested patch of 2705870.
No student-auth release, database migration, account setup, Python installation,
DNS/firewall/runtime change or service re-registration is performed here.
ConfirmAdminExposure records the operator's confirmation; it does not verify consent.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CloudFilePath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$CloudFileSha256,
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedCurrentCloudSha256 = '2aa4858947405b7759e0773b0b81f1726b4d1ff6df325ddf1cbf0f7e43e21e94',
    [switch]$ConfirmAdminExposure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = 'C:\EMPVC'
$ClassHost = 'class.empfreeimpro.xyz'
$AdminHost = 'admin.empfreeimpro.xyz'
$AdminOrigin = 'https://' + $AdminHost
$Node = Join-Path $Root 'runtime\node\node.exe'
$Caddy = Join-Path $Root 'runtime\caddy\caddy.exe'
$Database = Join-Path $Root 'data\classroom.sqlite'
$Cloud = Join-Path $Root 'server\cloud.js'
$ServiceXml = Join-Path $Root 'services\EmpvcClassroom.xml'
$Caddyfile = Join-Path $Root 'services\Caddyfile'
$Utf8 = New-Object Text.UTF8Encoding($false, $true)
$Step = 'preflight'
$BackupDirectory = $null
$DowntimeStarted = $false
$WritesStarted = $false
$OriginalBytes = @{}
$OriginalAcls = @{}
$OriginalHashes = @{}
$Lock = $null
$LockHeld = $false
$Result = [ordered]@{ status = 'failed'; step = 'preflight'; adminOrigin = $AdminOrigin; rollback = 'not-needed'; administratorInitialized = $false; databaseBrowserExecutablePresent = $false }

# All existing server modules and administrator assets must be the deployed
# 2705870 release. In particular, never import the working tree's better-auth,
# Apple callback, page-editor or student-recovery changes by accident.
$PinnedFiles = [ordered]@{
    'server\admin-database.js' = 'c02c6b462ce0bff5ed380f1b55a607a0d31311938936e96dd91d424e90319d68'
    'server\admin.js' = '8bec0387d7401fc5ecfe70d6a0f1cb86d85bdc1b41561f75273c6c4690726d68'
    'server\app.js' = '63ba77a5d9d3dc27d40828c6225381efe50043fa86b409f24c0454f19e295900'
    'server\arrangement.js' = '4775de43121e2995cf47773ab656e9da837a4e582f661d02654b3665cfc2481a'
    'server\classroom.js' = 'f4456642fd963256d8a75cb8ce3ce35aa7846cfe8428ad77b1607e5308d11a1a'
    'server\connection-page.js' = '090aab06c08e843daeaf106a5c10d567e5a5aa97ac3df3a450e03f4cd206053e'
    'server\image-mcp.js' = 'b51146e7f540ae0a72dc96735c601a3a13eb9a4e9da1a908c1e62f524ad287c8'
    'server\image-workflow.js' = '6e18a567705a8642b4442816078ce27bcb06f7542dffaaa2c17024dd0b26d396'
    'server\images.js' = '29658bba6338e66cf40be0bf373df612742ba423fc49b389a6bc7620344301b3'
    'server\index.js' = '91d5189ecf353d5f6b4a475a24500a1ed567b463fede8b47381f417c4bc008c2'
    'server\lan.js' = '975641633c6e3fcef49798028b965467b856a0b4edf63bca02f1d99861407cb6'
    'server\layout.js' = '6cd38658784de0df39ff59d36023c0c6792868f30c8f2505734a3246b353205c'
    'server\local-image-token.js' = 'b35de7de7f1fa84c055cd3009b3ec1363e4a6f3548a22579dc31ab17ece003ee'
    'server\performance.js' = '73440ee946638dbf643202d40d5caad4a3fe57e26524df5387351e1d4109134f'
    'public\admin.html' = '56caf95bb09908b9ffd9c45f1e38b26471b37fb0aac02240ee0487af31a9b886'
    'scripts\admin-setup.js' = '7b6e82d5a1af678372b5a15ad6da019576fbda35767369ce600aae690d7db01c'
    'scripts\admin-sqlite-web.py' = '013bbc70efb4504daff1ea2b203ced3eaf78c548a8f3d65b0f07d508d732028a'
    'scripts\install-admin-database.js' = '9695d1c2aaf63b1347de1663a2cf01aa028464fb35cc010de4ad5c4dea2c8131'
    'scripts\cloud-backup.js' = '2df6a2407f5ff9eda0c5fec94e5bca7fa511fc20cc18c35d1eb950487779c536'
    'requirements\admin-database.txt' = 'c2beeb906d2d66c2f782640df0b1c05456267f62c2d177d23fbb664d989bea5d'
    'package.json' = '067c82263094d3eeef8dbbd09db92093ea9928dd0a379fb792f7e201d877c7be'
    'package-lock.json' = '3874bf9f2ae9eef911cdbabbeeabdcff9dc1e68ae100678bb53de252d0befa82'
}

function Assert-SafePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -and -not $full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside fixed deployment root.' }
    $current = 'C:\'
    foreach ($part in $full.Substring(3).Split('\')) {
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in deployment path.' }
    }
    return $full
}
function Assert-File([string]$Path) {
    [void](Assert-SafePath $Path)
    if ((Get-Item -LiteralPath $Path -Force).PSIsContainer) { throw 'Expected regular deployment file.' }
}
function Hash-File([string]$Path) {
    Assert-File $Path
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Assert-Hash([string]$Path, [string]$Expected) {
    if ((Hash-File $Path) -cne $Expected.ToLowerInvariant()) { throw 'Reviewed deployment file hash mismatch.' }
}
function Assert-Acl([string]$Path, [bool]$Writable = $false) {
    [void](Assert-SafePath $Path)
    $acl = Get-Acl -LiteralPath $Path
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -notin @('S-1-5-32-544', 'S-1-5-18')) { throw 'Unexpected deployment owner.' }
    $serviceAllowed = $false
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $sid -notin @('S-1-5-32-544', 'S-1-5-18', 'S-1-5-19')) { throw 'Unexpected deployment ACL principal/rule.' }
        if ($sid -eq 'S-1-5-19') {
            $writeMask = [int][Security.AccessControl.FileSystemRights]::Write -bor [int][Security.AccessControl.FileSystemRights]::Delete -bor [int][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [int][Security.AccessControl.FileSystemRights]::ChangePermissions -bor [int][Security.AccessControl.FileSystemRights]::TakeOwnership
            if (-not $Writable -and ([int]$rule.FileSystemRights -band $writeMask)) { throw 'LocalService can modify program/configuration.' }
            $requiredRights = [int][Security.AccessControl.FileSystemRights]::ReadAndExecute
            if ($Writable) { $requiredRights = [int][Security.AccessControl.FileSystemRights]::Modify }
            if (([int]$rule.FileSystemRights -band $requiredRights) -eq $requiredRights) { $serviceAllowed = $true }
        }
    }
    if (-not $serviceAllowed) { throw 'LocalService lacks required deployment access.' }
}
function New-PrivateDirectory([string]$Path) {
    $parent = Split-Path -Parent $Path
    [void](Assert-SafePath $parent)
    if (Test-Path -LiteralPath $Path) { throw 'Refusing to reuse a staging/backup directory.' }
    [void][IO.Directory]::CreateDirectory($Path)
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $admins = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $acl.SetOwner($admins)
    foreach ($sid in @('S-1-5-32-544', 'S-1-5-18')) {
        $identity = New-Object Security.Principal.SecurityIdentifier($sid)
        $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    Assert-File $Program
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $output = @(& $Program @Arguments 2>&1); $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw 'Reviewed native command failed; raw output suppressed.' }
    return $output
}
function Invoke-InlineNode([string]$JavaScript) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($JavaScript))
    return @(Invoke-Checked $Node @('--no-warnings', '-e', "eval(Buffer.from('$encoded','base64').toString('utf8'))"))
}
function Read-SafeXml([string]$Path) {
    Assert-File $Path
    $settings = New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit; $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($Path, $settings)
    try { $xml = New-Object Xml.XmlDocument; $xml.PreserveWhitespace = $true; $xml.XmlResolver = $null; $xml.Load($reader); return $xml }
    finally { $reader.Dispose() }
}
function Assert-Service([string]$Name, [bool]$Running) {
    $service = Get-CimInstance Win32_Service -Filter ("Name='" + $Name + "'")
    $expected = Join-Path $Root ('services\' + $Name + '.exe')
    Assert-File $expected; Assert-Acl $expected
    if ($null -eq $service -or $service.PathName.Trim().Trim('"') -ine $expected -or $service.StartName -ine 'NT AUTHORITY\LocalService' -or $service.StartMode -ne 'Auto') { throw 'Unexpected service registration/account/start mode.' }
    if ($Running -and $service.State -ne 'Running') { throw 'Expected existing service is not running.' }
    return $service
}
function Assert-Listeners {
    $service = Assert-Service 'EmpvcClassroom' $true
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000)
    if ($listeners.Count -lt 1) { throw 'Backend listener absent.' }
    foreach ($listener in $listeners) {
        if ($listener.LocalAddress -cne '127.0.0.1') { throw 'Backend listener is not loopback-only.' }
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [uint32]$listener.OwningProcess)
        if ($null -eq $process -or $process.ExecutablePath -ine $Node -or $process.ParentProcessId -ne $service.ProcessId) { throw 'Listener is not the expected service Node child.' }
    }
}
function Stop-DeploymentService([string]$Name) {
    [void](Assert-Service $Name $false)
    Stop-Service -Name $Name
    (Get-Service -Name $Name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    if ($Name -eq 'EmpvcClassroom' -and @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Backend listener remains after stop.' }
}
function Start-DeploymentService([string]$Name) {
    [void](Assert-Service $Name $false)
    Start-Service -Name $Name
    (Get-Service -Name $Name).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
}
function Probe([string]$Path, [string]$HostName, [string]$Method = 'GET', [string]$Origin = '') {
    $response = $null
    try {
        $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:3000' + $Path)
        $request.Host = $HostName; $request.Method = $Method; $request.Proxy = $null
        $request.AllowAutoRedirect = $false; $request.Timeout = 3000; $request.ReadWriteTimeout = 3000
        if ($Origin) { $request.Headers['Origin'] = $Origin }
        if ($Method -eq 'POST') { $request.ContentType = 'application/json'; $request.ContentLength = 2; $stream = $request.GetRequestStream(); try { $bytes = [Text.Encoding]::UTF8.GetBytes('{}'); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() } }
        try { $response = $request.GetResponse() }
        catch [Net.WebException] { if ($null -eq $_.Exception.Response) { throw }; $response = $_.Exception.Response }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
        return [pscustomobject]@{ status = [int]$response.StatusCode; body = $body }
    } finally { if ($null -ne $response) { $response.Dispose() } }
}
function Assert-Probe([string]$Path, [string]$HostName, [int]$Status, [string]$Method = 'GET', [string]$Origin = '') {
    $response = Probe $Path $HostName $Method $Origin
    if ($response.status -ne $Status) { throw 'Required domain-route boundary check failed.' }
    if ($Path -eq '/api/health' -and $Status -eq 200 -and ($response.body | ConvertFrom-Json).ok -ne $true) { throw 'Backend health payload failed.' }
}
function Wait-Backend {
    $deadline = [DateTime]::UtcNow.AddSeconds(40)
    do {
        try { Assert-Probe '/api/health' $ClassHost 200; Assert-Listeners; return } catch { }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Backend failed to become healthy.'
}
function Assert-NewRoutes {
    Assert-Probe '/api/health' $ClassHost 200
    Assert-Probe '/api/admin/console' $AdminHost 200
    Assert-Probe '/api/admin/overview' $AdminHost 401
    Assert-Probe '/api/health' $AdminHost 404
    foreach ($path in @('/api/admin/console', '/api/admin/overview', '/admin.html')) { Assert-Probe $path $ClassHost 404 }
    foreach ($path in @('/teacher.html', '/api/teacher/me', '/mcp/images', '/api/teacher/image-mcp-save-local', '/data/classroom.sqlite', '/.env')) { Assert-Probe $path $AdminHost 404 }
    Assert-Probe '/api/health' 'wrong.invalid' 421
    Assert-Probe '/api/admin/login' $AdminHost 403 'POST' 'https://wrong.invalid'
    Assert-Probe '/api/admin/login' $AdminHost 403 'POST' ('https://' + $ClassHost)
    Assert-Probe '/api/teacher/login' $ClassHost 403 'POST' $AdminOrigin
}
function Assert-NoDrift {
    foreach ($entry in $PinnedFiles.GetEnumerator()) { $path = Join-Path $Root $entry.Key; Assert-Hash $path $entry.Value; Assert-Acl $path }
    foreach ($path in @($Cloud, $ServiceXml, $Caddyfile)) { Assert-Hash $path $OriginalHashes[$path]; Assert-Acl $path }
}

try {
    if (-not $ConfirmAdminExposure.IsPresent) { throw 'Explicit administrator-exposure confirmation required.' }
    if ($env:OS -ne 'Windows_NT') { throw 'Run only on the existing Windows deployment.' }
    $Lock = New-Object Threading.Mutex($false, 'Global\EMPVC-AdminDomain-Deployment')
    try { $LockHeld = $Lock.WaitOne(0) } catch [Threading.AbandonedMutexException] { $LockHeld = $true }
    if (-not $LockHeld) { throw 'Another administrator-domain deployment is running.' }
    $Step = 'preflight-deployment-acl'
    [void](Assert-SafePath $Root)
    foreach ($directory in @($Root, (Join-Path $Root 'server'), (Join-Path $Root 'services'), (Join-Path $Root 'node_modules'), (Join-Path $Root 'public'))) { Assert-Acl $directory }
    foreach ($directory in @((Join-Path $Root 'data'), (Join-Path $Root 'backups'), (Join-Path $Root 'temp'))) { Assert-Acl $directory $true }
    foreach ($file in @($Node, $Caddy, $Cloud, $ServiceXml, $Caddyfile, (Join-Path $Root 'services\EmpvcHttps.xml'))) { Assert-File $file; Assert-Acl $file }
    Assert-File $Database; Assert-Acl $Database $true
    $Step = 'preflight-source-whitelist'
    foreach ($entry in $PinnedFiles.GetEnumerator()) { $path = Join-Path $Root $entry.Key; Assert-Hash $path $entry.Value; Assert-Acl $path }
    $serverNames = @('cloud.js') + @($PinnedFiles.Keys | Where-Object { $_.StartsWith('server\') } | ForEach-Object { Split-Path -Leaf $_ })
    foreach ($item in @(Get-ChildItem -LiteralPath (Join-Path $Root 'server') -Force)) { if ($item.PSIsContainer -or $item.Name -notin $serverNames) { throw 'Unexpected file in deployed server whitelist.' } }
    $Step = 'preflight-baseline-and-runtime'
    Assert-Hash $Cloud $ExpectedCurrentCloudSha256
    Assert-Hash $Caddyfile '427eef75d9af2b0f8c89aaeafd0c7212f37485a2ae3d569ff7d0014492305b69'
    Assert-Hash (Join-Path $Root 'services\EmpvcHttps.xml') '12ec978e3941a0366da1696ae2028a9f35578c3ea8816e60394b3c8a447b8fa4'
    foreach ($name in @('EmpvcClassroom', 'EmpvcHttps')) { Assert-Hash (Join-Path $Root ('services\' + $name + '.exe')) '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da' }
    $nodeVersion = @(Invoke-Checked $Node @('--version'))
    if ($nodeVersion.Count -ne 1 -or [string]$nodeVersion[0] -cne 'v24.21.0') { throw 'Unexpected existing Node runtime.' }
    $caddyVersion = @(Invoke-Checked $Caddy @('version'))
    if ($caddyVersion.Count -ne 1 -or [string]$caddyVersion[0] -notmatch '^v2\.11\.7(?:\s|$)') { throw 'Unexpected existing Caddy runtime.' }
    $Step = 'preflight-service-and-database-path'
    [void](Assert-Service 'EmpvcClassroom' $true); [void](Assert-Service 'EmpvcHttps' $true); Assert-Listeners
    $xml = Read-SafeXml $ServiceXml
    $expectedXml = [ordered]@{
        '/service/id' = 'EmpvcClassroom'; '/service/executable' = $Node; '/service/arguments' = '"C:\EMPVC\server\cloud.js"'
        '/service/workingdirectory' = $Root; '/service/startmode' = 'Automatic'
        '/service/serviceaccount/domain' = 'NT AUTHORITY'; '/service/serviceaccount/user' = 'LocalService'
        '/service/env[@name="NODE_ENV"]/@value' = 'production'; '/service/env[@name="PUBLIC_ORIGIN"]/@value' = 'https://class.empfreeimpro.xyz'
        '/service/env[@name="CLOUD_BIND"]/@value' = '127.0.0.1'; '/service/env[@name="CLOUD_PORT"]/@value' = '3000'
        '/service/env[@name="FREE_IMPRO_DB"]/@value' = $Database; '/service/env[@name="DIST_DIRECTORY"]/@value' = 'C:\EMPVC\dist'
        '/service/env[@name="TEMP"]/@value' = 'C:\EMPVC\temp'; '/service/env[@name="TMP"]/@value' = 'C:\EMPVC\temp'
    }
    foreach ($entry in $expectedXml.GetEnumerator()) {
        if ($xml.SelectNodes($entry.Key).Count -ne 1) { throw 'Unexpected service XML setting count.' }
        $setting = $xml.SelectSingleNode($entry.Key)
        # Windows PowerShell adapts XML attributes differently from elements.
        # Read the attribute value explicitly, as in the deployment preflight.
        $actual = if ($entry.Key.EndsWith('/@value')) { [string]$setting.Value } else { [string]$setting.InnerText }
        if ($actual -cne $entry.Value) { throw 'Unexpected service XML setting.' }
    }
    if (@($xml.SelectNodes('/service/env')).Count -ne 8) { throw 'Additional service environment requires review.' }
    $Step = 'preflight-reviewed-cloud-candidate'
    $candidate = Assert-SafePath $CloudFilePath
    Assert-File $candidate
    if ($candidate -ieq $Cloud -or [IO.Path]::GetExtension($candidate) -cne '.js' -or (Get-Item -LiteralPath $candidate).Length -gt 131072) { throw 'Unexpected reviewed cloud candidate.' }
    Assert-Hash $candidate $CloudFileSha256
    $candidateBytes = [IO.File]::ReadAllBytes($candidate)
    $candidateText = $Utf8.GetString($candidateBytes)
    if ($candidateText -notmatch 'ADMIN_ORIGIN' -or $candidateText -match 'better-auth|appleid\.apple\.com|student-auth|student-recovery') { throw 'Candidate does not match the administrator-only release contract.' }
    [void](Invoke-Checked $Node @('--check', $candidate))
    $Step = 'preflight-existing-routes'
    Assert-Probe '/api/health' $ClassHost 200
    Assert-Probe '/api/admin/console' $ClassHost 404
    Assert-Probe '/api/health' $AdminHost 421
    foreach ($path in @($Cloud, $ServiceXml, $Caddyfile)) { $OriginalBytes[$path] = [IO.File]::ReadAllBytes($path); $OriginalAcls[$path] = Get-Acl -LiteralPath $path; $OriginalHashes[$path] = Hash-File $path }

    $Step = 'prepare-reviewed-configurations'
    $staging = Join-Path $Root ('temp\admin-domain-' + [Guid]::NewGuid().ToString('N'))
    New-PrivateDirectory $staging
    $adminEnv = $xml.CreateElement('env'); $adminEnv.SetAttribute('name', 'ADMIN_ORIGIN'); $adminEnv.SetAttribute('value', $AdminOrigin)
    [void]$xml.DocumentElement.InsertAfter($adminEnv, $xml.SelectSingleNode('/service/env[@name="PUBLIC_ORIGIN"]'))
    $candidateXmlBytes = $Utf8.GetBytes($xml.OuterXml)
    $candidateCaddyText = $Utf8.GetString($OriginalBytes[$Caddyfile]).TrimEnd() + "`r`n`r`n# Dedicated administrator host; classroom routes remain on the classroom host.`r`nadmin.empfreeimpro.xyz {`r`n    encode zstd gzip`r`n    reverse_proxy 127.0.0.1:3000`r`n}`r`n"
    $candidateCaddyBytes = $Utf8.GetBytes($candidateCaddyText)
    $stagedCaddy = Join-Path $staging 'Caddyfile'
    [IO.File]::WriteAllBytes($stagedCaddy, $candidateCaddyBytes)
    $previousDomain = [Environment]::GetEnvironmentVariable('CLASSROOM_DOMAIN', 'Process')
    try { $env:CLASSROOM_DOMAIN = $ClassHost; [void](Invoke-Checked $Caddy @('validate', '--config', $stagedCaddy, '--adapter', 'caddyfile')) }
    finally { [Environment]::SetEnvironmentVariable('CLASSROOM_DOMAIN', $previousDomain, 'Process') }

    $Step = 'consistent-database-and-configuration-backup'
    $BackupDirectory = Join-Path $Root ('backups\admin-domain-' + [Guid]::NewGuid().ToString('N'))
    New-PrivateDirectory $BackupDirectory
    foreach ($path in @($Cloud, $ServiceXml, $Caddyfile)) { [IO.File]::WriteAllBytes((Join-Path $BackupDirectory ([IO.Path]::GetFileName($path))), $OriginalBytes[$path]) }
    $databaseBackup = Join-Path $BackupDirectory 'database'
    New-PrivateDirectory $databaseBackup
    $previousDb = [Environment]::GetEnvironmentVariable('FREE_IMPRO_DB', 'Process')
    $previousBackup = [Environment]::GetEnvironmentVariable('BACKUP_DIRECTORY', 'Process')
    try { $env:FREE_IMPRO_DB = $Database; $env:BACKUP_DIRECTORY = $databaseBackup; [void](Invoke-Checked $Node @('--no-warnings', (Join-Path $Root 'scripts\cloud-backup.js'))) }
    finally { [Environment]::SetEnvironmentVariable('FREE_IMPRO_DB', $previousDb, 'Process'); [Environment]::SetEnvironmentVariable('BACKUP_DIRECTORY', $previousBackup, 'Process') }
    $snapshots = @(Get-ChildItem -LiteralPath $databaseBackup -File)
    if ($snapshots.Count -ne 1 -or $snapshots[0].Extension -cne '.sqlite') { throw 'Consistent backup was not produced.' }
    $adminInspectionScript = @'
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('C:/EMPVC/data/classroom.sqlite',{readOnly:true});
try {
    const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_accounts'").get();
    const n=table?db.prepare('SELECT count(*) AS n FROM admin_accounts').get().n:0;
    console.log(JSON.stringify({initialized:n>0}));
} finally { db.close(); }
'@
    $adminState = @(Invoke-InlineNode $adminInspectionScript)
    if ($adminState.Count -ne 1) { throw 'Administrator state check failed.' }
    $Result.administratorInitialized = [bool](($adminState[0] | ConvertFrom-Json).initialized)
    $Result.databaseBrowserExecutablePresent = Test-Path -LiteralPath (Join-Path $Root 'data\admin\venv\Scripts\python.exe') -PathType Leaf
    Assert-NoDrift

    $Step = 'stop-and-apply-limited-increment'
    $DowntimeStarted = $true
    Stop-DeploymentService 'EmpvcHttps'
    Stop-DeploymentService 'EmpvcClassroom'
    Assert-NoDrift
    # All source fingerprints were checked again after stopping. The three
    # files retain the original safe ACLs; the cross-process mutex stays held.
    $WritesStarted = $true
    [IO.File]::WriteAllBytes($Cloud, $candidateBytes); Set-Acl -LiteralPath $Cloud -AclObject $OriginalAcls[$Cloud]
    [IO.File]::WriteAllBytes($ServiceXml, $candidateXmlBytes); Set-Acl -LiteralPath $ServiceXml -AclObject $OriginalAcls[$ServiceXml]
    [IO.File]::WriteAllBytes($Caddyfile, $candidateCaddyBytes); Set-Acl -LiteralPath $Caddyfile -AclObject $OriginalAcls[$Caddyfile]
    Assert-Hash $Cloud $CloudFileSha256
    foreach ($path in @($Cloud, $ServiceXml, $Caddyfile)) { Assert-Acl $path }
    $Step = 'private-route-acceptance'
    Start-DeploymentService 'EmpvcClassroom'; Wait-Backend; Assert-NewRoutes
    $Step = 'restart-existing-https'
    Start-DeploymentService 'EmpvcHttps'
    [void](Assert-Service 'EmpvcHttps' $true); Assert-Listeners; Assert-NewRoutes
    $Result.status = 'applied'; $Result.step = 'complete'; $Result.backupDirectory = $BackupDirectory
    $Result.sourceBaseCommit = '2705870c0846e0958018180feaefef0528e9fca7'
    $Result.cloudPatchSha256 = $CloudFileSha256.ToLowerInvariant()
    $Result.publicTlsVerified = $false
    $Result.nextStep = 'Verify administrator DNS and public trusted TLS; initialize an independent administrator if absent. Python browser dependencies require a separate verified installation.'
} catch {
    $Result.step = $Step
    if ($DowntimeStarted) {
        $Result.rollback = 'failed'
        try {
            Stop-DeploymentService 'EmpvcHttps'; Stop-DeploymentService 'EmpvcClassroom'
            if ($WritesStarted) {
                foreach ($path in @($Cloud, $ServiceXml, $Caddyfile)) { [IO.File]::WriteAllBytes($path, $OriginalBytes[$path]); Set-Acl -LiteralPath $path -AclObject $OriginalAcls[$path]; Assert-Hash $path $OriginalHashes[$path] }
            }
            Start-DeploymentService 'EmpvcClassroom'; Wait-Backend
            Assert-Probe '/api/admin/console' $ClassHost 404
            Assert-Probe '/api/health' $AdminHost 421
            Start-DeploymentService 'EmpvcHttps'
            $Result.rollback = 'restored-original-services-and-files'
        } catch { $Result.rollback = 'incomplete-preserve-backups-and-inspect-services' }
    }
    if ($null -ne $BackupDirectory) { $Result.backupDirectory = $BackupDirectory }
} finally {
    if ($null -ne $Lock) { if ($LockHeld) { $Lock.ReleaseMutex() }; $Lock.Dispose() }
}
$Result | ConvertTo-Json -Depth 4 -Compress
if ($Result.status -ne 'applied') { exit 1 }
