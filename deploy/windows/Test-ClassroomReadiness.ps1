#requires -Version 5.1
<#
Read-only checks for the existing Windows classroom deployment.
Does not install/start/stop services, change ACLs/firewall/DNS, execute Caddy,
read .env/database contents/logs, or create report files. All HTTP probes use GET.
An exit code of zero is a technical check result, never public launch approval.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^(?:[a-fA-F0-9]{40})?$')]
    [string]$ExpectedCommit = '',
    [switch]$CheckPublic,
    [switch]$AsJson,
    [ValidateRange(1, 30)]
    [int]$TimeoutSeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = 'C:\EMPVC'
$ClassroomDomain = 'class.empfreeimpro.xyz'
$PublicOrigin = 'https://' + $ClassroomDomain
$ApprovedAddress = '47.96.236.36'
$script:Checks = New-Object 'System.Collections.Generic.List[object]'

function Add-Check([string]$Scope, [string]$Name, [string]$Status, [string]$Detail) {
    [void]$script:Checks.Add([pscustomobject][ordered]@{
        scope = $Scope; name = $Name; status = $Status; detail = $Detail
    })
}

function Complete-Report([int]$ExitCode) {
    $privateFailures = @($script:Checks | Where-Object { $_.scope -eq 'private' -and $_.status -eq 'FAIL' }).Count
    $publicFailures = @($script:Checks | Where-Object { $_.scope -eq 'public' -and $_.status -eq 'FAIL' }).Count
    $privateResult = 'PASS'
    if ($privateFailures -gt 0) { $privateResult = 'FAIL' }
    $publicResult = 'NOT_CHECKED'
    if ($CheckPublic) {
        $publicResult = 'TECHNICAL_PROBES_PASS'
        if ($publicFailures -gt 0) { $publicResult = 'TECHNICAL_PROBES_FAIL' }
    }
    $report = [pscustomobject][ordered]@{
        privateResult = $privateResult
        publicResult = $publicResult
        publicLaunchApproved = $false
        note = 'ICP filing, exposure authorization, migration, restore and real-phone acceptance remain manual gates. Internal HTTP is not public HTTPS.'
        exitCode = $ExitCode
        checks = $script:Checks.ToArray()
    }
    if ($AsJson) { $report | ConvertTo-Json -Depth 6 }
    else {
        foreach ($check in $script:Checks) {
            Write-Output ('[{0}] {1}/{2}: {3}' -f $check.status, $check.scope, $check.name, $check.detail)
        }
        Write-Output ('Private checks: {0}; public technical probes: {1}; public launch approval: NOT CERTIFIED.' -f $privateResult, $publicResult)
        Write-Output $report.note
        Write-Output ('Exit code: ' + $ExitCode)
    }
}

