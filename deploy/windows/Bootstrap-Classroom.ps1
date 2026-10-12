#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Commit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$WinSwSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$DeploymentRoot='C:\EMPVC'
if(Test-Path -LiteralPath $DeploymentRoot){throw 'C:\EMPVC already exists; use the reviewed update procedure instead of overwriting it.'}
$Stage=Join-Path 'C:\' ('EMPVC-setup-'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $Stage){throw 'Staging directory already exists.'}
New-Item -ItemType Directory -Path $Stage | Out-Null
$Root=Join-Path $Stage 'release'
function Download([string]$Url,[string]$Path){
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Path -TimeoutSec 600
  if(-not(Test-Path -LiteralPath $Path)){throw 'Download did not produce a file.'}
}
function Check-Hash([string]$Path,[string]$Expected,[string]$Algorithm='SHA256'){
  if((Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant() -cne $Expected.ToLowerInvariant()){throw ('Checksum mismatch: '+[IO.Path]::GetFileName($Path))}
}
function Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw ('Deployment command failed: '+[IO.Path]::GetFileName($Program))}}

# Only public project source and official runtime assets are downloaded.
Write-Output 'EMPVC_PHASE=download-source'
Download ('https://codeload.github.com/ZuttoKlavier/Free-Impro.-Creative-Game/zip/'+$Commit) (Join-Path $Stage 'source.zip')
Expand-Archive -LiteralPath (Join-Path $Stage 'source.zip') -DestinationPath (Join-Path $Stage 'source') -Force
$Source=@(Get-ChildItem -LiteralPath (Join-Path $Stage 'source') -Directory)
if($Source.Count -ne 1){throw 'Unexpected source archive layout.'}
New-Item -ItemType Directory -Path $Root | Out-Null
# Keep the cloud tree limited to reviewed code; no Git history, mobile caches,
# local .env, classroom database, CA private keys or tunnel credentials.
foreach($name in @('package.json','package-lock.json','index.html','teacher.html','vite.config.js','server','src','public','scripts','requirements','deploy')){
  Copy-Item -LiteralPath (Join-Path $Source[0].FullName $name) -Destination $Root -Recurse
}
foreach($name in @('node','caddy','winsw')){New-Item -ItemType Directory -Path (Join-Path $Root ('runtime\'+$name)) -Force | Out-Null}

Write-Output 'EMPVC_PHASE=download-node'
$NodeManifest=Join-Path $Stage 'node-sha256.txt'
Download 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' $NodeManifest
$Manifest=Get-Content -LiteralPath $NodeManifest -Raw
$NodeMatch=[regex]::Match($Manifest,'(?m)^([a-f0-9]{64})\s+(node-v(24\.\d+\.\d+)-win-x64\.zip)\s*$')
if(-not $NodeMatch.Success -or [version]$NodeMatch.Groups[3].Value -lt [version]'24.15.0'){throw 'No supported official Node.js Windows release found.'}
$NodeZip=Join-Path $Stage 'node.zip'
Download ('https://nodejs.org/dist/v'+$NodeMatch.Groups[3].Value+'/'+$NodeMatch.Groups[2].Value) $NodeZip
Check-Hash $NodeZip $NodeMatch.Groups[1].Value
Expand-Archive -LiteralPath $NodeZip -DestinationPath (Join-Path $Stage 'node') -Force
$NodeFolder=@(Get-ChildItem -LiteralPath (Join-Path $Stage 'node') -Directory)
if($NodeFolder.Count -ne 1){throw 'Unexpected Node.js archive layout.'}
Get-ChildItem -LiteralPath $NodeFolder[0].FullName -Force | Copy-Item -Destination (Join-Path $Root 'runtime\node') -Recurse

Write-Output 'EMPVC_PHASE=download-caddy'
$CaddyVersion='2.11.7'
$CaddyAsset='caddy_'+$CaddyVersion+'_windows_amd64.zip'
$CaddyBase='https://github.com/caddyserver/caddy/releases/download/v'+$CaddyVersion+'/'
$CaddyManifest=Join-Path $Stage 'caddy-checksums.txt'
Download ($CaddyBase+'caddy_'+$CaddyVersion+'_checksums.txt') $CaddyManifest
$Sums=Get-Content -LiteralPath $CaddyManifest -Raw
$CaddyMatch=[regex]::Match($Sums,'(?m)^([a-f0-9]{128})\s+\*?'+[regex]::Escape($CaddyAsset)+'\s*$')
if(-not $CaddyMatch.Success){throw 'Caddy official release checksum missing.'}
$CaddyZip=Join-Path $Stage 'caddy.zip';Download ($CaddyBase+$CaddyAsset) $CaddyZip;Check-Hash $CaddyZip $CaddyMatch.Groups[1].Value 'SHA512'
Expand-Archive -LiteralPath $CaddyZip -DestinationPath (Join-Path $Root 'runtime\caddy') -Force
Write-Output 'EMPVC_PHASE=download-winsw'
$Wrapper=Join-Path $Root 'runtime\winsw\WinSW-x64.exe'
Download 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' $Wrapper
Check-Hash $Wrapper $WinSwSha256

$Node=Join-Path $Root 'runtime\node\node.exe';$Npm=Join-Path $Root 'runtime\node\npm.cmd'
$OldPath=$env:PATH;$OldElectron=$env:ELECTRON_SKIP_BINARY_DOWNLOAD;$OldPlaywright=$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
Push-Location $Root
try{
 $env:PATH=(Join-Path $Root 'runtime\node')+';'+$OldPath
 $env:ELECTRON_SKIP_BINARY_DOWNLOAD='1';$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
 Write-Output 'EMPVC_PHASE=install-build-dependencies'
 Checked $Npm @('ci','--include=dev','--ignore-scripts','--no-audit','--no-fund')
 Write-Output 'EMPVC_PHASE=build-pages'
 Checked $Npm @('run','build')
}finally{
 $env:PATH=$OldPath;[Environment]::SetEnvironmentVariable('ELECTRON_SKIP_BINARY_DOWNLOAD',$OldElectron,'Process');[Environment]::SetEnvironmentVariable('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',$OldPlaywright,'Process');Pop-Location
}
$Ledger=[ordered]@{commit=$Commit;nodeVersion=$NodeMatch.Groups[3].Value;nodeSha256=$NodeMatch.Groups[1].Value;caddyVersion=$CaddyVersion;caddySha512=$CaddyMatch.Groups[1].Value;winSwVersion='2.12.0';winSwSha256=$WinSwSha256}
$Ledger|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Root 'deployment.json') -Encoding UTF8
if(Test-Path -LiteralPath $DeploymentRoot){throw 'Deployment directory was created during preparation; refusing to overwrite it.'}
Move-Item -LiteralPath $Root -Destination $DeploymentRoot
Write-Output 'EMPVC_PHASE=install-private-classroom'
& (Join-Path $DeploymentRoot 'deploy\windows\Install-Classroom.ps1') -ClassroomDomain 'class.empfreeimpro.xyz'
if(-not $?){throw 'Classroom service installation failed.'}
