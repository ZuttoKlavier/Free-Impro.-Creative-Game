$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$Root='C:\EMPVC'
function Assert-ProtectedConfig($p){}
function Start-Sleep {param($Seconds)}
function Probe($p){$script:probes++;if($script:probes -lt 3){return [pscustomobject]@{status=0;healthy=$false}};return [pscustomobject]@{status=200;healthy=$true}}
function Assert-Service([bool]$running,[bool]$https=$true){if($script:probes -lt 3){throw 'Ownership checked before backend ready'};if($https -and $script:httpsState -ne 'Running'){throw 'HTTPS checked before startup'};$script:assertions++}
function Get-CimInstance {param($ClassName,$Filter);return [pscustomobject]@{State=$script:httpsState}}
function Get-Service {param($Name);return [pscustomobject]@{Status=$script:httpsState}}
function Invoke-Checked {param($Path,$Arguments);$script:starts++;$script:httpsState='Running';return 0}
$controller = Join-Path $PSScriptRoot '../deploy/windows/Update-ClassroomRelease.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($controller, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Deployment controller syntax invalid' }
$functions = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-ExistingHttps'}, $true))
if ($functions.Count -ne 1) { throw 'Expected one HTTPS startup helper' }
. ([ScriptBlock]::Create($functions[0].Extent.Text))

foreach($initial in @('Running','Stopped')){$script:probes=0;$script:assertions=0;$script:starts=0;$script:httpsState=$initial;Start-ExistingHttps @{};if($script:probes -ne 3 -or $script:assertions -ne 2 -or $script:httpsState -ne 'Running'){throw 'Readiness order failed'};if(($initial -eq 'Stopped' -and $script:starts -ne 1) -or ($initial -eq 'Running' -and $script:starts -ne 0)){throw 'Existing service restart policy failed'}}
'HTTPS_STARTUP_READINESS_TESTS_PASS: 2'