function Get-ApprovedItem([string]$Path, [string]$Kind) {
    $comparison = [StringComparison]::OrdinalIgnoreCase
    if (-not $Path.Equals($Root, $comparison) -and -not $Path.StartsWith($Root + '\', $comparison)) {
        throw 'Path is outside the fixed deployment root.'
    }
    $current = $Root
    $item = Get-Item -LiteralPath $current -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Deployment root must be a real directory.'
    }
    if (-not $Path.Equals($Root, $comparison)) {
        foreach ($part in $Path.Substring($Root.Length + 1).Split('\')) {
            $current = Join-Path $current $part
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not accepted.' }
        }
    }
    if (($Kind -eq 'file' -and $item.PSIsContainer) -or ($Kind -eq 'directory' -and -not $item.PSIsContainer)) {
        throw 'Deployment item has the wrong type.'
    }
    return $item
}

function Read-ServiceXml([string]$Path) {
    $item = Get-ApprovedItem $Path 'file'
    if ($item.Length -gt 1048576) { throw 'Unexpectedly large service configuration.' }
    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($item.FullName, $settings)
    try {
        $document = New-Object System.Xml.XmlDocument
        $document.XmlResolver = $null
        $document.Load($reader)
        return $document
    } finally { $reader.Dispose() }
}

function Test-XmlValue($Document, [string]$XPath, [string]$Expected) {
    $nodes = @($Document.SelectNodes($XPath))
    return ($nodes.Count -eq 1 -and $nodes[0].InnerText -ceq $Expected)
}

function Test-PrivateAcl([string]$Path, [bool]$Writable) {
    try {
        $acl = Get-Acl -LiteralPath $Path
        # Runtime-created database, backup and log files legitimately inherit
        # the protected directory ACL and can be owned by LocalService.
        # Program/configuration files retain the stricter installer policy.
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($Writable) {
            if ($owner -notin @('S-1-5-32-544', 'S-1-5-18', 'S-1-5-19')) { return $false }
        } elseif (-not $acl.AreAccessRulesProtected -or $owner -ne 'S-1-5-32-544') { return $false }
        $granted = @{'S-1-5-32-544' = [int64]0; 'S-1-5-18' = [int64]0; 'S-1-5-19' = [int64]0}
        foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            $sid = $rule.IdentityReference.Value
            if (-not $granted.ContainsKey($sid) -or (-not $Writable -and $rule.IsInherited) -or
                $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { return $false }
            $granted[$sid] = $granted[$sid] -bor [int64]$rule.FileSystemRights
        }
        $full = [int64][Security.AccessControl.FileSystemRights]::FullControl
        if ($granted['S-1-5-32-544'] -ne $full -or $granted['S-1-5-18'] -ne $full) { return $false }
        $required = [int64][Security.AccessControl.FileSystemRights]::ReadAndExecute
        if ($Writable) { $required = [int64][Security.AccessControl.FileSystemRights]::Modify }
        $allowed = $required -bor [int64][Security.AccessControl.FileSystemRights]::Synchronize
        $local = $granted['S-1-5-19']
        return (($local -band $required) -eq $required -and ($local -band (-bnot $allowed)) -eq 0)
    } catch { return $false }
}

function Test-PersistentTreeAcl([string]$Path) {
    $count = 0; $issues = 0; $incomplete = $false
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    try {
        [void](Get-ApprovedItem $Path 'directory')
        $pending.Push($Path)
        while ($pending.Count -gt 0) {
            $directory = $pending.Pop()
            $count++
            if (-not (Test-PrivateAcl $directory $true)) { $issues++ }
            try { $children = @(Get-ChildItem -LiteralPath $directory -Force) }
            catch { $issues++; $incomplete = $true; continue }
            foreach ($child in $children) {
                if ($count -ge 20000) { $incomplete = $true; break }
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { $count++; $issues++; continue }
                if ($child.PSIsContainer) { $pending.Push($child.FullName) }
                else { $count++; if (-not (Test-PrivateAcl $child.FullName $true)) { $issues++ } }
            }
            if ($incomplete -and $count -ge 20000) { break }
        }
    } catch { $issues++; $incomplete = $true }
    return [pscustomobject]@{ Count = $count; Issues = $issues; Incomplete = $incomplete }
}

function Invoke-ReadOnlyHttp([string]$Uri, [string]$HostName = '', [string]$Origin = '', [switch]$ReadBody) {
    $response = $null
    try {
        $request = [Net.HttpWebRequest]::Create($Uri)
        $request.Method = 'GET'
        $request.AllowAutoRedirect = $false
        $request.Proxy = $null
        $request.Timeout = $TimeoutSeconds * 1000
        $request.ReadWriteTimeout = $TimeoutSeconds * 1000
        if ($HostName) { $request.Host = $HostName }
        if ($Origin) { $request.Headers['Origin'] = $Origin }
        try { $response = $request.GetResponse() }
        catch [Net.WebException] {
            if ($null -eq $_.Exception.Response) { throw }
            $response = $_.Exception.Response
        }
        $body = $null
        if ($ReadBody) {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            try {
                $buffer = New-Object char[] 4097
                $length = 0
                do {
                    $read = $reader.Read($buffer, $length, $buffer.Length - $length)
                    $length += $read
                } while ($read -gt 0 -and $length -lt $buffer.Length)
                if ($length -gt 4096) { throw 'Health body exceeded the fixed limit.' }
                $body = [string]::new($buffer, 0, $length)
            } finally { $reader.Dispose() }
        }
        return [pscustomobject]@{
            Status = [int]$response.StatusCode; Body = $body
            ContentType = $response.ContentType; Location = $response.Headers['Location']
        }
    } catch {
        # Never echo response bodies, configuration content or exception text.
        return [pscustomobject]@{ Status = 0; Body = $null; ContentType = ''; Location = '' }
    } finally { if ($null -ne $response) { $response.Dispose() } }
}

function Test-HealthResponse($Response) {
    if ($Response.Status -ne 200) { return $false }
    try {
        $body = $Response.Body | ConvertFrom-Json
        return ($body.ok -is [bool] -and $body.ok -eq $true)
    } catch { return $false }
}

if ($env:OS -ne 'Windows_NT') {
    Add-Check 'private' 'platform' 'FAIL' 'Run this read-only check on the Windows classroom server with PowerShell 5.1 or later.'
    Complete-Report 3
    exit 3
}

$rootSafe = $false
try {
    [void](Get-ApprovedItem $Root 'directory')
    $rootSafe = $true
    Add-Check 'private' 'deployment-root' 'PASS' 'The fixed deployment root is a real directory.'
} catch { Add-Check 'private' 'deployment-root' 'FAIL' 'C:\EMPVC is missing, unreadable, or contains a reparse point.' }

$app = $null; $https = $null; $appBelongs = $false
try {
    $services = @(Get-CimInstance -ClassName Win32_Service -Filter "Name='EmpvcClassroom' OR Name='EmpvcHttps'")
    $apps = @($services | Where-Object { $_.Name -eq 'EmpvcClassroom' })
    $httpsServices = @($services | Where-Object { $_.Name -eq 'EmpvcHttps' })
    if ($apps.Count -eq 1) { $app = $apps[0] }
    if ($httpsServices.Count -eq 1) { $https = $httpsServices[0] }
    $expectedWrapper = Join-Path $Root 'services\EmpvcClassroom.exe'
    if ($null -ne $app) {
        $appBelongs = ($app.PathName.Trim() -ieq $expectedWrapper -or $app.PathName.Trim() -ieq ('"' + $expectedWrapper + '"'))
    }
    if ($appBelongs -and $app.StartName -ieq 'NT AUTHORITY\LocalService' -and $app.StartMode -eq 'Auto' -and $app.State -eq 'Running') {
        Add-Check 'private' 'classroom-service' 'PASS' 'Registered at the expected wrapper, Running, Automatic, and LocalService.'
    } else { Add-Check 'private' 'classroom-service' 'FAIL' 'Missing service, unexpected executable/account, non-automatic startup, or not Running.' }
} catch { Add-Check 'private' 'classroom-service' 'FAIL' 'Service metadata could not be inspected; no service action was performed.' }

$listenerOwned = $false
try {
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 })
    $listenerOwned = ($listeners.Count -gt 0 -and $appBelongs -and $null -ne $app -and $app.State -eq 'Running')
    foreach ($listener in $listeners) {
        if ($listener.LocalAddress -ne '127.0.0.1') { $listenerOwned = $false; continue }
        $processes = @(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + [uint32]$listener.OwningProcess) -Property ProcessId,ParentProcessId,ExecutablePath)
        if ($processes.Count -ne 1 -or $processes[0].ExecutablePath -ine (Join-Path $Root 'runtime\node\node.exe') -or
            $processes[0].ParentProcessId -ne $app.ProcessId) { $listenerOwned = $false }
    }
    if ($listenerOwned) { Add-Check 'private' 'listener' 'PASS' 'Port 3000 listens only at 127.0.0.1 and belongs to the service Node child.' }
    else { Add-Check 'private' 'listener' 'FAIL' 'Port 3000 is absent, non-loopback, or not owned by the expected service Node child.' }
} catch { Add-Check 'private' 'listener' 'FAIL' 'Listener/process ownership could not be inspected.' }

