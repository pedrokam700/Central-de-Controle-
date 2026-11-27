# Windows LAB only: test the EXISTING coordinator's assisted read branch.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows'){throw 'DISPOSABLE_WINDOWS_ONLY'}
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$source=Join-Path $repo 'tools\ames-workstation\TROCAR_PARA_PR69_NOVA.ps1'
$text=[IO.File]::ReadAllText($source)
if(-not $text.Contains('[switch]$IdentifyOnly')){throw 'RED_NO_ASSISTED_READ_BRANCH_IN_EXISTING_COORDINATOR'}
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){$errors|ForEach-Object {Write-Output $_.Message};throw 'PARSE_FAILED'}
$interop=[regex]::Match($text,"(?s)Add-Type -TypeDefinition @'\s*\r?\n(.*?)\r?\n'@")
if(-not $interop.Success){throw 'EXISTING_NATIVE_ARGV_PARSER_MISSING'}
Add-Type -TypeDefinition $interop.Groups[1].Value
$IdentifyOnly=$true
foreach($name in @('Full','EqualPath','Assert-ReadOnlySwitchPath','RootFor','SplitArgv','ValueAfter','RelauncherType','Identify','RegistryRun','Get-ReadOnlySwitchObservation','Resolve-RegisteredSwitchRoot','Read-OnlySwitchPreflight')){
 $nodes=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true))
 if($nodes.Count -ne 1){throw ('SHARED_FUNCTION_MISSING '+$name)}
 . ([scriptblock]::Create($nodes[0].Extent.Text))
}
$lab=Join-Path $env:RUNNER_TEMP ('PR98-ASSISTED-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $lab
$NewRoot=Join-Path $lab 'B';$A=Join-Path $lab 'A [original]';$Other=Join-Path $lab 'OTHER'
foreach($root in @($NewRoot,$A,$Other)){
 $null=New-Item -ItemType Directory -Path (Join-Path $root 'suporte\ames-workstation') -Force
 $null=New-Item -ItemType Directory -Path (Join-Path $root 'ames-agent\data') -Force
 [IO.File]::WriteAllText((Join-Path $root '00_INICIAR_AQUI.bat'),'SYNTHETIC MARKER NEVER EXECUTED')
 [IO.File]::WriteAllText((Join-Path $root 'ames-agent\agent_hardened_entry.py'),'SYNTHETIC METADATA NEVER EXECUTED')
 [IO.File]::WriteAllText((Join-Path $root 'CANDIDATE_MANIFEST.json'),'{"sha":"eedacc65445dea9967a92085777b878c1ee9c123"}')
 foreach($name in @('config.json','data\local_agent_token','data\ames_local.sqlite3','data\ames_local.sqlite3-wal','data\checkpoint.json')){[IO.File]::WriteAllText((Join-Path $root ('ames-agent\'+$name)),('OPAQUE SYNTHETIC '+$name))}
 foreach($name in @('START_AGENT_CANONICAL.ps1','KEEP_AGENT_RUNNING.ps1','ISSUE57_RELAUNCH_ENROLLMENT.ps1')){Copy-Item -LiteralPath (Join-Path $repo ('tools\ames-workstation\'+$name)) -Destination (Join-Path $root ('suporte\ames-workstation\'+$name))}
}
$RunKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run';$RunName='CentralAMESOperatorAgent'
function Run-For([string]$root){return 'powershell.exe -NoProfile -File "'+(Join-Path $root 'suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1')+'" -Root "'+$root+'"'}
function Proc([int]$Id,[string]$Kind,[string]$Root){
 $exe=if($Kind -eq 'agent'){'C:\Python312\python.exe'}else{Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'}
 $command=if($Kind -eq 'agent'){'"'+$exe+'" -u "'+(Join-Path $Root 'ames-agent\agent_hardened_entry.py')+'"'}else{Run-For $Root}
 return [pscustomobject]@{ProcessId=$Id;ExecutablePath=$exe;CommandLine=$command;CreationDate=[datetime]'2026-11-19T12:00:00Z'}
}
function Observe($Listeners=@(),$Processes=@(),$Run=$null,[switch]$Changed){
 $script:obs=[pscustomobject]@{listeners=@($Listeners);processes=@($Processes);run=$Run};$script:reads=0;$script:changed=[bool]$Changed
 function Get-ReadOnlySwitchObservation {$script:reads++;if($script:changed -and $script:reads -gt 1){return [pscustomobject]@{listeners=@();processes=@();run=$null}};return $script:obs}
 Read-OnlySwitchPreflight
}
function Listener([int]$Id){return [pscustomobject]@{LocalPort=8765;LocalAddress='127.0.0.1';OwningProcess=$Id}}
$passed=0
function Case([string]$Name,[scriptblock]$Body){& $Body;$script:passed++;Write-Output ('PASS '+$Name)}
function Check-Stop($Result,[string]$Reason){if($Result.status -ne 'STOP' -or $Result.reason -ne $Reason -or $Result.update_authorized){throw ('EXPECTED_STOP '+$Reason+' '+($Result|ConvertTo-Json -Compress -Depth 4))}}
function Fingerprint {return (@(Get-ChildItem -LiteralPath $lab -Recurse -File -Force|Sort-Object FullName|ForEach-Object {$_.FullName+' '+(Get-FileHash -LiteralPath $_.FullName).Hash}) -join "`n")}
$before=Fingerprint
Case 'zero listener distinguished from ambiguity; no data root invented' {Check-Stop (Observe) 'NO_LISTENER_NO_PROVEN_ROOT'}
Case 'multiple owners stop before registry fallback' {Check-Stop (Observe @((Listener 10),(Listener 11)) @() (Run-For $A)) 'MULTIPLE_LISTENER_OWNERS'}
Case 'unknown owner never replaced by registered root' {Check-Stop (Observe @((Listener 10)) @((Proc 20 'agent' $A)) (Run-For $A)) 'UNKNOWN_LISTENER_OWNER'}
Case 'active root uses shared Identify and is observation not update GO' {
 $r=Observe @((Listener 10)) @((Proc 10 'agent' $A),(Proc 11 'guardian' $A)) (Run-For $A)
 if($r.status -ne 'IDENTIFIED_ACTIVE' -or $r.root -ine $A -or $r.listener_owner_count -ne 1 -or $r.update_authorized -or $r.maintenance_lease -or $r.browser_sync_attested -or $r.state_originality_proven){throw 'FALSE_GO_OR_WRONG_ROOT'}
}
Case 'inactive registered root without process is a candidate only and STOP' {
 $r=Observe @() @() (Run-For $A);Check-Stop $r 'REGISTERED_ROOT_WITHOUT_ACTIVE_WITNESS';if($r.root -ine $A){throw 'REGISTERED_ROOT_NOT_REPORTED'}
}
Case 'guardian and Run agree without listener; no agent is started' {
 $r=Observe @() @((Proc 11 'guardian' $A)) (Run-For $A);Check-Stop $r 'INACTIVE_ROOT_FOUND_DATA_UNVERIFIED';if($r.root -ine $A){throw 'GUARDIAN_ROOT_NOT_REPORTED'}
}
Case 'temporarily non listening agent retains root but STOP' {Check-Stop (Observe @() @((Proc 10 'agent' $A),(Proc 11 'guardian' $A)) (Run-For $A)) 'AGENT_NOT_LISTENING'}
Case 'conflicting Run and guardian stop' {Check-Stop (Observe @() @((Proc 11 'guardian' $A)) (Run-For $Other)) 'CONFLICTING_ROOT_EVIDENCE'}
Case 'multiple process roots stop' {Check-Stop (Observe @() @((Proc 11 'guardian' $A),(Proc 12 'guardian' $Other)) (Run-For $A)) 'CONFLICTING_ROOT_EVIDENCE'}
Case 'unregistered guardian is not silently adopted' {Check-Stop (Observe @() @((Proc 11 'guardian' $A))) 'GUARDIAN_NOT_REGISTERED'}
Case 'malformed registry does not guess another folder' {Check-Stop (Observe @() @() 'powershell.exe -File C:\UNKNOWN.ps1') 'REGISTERED_ROOT_UNRECOGNIZED'}
Case 'state journal requires supervision even with active listener' {
 $null=New-Item -ItemType Directory -Path (Join-Path $A '.ames-update')
 try{Check-Stop (Observe @((Listener 10)) @((Proc 10 'agent' $A)) (Run-For $A)) 'MAINTENANCE_STATE_REQUIRES_REVIEW'}finally{[IO.Directory]::Delete((Join-Path $A '.ames-update'))}
}
Case 'source change during observation stops' {Check-Stop (Observe @((Listener 10)) @((Proc 10 'agent' $A)) (Run-For $A) -Changed) 'OBSERVATION_CHANGED'}
Case 'opaque config token SQLite WAL may stay exclusively locked' {
 $locks=@();try{
  foreach($p in @('config.json','data\local_agent_token','data\ames_local.sqlite3','data\ames_local.sqlite3-wal')){$locks+=,[IO.File]::Open((Join-Path $A ('ames-agent\'+$p)),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
  $r=Observe @((Listener 10)) @((Proc 10 'agent' $A)) (Run-For $A);if($r.status -ne 'IDENTIFIED_ACTIVE'){throw 'PRIVATE_CONTENT_WAS_REQUIRED'}
 }finally{foreach($h in $locks){$h.Dispose()}}
}
Case 'UNC path refused before share access' {
 $stopped=$false;try{Assert-ReadOnlySwitchPath '\\SYNTHETIC-UNREACHABLE\private\agent.py'}catch{$stopped=$_.Exception.Message -eq 'NONLOCAL_PATH'}
 if(-not $stopped){throw 'UNC_NOT_REFUSED'}
}
Case 'junction ancestor is refused without following its destination' {
 $link=Join-Path $lab 'junction'
 # Native mklink preserves literal brackets; Windows PowerShell New-Item's
 # -Target expands them as a wildcard and failed before testing the reader.
 $null=& cmd.exe /d /c ('mklink /J "'+$link+'" "'+$A+'"')
 if($LASTEXITCODE -ne 0){throw 'JUNCTION_FIXTURE_NOT_CREATED'}
 try{
  $stopped=$false;try{Assert-ReadOnlySwitchPath (Join-Path $link 'ames-agent\agent_hardened_entry.py')}catch{$stopped=$_.Exception.Message -eq 'REPARSE_PATH'}
  if(-not $stopped){throw 'JUNCTION_NOT_REFUSED'}
 }finally{[IO.Directory]::Delete($link)}
}
Case 'missing private state never creates a replacement identity or database' {
 $file=Join-Path $A 'ames-agent\data\ames_local.sqlite3';$raw=[IO.File]::ReadAllBytes($file);[IO.File]::Delete($file)
 try{
  if([IO.File]::Exists($file)){throw 'MISSING_DATABASE_FIXTURE_NOT_ACTIVE'}
  Check-Stop (Observe @((Listener 10)) @((Proc 10 'agent' $A)) (Run-For $A)) 'ROOT_OR_STATE_METADATA_UNVERIFIED'
  if(Test-Path -LiteralPath $file){throw 'DATABASE_CREATED'}
 }finally{[IO.File]::WriteAllBytes($file,$raw)}
}
Case 'unknown public guardian version is not adopted' {
 $file=Join-Path $A 'suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1';$raw=[IO.File]::ReadAllBytes($file)
 try{[IO.File]::WriteAllText($file,'SYNTHETIC UNKNOWN');Check-Stop (Observe @((Listener 10)) @((Proc 10 'agent' $A)) (Run-For $A)) 'PUBLIC_BARRIER_UNRECOGNIZED'}finally{[IO.File]::WriteAllBytes($file,$raw)}
}
Case 'query failure is unknown evidence and never a zero observation' {
 function Get-ReadOnlySwitchObservation {throw 'SYNTHETIC_CIM_OR_TCP_ACCESS_DENIED'}
 $r=Read-OnlySwitchPreflight;Check-Stop $r 'OBSERVATION_UNAVAILABLE';if($null -ne $r.listener_owner_count){throw 'FAILURE_BECAME_ZERO'}
}
Case 'all fixture files unchanged; no backup config or journal created' {if((Fingerprint) -cne $before){throw 'FILES_CHANGED'}}
Case 'normal mutation tail is exact approved code; read branch terminates before it' {
 $old=(& git -C $repo show 3ab8df55e03fa2b961df100649de6541d2232bd6:tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1) -join "`n"
 $anchor="try {`n  if(Test-Path -LiteralPath (Join-Path `$NewRoot '.ames-switch'))"
 $index=$text.IndexOf($anchor);$oldIndex=$old.IndexOf($anchor)
 if($index -lt 0 -or $oldIndex -lt 0 -or $text.Substring($index).Trim() -cne $old.Substring($oldIndex).Trim()){throw 'APPROVED_MUTATION_TAIL_CHANGED'}
}
Case 'one entry delegates to existing BAT and never installs or bypasses policy' {
 $entry=[IO.File]::ReadAllText((Join-Path $repo 'tools\ames-workstation\00_CONFERIR_ATUALIZACAO.bat'))
 if(-not $entry.Contains('01_TROCAR.bat') -or -not $entry.Contains('/identificar') -or $entry -match '(?i)ExecutionPolicy|Bypass|Invoke-Expression|EncodedCommand'){throw 'ENTRY_NOT_SINGLE_SAFE_DELEGATION'}
}
Case 'explicit future package inventory includes single entry without executing builder' {
 $builder=[IO.File]::ReadAllText((Join-Path $repo 'scripts\build-integrated-candidate.py'))
 if($builder -notmatch "FIRST_RUN_FILES=\('[^']*00_CONFERIR_ATUALIZACAO\.bat'"){throw 'ASSISTED_ENTRY_NOT_PACKAGED'}
}
Case 'real integrated entry executes only read branch on an empty disposable station' {
 # Genuine local CIM/TCP/Run observation on the runner. No fixture process/Run
 # is injected, and no Central/SQLite/guardian is opened to create a witness.
 $sandbox=Join-Path $lab 'REAL_ENTRY';$null=New-Item -ItemType Directory -Path $sandbox
 foreach($name in @('01_TROCAR.bat','01_TROCAR_PARA_PR69_NOVA.bat','00_CONFERIR_ATUALIZACAO.bat','TROCAR_PARA_PR69_NOVA.ps1')){Copy-Item -LiteralPath (Join-Path $repo ('tools\ames-workstation\'+$name)) -Destination (Join-Path $sandbox $name)}
 $beforeReal=@(Get-ChildItem -LiteralPath $sandbox -Recurse -File|ForEach-Object {$_.FullName+' '+(Get-FileHash -LiteralPath $_.FullName).Hash}) -join "`n"
 $out=& cmd.exe /d /c ('call "'+(Join-Path $sandbox '00_CONFERIR_ATUALIZACAO.bat')+'" <NUL') 2>&1;$code=$LASTEXITCODE
 if($code -ne 2 -or ($out -join "`n") -notmatch 'NO_LISTENER_NO_PROVEN_ROOT'){throw ('REAL_EMPTY_STATION_UNEXPECTED_RESULT '+($out -join "`n"))}
 $afterReal=@(Get-ChildItem -LiteralPath $sandbox -Recurse -File|ForEach-Object {$_.FullName+' '+(Get-FileHash -LiteralPath $_.FullName).Hash}) -join "`n"
 if($afterReal -cne $beforeReal){throw 'READ_BRANCH_WROTE_FILES'}
}
Case 'restricted PowerShell causes TI STOP through real BAT without executing coordinator' {
 $sandbox=Join-Path $lab 'POLICY';$null=New-Item -ItemType Directory -Path $sandbox
 foreach($name in @('01_TROCAR.bat','01_TROCAR_PARA_PR69_NOVA.bat','00_CONFERIR_ATUALIZACAO.bat')){Copy-Item -LiteralPath (Join-Path $repo ('tools\ames-workstation\'+$name)) -Destination (Join-Path $sandbox $name)}
 $sentinel=Join-Path $sandbox 'SHOULD_NOT_EXIST'
 [IO.File]::WriteAllText((Join-Path $sandbox 'TROCAR_PARA_PR69_NOVA.ps1'),("[IO.File]::WriteAllText('"+$sentinel+"','EXECUTED');exit 0"))
 $prior=$env:PSExecutionPolicyPreference
 try{
  $env:PSExecutionPolicyPreference='Restricted'
  $observed=& powershell.exe -NoProfile -Command 'Get-ExecutionPolicy';if($observed -ne 'Restricted'){throw 'RESTRICTED_FIXTURE_NOT_ACTIVE'}
  $out=& cmd.exe /d /c ('call "'+(Join-Path $sandbox '00_CONFERIR_ATUALIZACAO.bat')+'" <NUL') 2>&1;$code=$LASTEXITCODE
  if($code -ne 77 -or ($out -join "`n") -notmatch 'STOP_TI_EXECUTION_POLICY' -or (Test-Path -LiteralPath $sentinel)){throw 'POLICY_WAS_BYPASSED_OR_WRONG_STOP'}
 }finally{if($null -eq $prior){Remove-Item Env:PSExecutionPolicyPreference -ErrorAction SilentlyContinue}else{$env:PSExecutionPolicyPreference=$prior}}
}
Write-Output ('ASSISTED_PREFLIGHT_CONTRACTS='+$passed+'; SHARED_COORDINATOR; NO_AGENT_OR_SQLITE_OR_MES; NO_POLICY_BYPASS')
exit 0
