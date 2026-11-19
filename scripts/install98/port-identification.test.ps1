# Synthetic metadata and real local OS refusal. Never launch the Central/MES.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$probe=Join-Path $PSScriptRoot 'IDENTIFICAR_CENTRAL_8765_READONLY.ps1'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($probe,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){$parseErrors|ForEach-Object {Write-Output ($_.ErrorId+' line='+$_.Extent.StartLineNumber+' '+$_.Message)};throw 'PROBE_PARSE_FAILED'}
. $probe
$fixture=Join-Path $env:RUNNER_TEMP ('PR98-READONLY-'+[guid]::NewGuid().ToString('N'))
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows'){throw 'DISPOSABLE_WINDOWS_ONLY'}
$null=New-Item -ItemType Directory -Path $fixture
$root=Join-Path $fixture 'A [space]';$data=Join-Path $root 'ames-agent\data'
$null=New-Item -ItemType Directory -Path $data -Force
$entry=Join-Path $root 'ames-agent\agent_hardened_entry.py'
[IO.File]::WriteAllText($entry,'# SYNTHETIC METADATA FILE; NEVER EXECUTED')
foreach($name in @('ames_local.sqlite3','ames_local.sqlite3-wal','ames_local.sqlite3-shm','local_agent_token')){[IO.File]::WriteAllText((Join-Path $data $name),'SYNTHETIC OPAQUE SENTINEL '+$name)}
[IO.File]::WriteAllText((Join-Path $root 'ames-agent\config.json'),'SYNTHETIC OPAQUE CONFIG; MUST NOT PARSE')
[IO.File]::WriteAllText((Join-Path $root 'CANDIDATE_MANIFEST.json'),'{"sha":"eedacc65445dea9967a92085777b878c1ee9c123"}')
$exe=Join-Path $env:SystemRoot 'synthetic-python\python.exe'
$process=[pscustomobject]@{ProcessId=43210;ExecutablePath=$exe;CommandLine=('"'+$exe+'" -u "'+$entry+'"');CreationDate=[datetime]'2026-11-19T10:00:00Z'}
$rows=@([pscustomobject]@{OwningProcess=43210;LocalAddress='127.0.0.1';LocalPort=8765})
$passed=0
function Test-Case([string]$Name,[scriptblock]$Body){& $Body;$script:passed++;Write-Output ('PASS '+$Name)}
function Expect-Stop([string]$Reason,[scriptblock]$Body){$observed=$false;try{& $Body|Out-Null}catch{if($_.Exception.Message -cne $Reason){throw};$observed=$true};if(-not $observed){throw ('EXPECTED_STOP '+$Reason)}}
function Clone-Process {return [pscustomobject]@{ProcessId=$process.ProcessId;ExecutablePath=$process.ExecutablePath;CommandLine=$process.CommandLine;CreationDate=$process.CreationDate}}
function Fingerprint-Tree {return (@(Get-ChildItem -LiteralPath $root -File -Recurse -Force|Sort-Object FullName|ForEach-Object {$_.FullName+' '+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}) -join "`n")}
$before=Fingerprint-Tree
Test-Case 'strict native PowerShell parse' {if($parseErrors.Count){throw 'PARSE'}}
Test-Case 'only read commands and no dynamic execution' {
  $allowed=@('Set-StrictMode','Get-Item','Join-Path','Test-Path','Get-Content','ConvertFrom-Json','Get-FileHash','Get-Command','Get-CimInstance','Get-NetTCPConnection','Where-Object','ForEach-Object','Sort-Object','ConvertTo-Json','Assert-CentralLocalRegularPath','Resolve-CentralPortOwner','Read-CentralInstallationMetadata','Invoke-CentralReadOnlyIdentification')
  foreach($node in $ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)){
    if($node.GetCommandName() -notin $allowed -or $node.InvocationOperator.ToString() -in @('Ampersand','Dot')){throw ('UNSAFE_COMMAND '+$node.GetCommandName())}
  }
  $source=[IO.File]::ReadAllText($probe)
  foreach($name in @('Invoke-RestMethod','Invoke-WebRequest','Start-Process','Stop-Process','Add-Type','Import-Module','import sqlite3','Set-Content','New-Item','Remove-Item','Set-ItemProperty')){if($source.Contains($name)){throw ('MUTATION_OR_NETWORK '+$name)}}
}
Test-Case 'root comes from exact PID argv with spaces and brackets' {$id=Resolve-CentralPortOwner $rows $process;if($id.root -cne $root){throw 'WRONG_ROOT'}}
Test-Case 'IPv4 IPv6 rows of same owner are one process' {$v6=[pscustomobject]@{OwningProcess=43210;LocalAddress='::1';LocalPort=8765};$id=Resolve-CentralPortOwner @($rows[0],$v6) $process;if($id.pid -ne 43210){throw 'PID'}}
Test-Case 'no listener stops without folder guessing' {Expect-Stop 'STOP_NO_LISTENER' {Resolve-CentralPortOwner @() $process}}
Test-Case 'multiple owners stop' {$other=[pscustomobject]@{OwningProcess=12345;LocalAddress='::1';LocalPort=8765};Expect-Stop 'STOP_AMBIGUOUS_OWNER' {Resolve-CentralPortOwner @($rows[0],$other) $process}}
Test-Case 'non loopback binding requires review' {$other=[pscustomobject]@{OwningProcess=43210;LocalAddress='0.0.0.0';LocalPort=8765};Expect-Stop 'STOP_NON_LOOPBACK_BIND' {Resolve-CentralPortOwner @($other) $process}}
Test-Case 'different PID cannot attest owner' {$p=Clone-Process;$p.ProcessId=7;Expect-Stop 'STOP_PROCESS_METADATA_UNAVAILABLE' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'missing birth metadata stops' {$p=Clone-Process;$p.CreationDate=$null;Expect-Stop 'STOP_PROCESS_METADATA_UNAVAILABLE' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'non Python owner stops' {$p=Clone-Process;$p.ExecutablePath='C:\Windows\powershell.exe';Expect-Stop 'STOP_UNRECOGNIZED_INTERPRETER' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'executable argv must match OS image' {$p=Clone-Process;$p.CommandLine=$p.CommandLine.Replace('synthetic-python','other-python');Expect-Stop 'STOP_EXECUTABLE_MISMATCH' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'extra arguments and prefix tricks stop' {foreach($tail in @(' --port 8765',' --fake-root X')){$p=Clone-Process;$p.CommandLine+=$tail;Expect-Stop 'STOP_UNSUPPORTED_COMMAND_SHAPE' {Resolve-CentralPortOwner $rows $p}}}
Test-Case 'different entrypoint not inferred from a substring' {$p=Clone-Process;$p.CommandLine=$p.CommandLine.Replace('agent_hardened_entry.py','agent_hardened_entry.py.bak');Expect-Stop 'STOP_UNRECOGNIZED_ENTRYPOINT' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'relative entrypoint stops' {$p=Clone-Process;$p.CommandLine='"'+$exe+'" -u ames-agent\agent_hardened_entry.py';Expect-Stop 'STOP_UNRECOGNIZED_ENTRYPOINT' {Resolve-CentralPortOwner $rows $p}}
Test-Case 'UNC path stops before reading a share' {Expect-Stop 'STOP_NONLOCAL_PATH' {Assert-CentralLocalRegularPath '\\SYNTHETIC-UNREACHABLE\private\agent.py'}}
Test-Case 'metadata succeeds with every private state file locked' {
  $locks=@();try{
    foreach($path in @((Join-Path $root 'ames-agent\config.json'),(Join-Path $data 'local_agent_token'),(Join-Path $data 'ames_local.sqlite3'),(Join-Path $data 'ames_local.sqlite3-wal'),(Join-Path $data 'ames_local.sqlite3-shm'))){$locks+=,[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
    $id=Resolve-CentralPortOwner $rows $process;$r=Read-CentralInstallationMetadata $id
    if($r.root -cne $root -or $r.manifest_sha_claim -cne 'eedacc65445dea9967a92085777b878c1ee9c123' -or $r.state_files['ames-agent\data\ames_local.sqlite3-journal'].bytes -ne $null){throw 'METADATA'}
  }finally{foreach($handle in $locks){$handle.Dispose()}}
}
Test-Case 'missing manifest is unknown never 0.5.39' {
  $path=Join-Path $root 'CANDIDATE_MANIFEST.json';$raw=[IO.File]::ReadAllBytes($path);[IO.File]::Delete($path)
  try{$r=Read-CentralInstallationMetadata (Resolve-CentralPortOwner $rows $process);if($r.manifest_sha_claim -ne $null -or $r.manifest_state -ne 'ABSENT'){throw 'INVENTED_VERSION'}}finally{[IO.File]::WriteAllBytes($path,$raw)}
}
Test-Case 'junction rejected without choosing target' {
  $target=Join-Path $fixture 'junction-target';$null=New-Item -ItemType Directory -Path $target
  [IO.File]::WriteAllText((Join-Path $target 'entry.py'),'SYNTHETIC JUNCTION TARGET')
  $link=Join-Path $fixture 'junction';$null=New-Item -ItemType Junction -Path $link -Target $target
  try{Expect-Stop 'STOP_LINK_OR_JUNCTION' {Assert-CentralLocalRegularPath (Join-Path $link 'entry.py')}}finally{[IO.Directory]::Delete($link)}
}
Test-Case 'no fixture state bytes changed' {if((Fingerprint-Tree) -cne $before){throw 'STATE_CHANGED'}}
function Invoke-MetadataFixture([switch]$ChangedBirth){
  $script:fixtureCimCalls=0;$script:fixtureChangedBirth=[bool]$ChangedBirth
  function Get-NetTCPConnection { [CmdletBinding()]param([string]$State) return $script:rows }
  function Get-CimInstance {
    [CmdletBinding()]param([string]$ClassName,[string]$Filter)
    if($ClassName -eq 'Win32_OperatingSystem'){return [pscustomobject]@{Caption='SYNTHETIC WINDOWS METADATA';Version='10.0';BuildNumber='SYNTHETIC'}}
    if($ClassName -ne 'Win32_Process'){throw 'UNEXPECTED_CIM_CLASS'}
    $script:fixtureCimCalls++
    $p=[pscustomobject]@{ProcessId=$script:process.ProcessId;ExecutablePath=$script:process.ExecutablePath;CommandLine=$script:process.CommandLine;CreationDate=$script:process.CreationDate}
    if($script:fixtureChangedBirth -and $script:fixtureCimCalls -gt 1){$p.CreationDate=$p.CreationDate.AddSeconds(1)}
    return $p
  }
  Invoke-CentralReadOnlyIdentification
}
Test-Case 'complete observation over synthetic OS metadata does not authorize update' {
  $r=Invoke-MetadataFixture
  if($r.status -ne 'IDENTIFIED' -or $r.installation.root -cne $root -or $r.database_opened -or $r.profiles_opened -or $r.http_requests -or $r.maintenance_lease -or $r.operational_update_authorized -or $r.all_sessions_attested){throw 'FALSE_AUTHORIZATION_OR_ROOT'}
}
Test-Case 'reused PID with changed creation time stops final observation' {Expect-Stop 'STOP_OWNER_CHANGED_DURING_OBSERVATION' {Invoke-MetadataFixture -ChangedBirth}}
Test-Case 'real OS observation refuses live non-agent owner without HTTP' {
  $existing=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object LocalPort -eq 8765)
  if($existing.Count){throw 'SYNTHETIC_PORT_PREOCCUPIED'}
  $socket=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,8765);$socket.Start()
  try{
    $output=& powershell.exe -NoProfile -File $probe;$code=$LASTEXITCODE
    $r=($output -join "`n")|ConvertFrom-Json
    if($code -ne 2 -or $r.status -ne 'STOP' -or $r.reason -ne 'STOP_UNRECOGNIZED_INTERPRETER' -or $r.database_opened -or $r.http_requests -or $r.operational_update_authorized -or $socket.Pending()){throw 'LIVE_REFUSAL_FAILED'}
  }finally{$socket.Stop()}
}
Write-Output ('READONLY_IDENTIFICATION_CONTRACTS='+$passed+'; NO_AGENT_STARTED; NO_SQLITE_OPENED; NO_INSTALLATION_AUTHORIZED')

exit 0