if ($rootSafe) {
    $fileFailures = 0
    $requiredFiles = @('server\cloud.js', 'server\app.js', 'dist\index.html', 'dist\teacher.html', 'package.json', 'package-lock.json',
        'runtime\node\node.exe', 'runtime\node\npm.cmd', 'runtime\winsw\WinSW-x64.exe', 'runtime\caddy\caddy.exe',
        'services\EmpvcClassroom.exe', 'services\EmpvcClassroom.xml', 'scripts\cloud-backup.js', 'data\classroom.sqlite')
    foreach ($relative in $requiredFiles) {
        try { [void](Get-ApprovedItem (Join-Path $Root $relative) 'file') } catch { $fileFailures++ }
    }
    if ($fileFailures -eq 0) { Add-Check 'private' 'required-files' 'PASS' 'Release, runtime, wrapper, production pages, backup script and database file exist without reparse points.' }
    else { Add-Check 'private' 'required-files' 'FAIL' ($fileFailures.ToString() + ' required files are missing, unreadable, or not regular files. Database contents were not read.') }

    try {
        $document = Read-ServiceXml (Join-Path $Root 'services\EmpvcClassroom.xml')
        $expected = [ordered]@{
            '/service/id' = 'EmpvcClassroom'
            '/service/executable' = 'C:\EMPVC\runtime\node\node.exe'
            '/service/arguments' = '"C:\EMPVC\server\cloud.js"'
            '/service/workingdirectory' = 'C:\EMPVC'
            '/service/startmode' = 'Automatic'
            '/service/serviceaccount/domain' = 'NT AUTHORITY'
            '/service/serviceaccount/user' = 'LocalService'
            '/service/logpath' = 'C:\EMPVC\logs\app'
            '/service/env[@name="NODE_ENV"]/@value' = 'production'
            '/service/env[@name="PUBLIC_ORIGIN"]/@value' = $PublicOrigin
            '/service/env[@name="CLOUD_BIND"]/@value' = '127.0.0.1'
            '/service/env[@name="CLOUD_PORT"]/@value' = '3000'
            '/service/env[@name="FREE_IMPRO_DB"]/@value' = 'C:\EMPVC\data\classroom.sqlite'
            '/service/env[@name="DIST_DIRECTORY"]/@value' = 'C:\EMPVC\dist'
            '/service/env[@name="TEMP"]/@value' = 'C:\EMPVC\temp'
            '/service/env[@name="TMP"]/@value' = 'C:\EMPVC\temp'
        }
        $matches = $true
        foreach ($entry in $expected.GetEnumerator()) {
            if (-not (Test-XmlValue $document $entry.Key $entry.Value)) { $matches = $false }
        }
        if ($matches) { Add-Check 'private' 'registered-xml' 'PASS' 'The deployed wrapper XML has the expected paths, service identity and eight core environment values.' }
        else { Add-Check 'private' 'registered-xml' 'FAIL' 'The deployed wrapper XML differs from one or more required settings; values were not printed.' }
        if (@($document.SelectNodes('/service/env')).Count -ne 8) {
            Add-Check 'private' 'additional-environment' 'WARN' 'Additional environment entries require separate review; names and values were not printed.'
        }
    } catch { Add-Check 'private' 'registered-xml' 'FAIL' 'The deployed wrapper XML could not be safely parsed; DTD and external XML resolution are prohibited.' }

    $readOnlyAclFailures = 0
    foreach ($relative in @('', 'services', 'services\EmpvcClassroom.xml', 'services\EmpvcClassroom.exe', 'server', 'server\cloud.js', 'dist',
        'dist\index.html', 'dist\teacher.html', 'runtime', 'runtime\node', 'runtime\node\node.exe', 'runtime\winsw',
        'runtime\winsw\WinSW-x64.exe', 'runtime\caddy', 'runtime\caddy\caddy.exe')) {
        $path = $Root
        if ($relative) { $path = Join-Path $Root $relative }
        try {
            [void](Get-ApprovedItem $path '')
            if (-not (Test-PrivateAcl $path $false)) { $readOnlyAclFailures++ }
        } catch { $readOnlyAclFailures++ }
    }
    if ($readOnlyAclFailures -eq 0) { Add-Check 'private' 'program-acl' 'PASS' 'Checked program/configuration paths are protected: Administrators/SYSTEM full control, LocalService read/execute only.' }
    else { Add-Check 'private' 'program-acl' 'FAIL' ($readOnlyAclFailures.ToString() + ' checked program/configuration ACLs differ from the installer policy or could not be read.') }
    foreach ($relative in @('data', 'backups', 'caddy-data', 'logs', 'temp')) {
        $result = Test-PersistentTreeAcl (Join-Path $Root $relative)
        $detail = ('{0} entries checked; {1} ACL/reparse/read issues. File contents were not read.' -f $result.Count, $result.Issues)
        if ($result.Issues -eq 0 -and -not $result.Incomplete) { Add-Check 'private' ('persistent-acl-' + $relative) 'PASS' $detail }
        else { Add-Check 'private' ('persistent-acl-' + $relative) 'FAIL' ($detail + ' Inspection may be incomplete (limit: 20000 entries per tree).') }
    }

    try {
        $recordItem = Get-ApprovedItem (Join-Path $Root 'deployment.json') 'file'
        if ($recordItem.Length -gt 1048576) { throw 'Unexpectedly large release record.' }
        $record = Get-Content -LiteralPath $recordItem.FullName -Raw | ConvertFrom-Json
        $patterns = [ordered]@{
            commit = '^[a-f0-9]{40}$'; nodeVersion = '^\d+\.\d+\.\d+$'; nodeSha256 = '^[a-f0-9]{64}$'
            caddyVersion = '^\d+\.\d+\.\d+$'; caddySha512 = '^[a-f0-9]{128}$'
            winSwVersion = '^2\.\d+\.\d+$'; winSwSha256 = '^[a-f0-9]{64}$'
        }
        foreach ($entry in $patterns.GetEnumerator()) {
            $property = $record.PSObject.Properties[$entry.Key]
            if ($null -eq $property -or $property.Value -isnot [string] -or $property.Value -cnotmatch $entry.Value) { throw 'Invalid release record field.' }
        }
        if ([version]$record.nodeVersion -lt [version]'24.15.0') { throw 'Recorded Node version is unsupported.' }
        if ($ExpectedCommit -and $record.commit -ine $ExpectedCommit) {
            Add-Check 'private' 'release-record' 'FAIL' ('Recorded source ' + $record.commit + ' differs from the explicitly expected commit. No update was attempted.')
        } else {
            Add-Check 'private' 'release-record' 'PASS' ('Recorded source=' + $record.commit + '; Node=' + $record.nodeVersion + '; Caddy=' + $record.caddyVersion + '; WinSW=' + $record.winSwVersion + '. Record format is valid; this does not prove the complete tree is unchanged.')
        }
        if (-not $ExpectedCommit) { Add-Check 'private' 'release-selection' 'WARN' 'No expected commit supplied. Match this record to the approved immutable release before updating.' }
        $runtimeWrapper = Get-ApprovedItem (Join-Path $Root 'runtime\winsw\WinSW-x64.exe') 'file'
        $serviceWrapper = Get-ApprovedItem (Join-Path $Root 'services\EmpvcClassroom.exe') 'file'
        $runtimeHash = (Get-FileHash -LiteralPath $runtimeWrapper.FullName -Algorithm SHA256).Hash
        $serviceHash = (Get-FileHash -LiteralPath $serviceWrapper.FullName -Algorithm SHA256).Hash
        if ($runtimeHash -ieq $record.winSwSha256 -and $serviceHash -ieq $record.winSwSha256 -and $runtimeWrapper.VersionInfo.ProductVersion -match '^2\.') {
            Add-Check 'private' 'winsw-integrity' 'PASS' 'Runtime and classroom wrappers match the recorded WinSW executable SHA256 and have WinSW 2.x metadata.'
        } else { Add-Check 'private' 'winsw-integrity' 'FAIL' 'WinSW executable digest or version metadata differs from the recorded deployment.' }
    } catch { Add-Check 'private' 'release-record' 'FAIL' 'Release record/runtime metadata could not be verified. No raw record or hashes were printed.' }
}

