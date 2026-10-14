param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
$Root=(Resolve-Path $Root).Path
$starter=Join-Path $Root 'suporte\ames-workstation\START_AGENT_CANONICAL.ps1'
$fixture=Join-Path $PSScriptRoot 'fixtures\bootstrap-race'
$testRoot=Join-Path $env:RUNNER_TEMP ('ames-bootstrap-race-'+[guid]::NewGuid().ToString('N'))
$evidence=Join-Path $Root 'logs\race-gate'
New-Item -ItemType Directory -Force $testRoot,$evidence|Out-Null
$python=(Get-Command python.exe).Source
$owned=New-Object System.Collections.Generic.List[object]
$report=[ordered]@{status='running';legacy_build='CLEAN-V4-3012';events=@();test_root=$testRoot}
function Record([string]$name,$data){$report.events+=@{at=(Get-Date).ToUniversalTime().ToString('o');name=$name;data=$data};$report|ConvertTo-Json -Depth 12|Set-Content (Join-Path $evidence 'result.json') -Encoding UTF8}
function Start-Fixture([string]$path,[string]$extra=''){
 $proc=Start-Process $python -ArgumentList @('-u',('"'+$path+'"'),$extra) -PassThru -WindowStyle Hidden
 $owned.Add($proc);return $proc
}
function Wait-Legacy {
 for($i=0;$i -lt 60;$i++){try{$r=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 1;if($r.agent_build -eq 'CLEAN-V4-3012'){return $r}}catch{};Start-Sleep -Milliseconds 100}
 throw 'Synthetic legacy did not bind 8765'
}
function Wait-Exit($process,[int]$seconds=100){if(-not $process.WaitForExit($seconds*1000)){throw 'Launcher did not terminate within bounded test deadline'};$process.Refresh();return $process.ExitCode}
function Start-Launcher {
 $stamp=[guid]::NewGuid().ToString('N')
 $proc=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$starter+'"'),'-Root',('"'+$Root+'"'),'-StartupTimeoutSeconds','20') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evidence ($stamp+'.stdout.txt')) -RedirectStandardError (Join-Path $evidence ($stamp+'.stderr.txt'))
 $owned.Add($proc);return $proc
}
try{
 # Known old packages retain the frozen collectors as an independent identity.
 $legacy=Join-Path $testRoot 'CLEAN V4\ames-agent';$latent=Join-Path $testRoot 'CLEAN V3\ames-agent'
 foreach($dir in @($legacy,$latent)){
  New-Item -ItemType Directory -Force $dir|Out-Null
  foreach($name in @('ames_3028.py','ames_3028_live.py')){Copy-Item (Join-Path $Root ('ames-agent\'+$name)) (Join-Path $dir $name)}
  Set-Content (Join-Path $dir 'do-not-change.txt') 'synthetic operational sentinel'
 }
 $legacyScript=Join-Path $legacy 'agent_clean_entry.py';$latentScript=Join-Path $latent 'agent_bootstrap.pyw'
 Copy-Item (Join-Path $fixture 'legacy_agent.py') $legacyScript
 Copy-Item (Join-Path $fixture 'legacy_agent.py') $latentScript
 $before=@{};Get-ChildItem (Join-Path $testRoot 'CLEAN*') -Recurse -File|ForEach-Object{$before[$_.FullName]=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}
 $initial=Start-Fixture $legacyScript;Record 'initial_legacy' (Wait-Legacy)
 $sleeper=Start-Fixture $latentScript '--latent'
 $barrier=Join-Path $testRoot 'canonical-created.txt'
 $oldPath=$env:PYTHONPATH;$env:PYTHONPATH=$fixture
 $env:AMES_RACE_TEST_ROOT=$Root;$env:AMES_RACE_TEST_BARRIER=$barrier
 $launch=Start-Launcher
 for($i=0;$i -lt 300;$i++){
  if(Test-Path $barrier){break}
  if($launch.HasExited){throw 'Launcher ended before creating the canonical test barrier'}
  Start-Sleep -Milliseconds 100
 }
 if(-not(Test-Path $barrier)){throw 'Canonical creation barrier missing'}
 # Reoccupy after the original listener was killed and the new process created.
 $racer=Start-Fixture $legacyScript;Record 'reoccupied_8765' (Wait-Legacy)
 $rc=Wait-Exit $launch
 Record 'launcher_exit' $rc
 if($rc -ne 0){throw "Canonical launcher lost legacy reoccupation race (exit=$rc)"}
 $state=Get-Content (Join-Path $Root 'logs\agent_startup_state.json') -Raw|ConvertFrom-Json
 $ready=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 5
 Record 'final_ready' $ready
 if($ready.agent_build -ne 'CANONICAL-R11-BATCH' -or [int]$ready.pid -ne [int]$state.pid){throw 'Ready PID differs from the launcher-owned canonical PID'}
 if($state.status -ne 'ready'){throw 'State not ready'}
 $token=(Get-Content (Join-Path $Root 'ames-agent\data\local_agent_token') -Raw).Trim();$headers=@{'X-Central-Agent-Token'=$token}
 $cap=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/v2/capabilities' -Headers $headers -TimeoutSec 5
 if([IO.Path]::GetFullPath($cap.package_root).TrimEnd([char]92) -ine $Root.TrimEnd([char]92)){throw 'Wrong package accepted'}
 $h1=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/hardening/health' -Headers $headers -TimeoutSec 5
 if(-not $h1.ok -or $h1.integrity -ne 'ok'){throw 'Current token did not validate H1'}
 foreach($old in @($initial,$sleeper,$racer)){$old.Refresh();if(-not $old.HasExited){throw "Known old A-MES PID $($old.Id) survived arbitration"}}
 foreach($file in $before.Keys){if((Get-FileHash $file -Algorithm SHA256).Hash -ne $before[$file]){throw 'Old CLEAN file was modified'}}
 Record 'legacy_files_unchanged' $true
 Stop-Process -Id ([int]$ready.pid) -Force
 Start-Sleep -Milliseconds 500
 # A service with an unknown script name must remain alive and block startup.
 $unknownScript=Join-Path $testRoot 'unknown_server.py';Copy-Item (Join-Path $fixture 'legacy_agent.py') $unknownScript
 $unknown=Start-Fixture $unknownScript;$null=Wait-Legacy
 $blocked=Start-Launcher;$blockedCode=Wait-Exit $blocked 45
 if($blockedCode -eq 0 -or $unknown.HasExited){throw 'Unknown service was accepted or killed'}
 $failure=Get-Content (Join-Path $Root 'logs\agent_startup_state.json') -Raw|ConvertFrom-Json
 if($failure.status -ne 'failed' -or -not $failure.events){throw 'Unknown-owner failure lacks durable evidence'}
 Record 'unknown_preserved' @{pid=$unknown.Id;exit=$blockedCode}
 $report.status='passed';Record 'gate' 'synthetic Windows race passed; factory gate remains pending'
 Write-Host 'PASS: CLEAN-V4-3012 reoccupied 8765; canonical won with exact PID/root/token/H1; old files and unknown service preserved.'
} catch {$report.status='failed';Record 'failure' $_.Exception.Message;throw}
finally {
 $env:PYTHONPATH=$oldPath;Remove-Item Env:AMES_RACE_TEST_ROOT,Env:AMES_RACE_TEST_BARRIER -ErrorAction SilentlyContinue
 foreach($process in $owned){try{if(-not $process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}}catch{}}
 # Cleanup only the canonical PID recorded by this fixture's current package.
 try{$s=Get-Content (Join-Path $Root 'logs\agent_startup_state.json') -Raw|ConvertFrom-Json;if($s.pid){$p=Get-CimInstance Win32_Process -Filter "ProcessId = $($s.pid)";if($p.CommandLine -and $p.CommandLine.Contains($Root)){Stop-Process -Id $s.pid -Force -ErrorAction SilentlyContinue}}}catch{}
}
