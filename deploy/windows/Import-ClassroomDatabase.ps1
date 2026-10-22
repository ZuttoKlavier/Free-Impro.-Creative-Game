#requires -Version 5.1
#requires -RunAsAdministrator
<#
Import an explicitly approved, standalone classroom snapshot into the private
Windows deployment. Keeps an SQLite-consistent old snapshot plus raw originals.
Does not enable HTTPS, change firewall rules, or output account/identity data.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceFile,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [switch]$ConfirmMigration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfirmMigration.IsPresent) { throw 'Database migration requires explicit -ConfirmMigration authorization.' }
if ($env:OS -ne 'Windows_NT') { throw 'Run this script on the private Windows classroom server.' }
$Root = 'C:\EMPVC'
$DataDirectory = Join-Path $Root 'data'
$Database = Join-Path $DataDirectory 'classroom.sqlite'
$Node = Join-Path $Root 'runtime\node\node.exe'
$BackupModule = Join-Path $Root 'scripts\cloud-backup.js'
$AppWrapper = Join-Path $Root 'services\EmpvcClassroom.exe'
$Domain = 'class.empfreeimpro.xyz'
$ExpectedSha256 = $ExpectedSha256.ToLowerInvariant()

function Assert-SafePath([string]$Path, [bool]$Directory = $false) {
    if ($Path -notmatch '^[a-zA-Z]:\\' -or $Path.Substring(3).Contains(':')) { throw 'Only ordinary local drive paths are supported.' }
    $full = [IO.Path]::GetFullPath($Path)
    $item = Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if ($item.PSIsContainer -ne $Directory) { throw 'An expected regular file or directory is missing.' }
    $cursor = $full
    $driveRoot = [IO.Path]::GetPathRoot($full)
    while ($cursor) {
        $part = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
        if ($part.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not supported for database migration.' }
        if ($cursor.TrimEnd('\').Equals($driveRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { break }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if (-not $parent -or $parent -eq $cursor) { break }
        if ($parent -match '^[a-zA-Z]:$') { $parent += '\' }
        $cursor = $parent
    }
    return $full
}

function Set-PrivatePermissions([string]$Path, [bool]$Writable) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cannot assign permissions through a reparse point.' }
    $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $localService = [Security.Principal.SecurityIdentifier]::new('S-1-5-19')
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
    $rights = [Security.AccessControl.FileSystemRights]::Read
    if ($item.PSIsContainer) { $rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute }
    if ($Writable) { $rights = [Security.AccessControl.FileSystemRights]::Modify }
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($localService, $rights,
        $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Assert-OwnedService {
    $service = Get-CimInstance -ClassName Win32_Service -Filter "Name='EmpvcClassroom'"
    if ($null -eq $service -or ($service.PathName.Trim() -ine $AppWrapper -and $service.PathName.Trim() -ine ('"' + $AppWrapper + '"')) -or
        $service.StartName -ine 'NT AUTHORITY\LocalService') { throw 'The classroom service does not belong to this private deployment under LocalService.' }
    if ($null -ne (Get-CimInstance -ClassName Win32_Service -Filter "Name='EmpvcHttps'")) { throw 'Public HTTPS must remain absent during this private migration.' }
    if (@(Get-NetTCPConnection -State Listen -LocalPort 80,443 -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'An unexpected public web listener requires review before private database migration.'
    }
    return $service
}

function Assert-OwnedListener {
    $service = Assert-OwnedService
    if ($service.State -ne 'Running') { throw 'The private classroom service must be running before migration.' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'The expected exclusive loopback listener was not found.' }
    $process = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $listeners[0].OwningProcess)
    if ($null -eq $process -or $process.ExecutablePath -ine $Node -or $process.ParentProcessId -ne $service.ProcessId) {
        throw 'Port 3000 is held by an external or unexpected process; no migration was attempted.'
    }
}

function Assert-DatabaseNeighbors([string]$Path, [bool]$Standalone) {
    $folder = [IO.Path]::GetDirectoryName($Path); $name = [IO.Path]::GetFileName($Path)
    $allowed = @($name)
    if (-not $Standalone) { $allowed += @($name + '-wal', $name + '-shm') }
    foreach ($item in @(Get-ChildItem -LiteralPath $folder -Filter ($name + '*') -Force)) {
        if ($allowed -notcontains $item.Name -or $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Unknown database neighbor, sidecar, or reparse point requires manual review.'
        }
    }
}

function Assert-ExclusiveDatabaseFiles([string]$Path) {
    foreach ($name in @($Path, $Path + '-wal', $Path + '-shm')) {
        if (Test-Path -LiteralPath $name) {
            $handle = [IO.File]::Open($name, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            $handle.Dispose()
        }
    }
}

function Validate-Database([string]$Path, [bool]$Standalone) {
    $code = @'
import { DatabaseSync } from 'node:sqlite';
import { openSync, readSync, closeSync } from 'node:fs';
let database;
try {
  const path = process.argv[2], standalone = process.argv[3] === 'true';
  if (standalone) {
    const descriptor = openSync(path, 'r'), header = Buffer.alloc(100);
    try { if (readSync(descriptor, header, 0, 100, 0) !== 100 || header.toString('ascii', 0, 16) !== 'SQLite format 3\0' || header[18] !== 1 || header[19] !== 1) throw new Error(); }
    finally { closeSync(descriptor); }
  }
  database = new DatabaseSync(path, { readOnly: true });
  database.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON;');
  const checks = database.prepare('PRAGMA integrity_check').all();
  if (checks.length !== 1 || checks[0].integrity_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error();
  const required = { users: ['id','username','name','role','salt','password'], sessions: ['token','user_id','expires'], classrooms: ['id','code','teacher_id'], members: ['class_id','student_id'], submissions: ['id','class_id','student_id','audio'] };
  const tables = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
  for (const [table, names] of Object.entries(required)) {
    if (!tables.has(table)) throw new Error();
    const columns = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name));
    if (names.some(name => !columns.has(name))) throw new Error();
  }
  if (database.prepare("SELECT 1 FROM users WHERE role NOT IN ('student','teacher') LIMIT 1").get()) throw new Error();
} catch { console.error('Database validation failed; no identity data is displayed.'); process.exitCode = 1; }
finally { database?.close(); }
'@
    $standaloneArgument = $Standalone.ToString().ToLowerInvariant()
    $code | & $Node '--no-warnings' '--input-type=module' '-' $Path $standaloneArgument | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Readonly SQLite integrity, relationships, or classroom schema validation failed.' }
}

function Backup-OldDatabase([string]$Directory) {
    # Reuse the reviewed SQLite backup API, including committed WAL contents.
    $code = @'
import { pathToFileURL } from 'node:url';
try {
  const { backupClassroom } = await import(pathToFileURL(process.argv[4]).href);
  const path = await backupClassroom({ dbPath: process.argv[2], directory: process.argv[3] });
  console.log(JSON.stringify({ backup: path }));
} catch { console.error('Consistent old-database backup failed.'); process.exitCode = 1; }
'@
    $output = @($code | & $Node '--no-warnings' '--input-type=module' '-' $Database $Directory $BackupModule)
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'Cannot create a verified consistent backup of the previous classroom database.' }
    $result = $output[0] | ConvertFrom-Json
    $path = Assert-SafePath $result.backup
    if (-not $path.StartsWith($Directory + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected backup destination.' }
    Validate-Database $path $true
    return $path
}

function Stop-OwnedService {
    $service = Assert-OwnedService
    if ($service.State -ne 'Stopped') {
        Stop-Service -Name EmpvcClassroom -ErrorAction Stop
        (Get-Service -Name EmpvcClassroom).WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(30))
    }
    if (@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Port 3000 remains occupied after stopping the owned service; external activity requires manual review.'
    }
}

function Start-OwnedService {
    $service = Assert-OwnedService
    if ($service.State -ne 'Stopped') { throw 'The owned service is not stopped at the expected start boundary.' }
    if (@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue).Count -gt 0) { throw 'An external listener prevents a safe classroom restart.' }
    Start-Service -Name EmpvcClassroom -ErrorAction Stop
    (Get-Service -Name EmpvcClassroom).WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
}

function Wait-Healthy {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $response = $null
        try {
            $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:3000/api/health')
            $request.Host = $Domain; $request.Proxy = $null; $request.AllowAutoRedirect = $false; $request.Timeout = 2500
            $response = $request.GetResponse()
            $reader = [IO.StreamReader]::new($response.GetResponseStream())
            try { $state = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            if ([int]$response.StatusCode -eq 200 -and $state.ok -eq $true) { Assert-OwnedListener; return }
        } catch { } finally { if ($null -ne $response) { $response.Dispose() } }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The domain-bound private classroom health check failed.'
}

# No service or database changes occur until all input/preflight checks pass.
$SourceFile = Assert-SafePath $SourceFile
$null = Assert-SafePath $Root $true
$null = Assert-SafePath $DataDirectory $true
$null = Assert-SafePath $Database
foreach ($path in @($Node, $BackupModule, $AppWrapper)) { $null = Assert-SafePath $path }
if ($SourceFile.Equals($Database, [StringComparison]::OrdinalIgnoreCase)) { throw 'The uploaded source must be separate from the active database.' }
if ([IO.DriveInfo]::new('C:\').DriveFormat -ne 'NTFS') { throw 'This atomic import procedure requires the reviewed NTFS deployment volume.' }
Assert-DatabaseNeighbors $SourceFile $true
Assert-DatabaseNeighbors $Database $false
Assert-OwnedListener
Wait-Healthy
$BackupsDirectory = Join-Path $Root 'backups'
$null = Assert-SafePath $BackupsDirectory $true
$OperationDirectory = Join-Path $BackupsDirectory ('import-' + [Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $OperationDirectory) { throw 'An unexpected migration directory already exists.' }
New-Item -ItemType Directory -Path $OperationDirectory | Out-Null
Set-PrivatePermissions $OperationDirectory $false
$RawOldDirectory = Join-Path $OperationDirectory 'raw-old'
$RawFailedDirectory = Join-Path $OperationDirectory 'raw-failed'
foreach ($path in @($RawOldDirectory, $RawFailedDirectory)) { New-Item -ItemType Directory -Path $path | Out-Null; Set-PrivatePermissions $path $false }
$Candidate = Join-Path $OperationDirectory 'candidate.sqlite'
$Receipt = Join-Path $OperationDirectory 'migration.json'
$stoppedForImport = $false
$touchedDatabase = $false
$oldSnapshot = $null
$receiptState = [ordered]@{ version=1; expectedSha256=$ExpectedSha256; state='validating'; oldSnapshot=$null; restored=$false }

try {
    # Deny writers/deleters while hashing and copying the source. No credentials
    # or records are read into PowerShell, console output, or the migration receipt.
    $sourceHandle = [IO.File]::Open($SourceFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if ((Get-FileHash -LiteralPath $SourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha256) { throw 'Uploaded database SHA256 does not match the approved snapshot.' }
        $candidateHandle = [IO.File]::Open($Candidate, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $sourceHandle.CopyTo($candidateHandle); $candidateHandle.Flush($true) } finally { $candidateHandle.Dispose() }
    } finally { $sourceHandle.Dispose() }
    Set-PrivatePermissions $Candidate $false
    if ((Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha256) { throw 'Candidate copy did not preserve the approved bytes.' }
    Assert-DatabaseNeighbors $Candidate $true
    Validate-Database $Candidate $true
    if ((Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha256) { throw 'Readonly candidate validation changed the snapshot.' }

    Assert-OwnedListener
    # Record intent before Stop-Service so errors after an actual stop still
    # enter the restart/restore path.
    $stoppedForImport = $true
    Stop-OwnedService
    Assert-DatabaseNeighbors $Database $false
    Assert-ExclusiveDatabaseFiles $Database
    $oldSnapshot = Backup-OldDatabase $OperationDirectory
    Set-PrivatePermissions $oldSnapshot $false
    $receiptState.oldSnapshot = [IO.Path]::GetFileName($oldSnapshot)
    $receiptState.state = 'old-backup-verified'
    $receiptState | ConvertTo-Json | Set-Content -LiteralPath $Receipt -Encoding UTF8
    Set-PrivatePermissions $Receipt $false

    Assert-DatabaseNeighbors $Database $false
    Assert-ExclusiveDatabaseFiles $Database
    $touchedDatabase = $true
    foreach ($suffix in @('-wal', '-shm')) {
        $sidecar = $Database + $suffix
        if (Test-Path -LiteralPath $sidecar) {
            $raw = Join-Path $RawOldDirectory ('classroom.sqlite' + $suffix)
            [IO.File]::Move($sidecar, $raw); Set-PrivatePermissions $raw $false
        }
    }
    # Candidate, active database and raw backup are on the same NTFS volume.
    # File.Replace preserves the previous main file; no WAL/SHM is deleted.
    [IO.File]::Replace($Candidate, $Database, (Join-Path $RawOldDirectory 'classroom.sqlite'))
    Set-PrivatePermissions (Join-Path $RawOldDirectory 'classroom.sqlite') $false
    Set-PrivatePermissions $DataDirectory $true
    Set-PrivatePermissions $Database $true
    if ((Get-FileHash -LiteralPath $Database -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedSha256) { throw 'The installed database differs from the approved snapshot.' }
    Validate-Database $Database $true
    Start-OwnedService
    Wait-Healthy
    $receiptState.state = 'imported-private-healthy'
    $receiptState | ConvertTo-Json | Set-Content -LiteralPath $Receipt -Encoding UTF8
    Set-PrivatePermissions $Receipt $false
    Write-Host 'Approved database imported and validated; the private classroom service is healthy. HTTPS remains absent.'
    Write-Host 'The uploaded source, consistent previous snapshot, and previous raw files have been retained for administrator review.'
} catch {
    $recovered = $false
    if ($stoppedForImport) {
        try {
            Stop-OwnedService
            if ($touchedDatabase) {
                if (-not $oldSnapshot) { throw 'A verified old snapshot is required for restoration.' }
                $null = Assert-SafePath $oldSnapshot
                Validate-Database $oldSnapshot $true
                Assert-DatabaseNeighbors $Database $false
                if (Test-Path -LiteralPath $Database) { Assert-ExclusiveDatabaseFiles $Database }
                foreach ($suffix in @('-wal', '-shm')) {
                    $sidecar = $Database + $suffix
                    if (Test-Path -LiteralPath $sidecar) {
                        $raw = Join-Path $RawFailedDirectory ('classroom.sqlite' + $suffix)
                        [IO.File]::Move($sidecar, $raw); Set-PrivatePermissions $raw $false
                    }
                }
                $restore = Join-Path $OperationDirectory 'restore.sqlite'
                [IO.File]::Copy($oldSnapshot, $restore, $false)
                if (Test-Path -LiteralPath $Database) {
                    [IO.File]::Replace($restore, $Database, (Join-Path $RawFailedDirectory 'classroom.sqlite'))
                    Set-PrivatePermissions (Join-Path $RawFailedDirectory 'classroom.sqlite') $false
                } else { [IO.File]::Move($restore, $Database) }
                Set-PrivatePermissions $DataDirectory $true
                Set-PrivatePermissions $Database $true
                Validate-Database $Database $true
            }
            Start-OwnedService
            Wait-Healthy
            $recovered = $true
        } catch { }
    }
    $receiptState.state = 'failed'; $receiptState.restored = $recovered
    try {
        $receiptState | ConvertTo-Json | Set-Content -LiteralPath $Receipt -Encoding UTF8
        Set-PrivatePermissions $Receipt $false
    } catch { }
    if ($recovered) { throw 'Import failed. The previous database/service state was restored and passed the private health check; retained snapshots require review.' }
    if ($stoppedForImport) { throw 'Import failed and automatic recovery could not be verified. Do not enable HTTPS or delete retained files; administrator recovery is required.' }
    throw 'Import input/candidate validation failed before service changes. The previous database and running service were not changed.'
}