if ($listenerOwned) {
    $response = Invoke-ReadOnlyHttp 'http://127.0.0.1:3000/api/health' $ClassroomDomain '' -ReadBody
    if (Test-HealthResponse $response) { Add-Check 'private' 'internal-health' 'PASS' 'Correct Host returned HTTP 200 and boolean ok=true. This is liveness, not a database or phone acceptance test.' }
    else { Add-Check 'private' 'internal-health' 'FAIL' 'Correct Host did not return bounded HTTP 200 JSON with boolean ok=true.' }
    foreach ($path in @('/', '/teacher.html')) {
        $response = Invoke-ReadOnlyHttp ('http://127.0.0.1:3000' + $path) $ClassroomDomain
        if ($response.Status -eq 200 -and $response.ContentType -match '^text/html(?:;|$)') { Add-Check 'private' ('internal-page-' + $path) 'PASS' 'Correct Host returned HTTP 200 HTML.' }
        else { Add-Check 'private' ('internal-page-' + $path) 'FAIL' 'Expected HTTP 200 HTML was not returned.' }
    }
    $response = Invoke-ReadOnlyHttp 'http://127.0.0.1:3000/api/health' 'readiness.invalid'
    if ($response.Status -eq 421) { Add-Check 'private' 'wrong-host' 'PASS' 'An alternate Host was rejected with 421.' }
    else { Add-Check 'private' 'wrong-host' 'FAIL' 'An alternate Host did not return the required 421 rejection.' }
    $response = Invoke-ReadOnlyHttp 'http://127.0.0.1:3000/api/health' $ClassroomDomain 'https://readiness.invalid'
    if ($response.Status -eq 403) { Add-Check 'private' 'wrong-origin' 'PASS' 'An alternate Origin was rejected with 403.' }
    else { Add-Check 'private' 'wrong-origin' 'FAIL' 'An alternate Origin did not return the required 403 rejection.' }
    $boundaryFailures = 0
    foreach ($path in @('/admin.html', '/api/admin', '/api/admin/status', '/mcp/images', '/api/image-mcp-save-local',
        '/api/teacher/image-mcp-save-local', '/api/student/image-mcp-save-local', '/data/classroom.sqlite', '/.env', '/deployment.json')) {
        $response = Invoke-ReadOnlyHttp ('http://127.0.0.1:3000' + $path) $ClassroomDomain
        if ($response.Status -ne 404) { $boundaryFailures++ }
    }
    if ($boundaryFailures -eq 0) { Add-Check 'private' 'restricted-routes' 'PASS' 'Ten admin/MCP/local-credential/database/configuration probes all returned 404.' }
    else { Add-Check 'private' 'restricted-routes' 'FAIL' ($boundaryFailures.ToString() + ' restricted GET probes did not return 404; no response content was printed.') }
} else { Add-Check 'private' 'internal-probes' 'FAIL' 'Skipped HTTP probes because the private listener could not be attributed to this deployment.' }

if ($null -eq $https) { Add-Check 'public' 'https-service' 'TODO' 'EmpvcHttps is not registered. Public HTTPS has not been enabled.' }
elseif (-not $CheckPublic) { Add-Check 'public' 'https-service' 'WARN' 'An HTTPS service is registered. Check exposure authorization separately; default mode does not validate public TLS.' }

try {
    $rules = @(Get-NetFirewallRule -ErrorAction Stop | Where-Object { $_.Name -in @('EMPVC-HTTP', 'EMPVC-HTTPS') })
    if ($rules.Count -eq 0) { Add-Check 'public' 'windows-firewall' 'TODO' 'No named EMPVC HTTP/HTTPS rules exist; default private checks do not require them.' }
    else { Add-Check 'public' 'windows-firewall' 'WARN' 'Named EMPVC website rules exist. This does not prove cloud security-group access or authorization.' }
} catch { Add-Check 'public' 'windows-firewall' 'WARN' 'Firewall metadata could not be inspected. No rule was changed.' }

Add-Check 'manual' 'icp-filing' 'TODO' 'Recheck official filing completion and access requirements; this script cannot verify or waive them.'
Add-Check 'manual' 'public-exposure-permission' 'TODO' 'DNS-account, cloud security-group and Windows administration permissions plus explicit exposure authorization must be confirmed by the operator.'
Add-Check 'manual' 'backup-migration-phones' 'TODO' 'Verify consistent cloud backup, isolated restore, authorized identity/media migration, new app packages and real iOS/Android classroom/offline flows.'

if (-not $CheckPublic) {
    Add-Check 'public' 'dns' 'TODO' 'Not queried in default private mode. Later require A=47.96.236.36 and no unconfigured AAAA.'
    Add-Check 'public' 'certificate-and-external-access' 'TODO' 'Not probed in default private mode. A running backend is not evidence of public TLS or external phone access.'
} else {
    $dnsReady = $false
    try {
        $records = @(Resolve-DnsName -Name $ClassroomDomain -Type A -DnsOnly -NoHostsFile | Where-Object { $_.Type -eq 'A' })
        $ipv6 = @(Resolve-DnsName -Name $ClassroomDomain -Type AAAA -DnsOnly -NoHostsFile -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'AAAA' })
        $dnsReady = ($records.Count -gt 0 -and @($records | Where-Object { $_.IPAddress -ne $ApprovedAddress }).Count -eq 0 -and $ipv6.Count -eq 0)
        if ($dnsReady) { Add-Check 'public' 'dns' 'PASS' 'This server DNS lookup returned only the approved A address and no AAAA. Also verify independent external resolvers.' }
        else { Add-Check 'public' 'dns' 'FAIL' 'A is missing/points elsewhere, or AAAA exists. No DNS change was attempted.' }
    } catch { Add-Check 'public' 'dns' 'FAIL' 'DNS lookup failed. No DNS change was attempted.' }

    try {
        $expectedHttpsWrapper = Join-Path $Root 'services\EmpvcHttps.exe'
        if ($null -eq $https -or ($https.PathName.Trim() -ine $expectedHttpsWrapper -and $https.PathName.Trim() -ine ('"' + $expectedHttpsWrapper + '"')) -or
            $https.StartName -ine 'NT AUTHORITY\LocalService' -or $https.StartMode -ne 'Auto' -or $https.State -ne 'Running') { throw 'Unexpected public service.' }
        $httpsXml = Read-ServiceXml (Join-Path $Root 'services\EmpvcHttps.xml')
        $expectedHttps = [ordered]@{
            '/service/id' = 'EmpvcHttps'
            '/service/executable' = 'C:\EMPVC\runtime\caddy\caddy.exe'
            '/service/arguments' = 'run --config "C:\EMPVC\services\Caddyfile" --adapter caddyfile'
            '/service/workingdirectory' = 'C:\EMPVC'
            '/service/startmode' = 'Automatic'
            '/service/serviceaccount/domain' = 'NT AUTHORITY'
            '/service/serviceaccount/user' = 'LocalService'
            '/service/depend' = 'EmpvcClassroom'
            '/service/env[@name="CLASSROOM_DOMAIN"]/@value' = $ClassroomDomain
        }
        foreach ($entry in $expectedHttps.GetEnumerator()) {
            if (-not (Test-XmlValue $httpsXml $entry.Key $entry.Value)) { throw 'Unexpected public service configuration.' }
        }
        $deployedCaddy = Get-ApprovedItem (Join-Path $Root 'services\Caddyfile') 'file'
        $templateCaddy = Get-ApprovedItem (Join-Path $Root 'deploy\windows\Caddyfile.windows') 'file'
        if ((Get-FileHash -LiteralPath $deployedCaddy.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $templateCaddy.FullName -Algorithm SHA256).Hash) { throw 'Caddy configuration drift.' }
        foreach ($path in @($expectedHttpsWrapper, (Join-Path $Root 'services\EmpvcHttps.xml'), $deployedCaddy.FullName)) {
            [void](Get-ApprovedItem $path 'file')
            if (-not (Test-PrivateAcl $path $false)) { throw 'Unexpected public configuration ACL.' }
        }
        Add-Check 'public' 'https-service-config' 'PASS' 'Expected HTTPS wrapper is Running/Automatic/LocalService, points to the deployed Caddy configuration, and matches the release Caddy template; checked ACLs are read-only to LocalService. Caddy was not executed.'
    } catch { Add-Check 'public' 'https-service-config' 'FAIL' 'Public service identity, selected XML settings, template digest or protected ACLs did not pass inspection.' }

    if ($null -ne [Net.ServicePointManager]::ServerCertificateValidationCallback) {
        Add-Check 'public' 'normal-tls-validation' 'FAIL' 'A custom certificate-validation callback exists in this PowerShell session. Use a fresh session with normal TLS validation; this script does not alter or bypass it.'
    } elseif ($dnsReady) {
        $response = Invoke-ReadOnlyHttp ($PublicOrigin + '/api/health') '' '' -ReadBody
        if (Test-HealthResponse $response) { Add-Check 'public' 'public-health-tls' 'PASS' 'Normal .NET certificate validation accepted HTTPS and health returned 200/ok=true from this server only.' }
        else { Add-Check 'public' 'public-health-tls' 'FAIL' 'HTTPS/TLS or bounded health response failed; no certificate bypass was used.' }
        foreach ($path in @('/', '/teacher.html')) {
            $response = Invoke-ReadOnlyHttp ($PublicOrigin + $path)
            if ($response.Status -eq 200 -and $response.ContentType -match '^text/html(?:;|$)') { Add-Check 'public' ('public-page-' + $path) 'PASS' 'HTTPS returned 200 HTML using normal certificate validation.' }
            else { Add-Check 'public' ('public-page-' + $path) 'FAIL' 'Normal HTTPS did not return 200 HTML.' }
        }
        $response = Invoke-ReadOnlyHttp ('http://' + $ClassroomDomain + '/teacher.html')
        if ($response.Status -in @(301, 302, 307, 308) -and $response.Location -ceq ($PublicOrigin + '/teacher.html')) {
            Add-Check 'public' 'http-redirect' 'PASS' 'HTTP redirects to the exact HTTPS classroom teacher URL; redirect was not followed.'
        } else { Add-Check 'public' 'http-redirect' 'FAIL' 'Expected HTTP-to-HTTPS redirect was not returned.' }
    } else { Add-Check 'public' 'public-http-probes' 'FAIL' 'Skipped public HTTP probes because DNS did not match the approved target.' }
    Add-Check 'manual' 'independent-external-acceptance' 'TODO' 'These probes originate on the server. Verify valid HTTPS and classroom flows from an independent network and real updated phones.'
}

$exitCode = 0
if (@($script:Checks | Where-Object { $_.scope -eq 'private' -and $_.status -eq 'FAIL' }).Count -gt 0) { $exitCode = 1 }
elseif ($CheckPublic -and @($script:Checks | Where-Object { $_.scope -eq 'public' -and $_.status -eq 'FAIL' }).Count -gt 0) { $exitCode = 2 }
Complete-Report $exitCode
exit $exitCode
