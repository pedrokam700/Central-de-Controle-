param(
  [Parameter(Mandatory=$true)][string]$Root,
  [int]$StartupTimeoutSeconds=60,
  [ValidateRange(1,5)][int]$MaxAttempts=3,
  [switch]$MaintenanceEnrollment,
  [string]$MaintenanceRoot,
  [string]$FixtureMutex
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ISSUE57_RELAUNCH_ENROLLMENT.ps1')
if($MaintenanceEnrollment){
  Invoke-Issue57RelaunchEnrollment -InstallationRoot $Root -JournalRoot $MaintenanceRoot -Role 'launcher' -MutexName $FixtureMutex
  exit 0
}
if($MaintenanceRoot -or $FixtureMutex){throw 'enrollment_arguments_without_enrollment'}

$root=(Resolve-Path -LiteralPath $Root).Path
$expected=[IO.Path]::GetFullPath($root).TrimEnd([char]92)
$python=Join-Path $root '.venv\Scripts\python.exe'
$agent=Join-Path $root 'ames-agent\agent_hardened_entry.py'
$tokenPath=Join-Path $root 'ames-agent\data\local_agent_token'
$logs=Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs|Out-Null
$stamp=(Get-Date -Format 'yyyyMMdd_HHmmss_fff')+'_'+[guid]::NewGuid().ToString('N').Substring(0,8)
$statePath=Join-Path $logs 'agent_startup_state.json'
$historyPath=Join-Path $logs ("agent_startup_$stamp.json")
$script:events=New-Object System.Collections.Generic.List[object]
$script:startedProcess=$null;$script:startedIdentity=$null
$script:outLog=$null;$script:errLog=$null;$script:attempt=0
$script:lastProbeError='';$script:lastCapabilityError='';$script:lastHardeningError=''
$script:lastReady=$null;$script:lastCapabilities=$null;$script:lastHardening=$null
$script:conflict=$false;$mutex=$null;$mutexHeld=$false

function Write-StartupState([string]$Status,[string]$Message='') {
  $payload=[ordered]@{updated_at=(Get-Date).ToUniversalTime().ToString('o');status=$Status;message=$Message;package_root=$expected;pid=$null;process_created_at=$null;attempt=$script:attempt;max_attempts=$MaxAttempts;stdout=$script:outLog;stderr=$script:errLog;ready=$script:lastReady;capabilities=$script:lastCapabilities;hardening=$script:lastHardening;probe_error=$script:lastProbeError;capability_error=$script:lastCapabilityError;hardening_error=$script:lastHardeningError;events=@($script:events.ToArray())}
  if($script:startedProcess){$payload.pid=$script:startedProcess.Id}
  if($script:startedIdentity){$payload.process_created_at=$script:startedIdentity.created_at}
  $json=$payload|ConvertTo-Json -Depth 12
  # Immutable per-invocation evidence also survives another launcher starting later.
  $json|Set-Content -LiteralPath $historyPath -Encoding UTF8
  if($script:mutexHeld){$temp=$statePath+'.'+$stamp+'.tmp';$json|Set-Content -LiteralPath $temp -Encoding UTF8;Move-Item -LiteralPath $temp -Destination $statePath -Force}
}
function Record-Event([string]$Name,$Evidence) {
  $script:events.Add([pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString('o');event=$Name;evidence=$Evidence})
  Write-StartupState 'starting' $Name
}
function Get-AgentToken {
  if(Test-Path -LiteralPath $tokenPath){$token=(Get-Content -LiteralPath $tokenPath -Raw).Trim();if($token.Length -ge 32){return $token}}
  return $null
}
function Get-AgentHeaders {$token=Get-AgentToken;if($token){return @{'X-Central-Agent-Token'=$token}};return $null}
function Get-PublicReady {
  try{$r=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3;$script:lastProbeError='';$script:lastReady=$r;return $r}catch{$script:lastProbeError=$_.Exception.Message;return $null}
}
function Get-ProtectedCapabilities {
  $headers=Get-AgentHeaders;if(-not $headers){$script:lastCapabilityError='Token local ainda nao disponivel.';return $null}
  try{$cap=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/v2/capabilities' -Headers $headers -TimeoutSec 5
    $script:lastCapabilities=@{package_root=$cap.package_root;native_console=$cap.native_console}
    if($cap.native_console -and $cap.package_root -and $cap.scheduler){$script:lastCapabilityError='';return $cap}
    $script:lastCapabilityError='Capabilities sem contrato canonico.'
  }catch{$script:lastCapabilityError=$_.Exception.Message};return $null
}
function Get-HardeningHealth {
  $headers=Get-AgentHeaders;if(-not $headers){$script:lastHardeningError='Token local ainda nao disponivel.';return $null}
  try{$hh=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/hardening/health' -Headers $headers -TimeoutSec 5
    $script:lastHardening=@{ok=$hh.ok;hardening=$hh.hardening;integrity=$hh.integrity;schema_version=$hh.schema_version;token_source='current_package';security_mode=$hh.local_security.mode}
    $indexesOk=($null -eq $hh.performance_indexes -or [bool]$hh.performance_indexes.ok)
    if($hh.ok -and $hh.hardening -eq 'H1' -and $hh.integrity -eq 'ok' -and [int]$hh.schema_version -ge 1 -and $hh.local_security.mode -eq 'workstation-token-v1' -and $indexesOk){$script:lastHardeningError='';return $hh}
    $script:lastHardeningError='H1/integridade/seguranca/indexes invalidos.'
  }catch{$script:lastHardeningError=$_.Exception.Message};return $null
}

# Parse native Windows argv; never decide to kill from a substring of a command.
function Initialize-ArgvParser {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CentralAmesArgv {
 [DllImport("shell32.dll", SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string s, out int n);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 public static string[] Split(string s) {int n;IntPtr p=CommandLineToArgvW(s,out n);if(p==IntPtr.Zero)return new string[0];try {string[] a=new string[n];for(int i=0;i<n;i++)a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return a;}finally{LocalFree(p);}}
}
'@
}
function Get-KnownPackage([string]$Entry) {
  $dir=Split-Path -Parent $Entry
  for($i=0;$i -lt 5 -and $dir;$i++){
    $a=Join-Path $dir 'ames-agent'
    if(Test-Path -LiteralPath (Join-Path $a 'ames_3028.py')){
      try{
        $h1=(Get-FileHash -LiteralPath (Join-Path $a 'ames_3028.py') -Algorithm SHA256).Hash
        $h2=(Get-FileHash -LiteralPath (Join-Path $a 'ames_3028_live.py') -Algorithm SHA256).Hash
        if($h1 -eq '829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1' -and $h2 -eq 'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'){return [IO.Path]::GetFullPath($dir).TrimEnd([char]92)}
      }catch{}
      return $null
    }
    $dir=Split-Path -Parent $dir
  }
  return $null
}
function Get-ProcessIdentity($Process) {
  $id=[ordered]@{pid=[int]$Process.ProcessId;parent_pid=[int]$Process.ParentProcessId;created_at=([datetime]$Process.CreationDate).ToUniversalTime().ToString('o');executable=[string]$Process.ExecutablePath;entry=$null;package_root=$null;known=$false;kind='unknown'}
  if(-not $Process.CommandLine){return [pscustomobject]$id}
  $argv=[CentralAmesArgv]::Split([string]$Process.CommandLine)
  if($argv.Count -lt 2){return [pscustomobject]$id}
  $exe=[IO.Path]::GetFileName([string]$Process.ExecutablePath).ToLowerInvariant()
  $raw=$null
  if($exe -in @('python.exe','pythonw.exe')){
    $n=1;while($n -lt $argv.Count -and $argv[$n] -in @('-u','-B')){$n++}
    if($n -lt $argv.Count){$raw=$argv[$n]}
    if($raw -and [IO.Path]::GetFileName($raw) -notin @('agent.py','agent_entry.py','agent_clean_entry.py','agent_hardened_entry.py','agent_bootstrap.pyw','agent_fastlane_bootstrap.pyw')){$raw=$null}
    $id.kind='python_agent'
  }elseif($exe -in @('powershell.exe','pwsh.exe')){
    for($n=1;$n -lt $argv.Count-1;$n++){if($argv[$n] -ieq '-File'){$raw=$argv[$n+1];break}}
    if($raw -and [IO.Path]::GetFileName($raw) -notin @('INICIAR_POSTO_LIMPO.ps1','INICIAR_FASTLANE_TESTE.ps1','START_LOCAL_CANDIDATE.ps1','START_AGENT_CANONICAL.ps1')){$raw=$null}
    $id.kind='known_launcher'
  }
  if(-not $raw){return [pscustomobject]$id}
  $candidates=@()
  if([IO.Path]::IsPathRooted($raw)){$candidates+= $raw}
  elseif($id.kind -eq 'python_agent'){
    foreach($interpreter in @($argv[0],$Process.ExecutablePath)){
      if($interpreter -match '\\\.venv\\Scripts\\pythonw?\.exe$'){
        $package=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $interpreter))
        $candidates+=Join-Path $package $raw
        $candidates+=Join-Path (Join-Path $package 'ames-agent') $raw
      }
    }
  }
  foreach($candidate in @($candidates|Select-Object -Unique)){
    if(-not(Test-Path -LiteralPath $candidate -PathType Leaf)){continue}
    $entry=(Resolve-Path -LiteralPath $candidate).Path
    $package=Get-KnownPackage $entry
    if(-not $package){continue}
    if($id.kind -eq 'python_agent' -and (Split-Path -Leaf (Split-Path -Parent $entry)) -ne 'ames-agent'){continue}
    $id.entry=$entry;$id.package_root=$package;$id.known=$true;break
  }
  return [pscustomobject]$id
}
function Get-IdentityByPid([int]$ProcessId) {
  $p=Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if($p){return Get-ProcessIdentity $p};return $null
}
function Get-PortOwners {
  $connections=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -eq 8765})
  $owners=@();foreach($processId in @($connections.OwningProcess|Sort-Object -Unique)){
    $identity=Get-IdentityByPid ([int]$processId)
    if(-not $identity){throw "Listener 8765 PID $processId desapareceu durante inspecao; tentar novamente."}
    $owners+=$identity
  };return $owners
}
function Stop-ProcessAndWait($Identity,[string]$Reason) {
  $current=Get-IdentityByPid $Identity.pid
  if(-not $current){return}
  # Recheck PID birth + entry immediately before termination (PID reuse protection).
  if(-not $current.known -or $current.created_at -ne $Identity.created_at -or $current.entry -ine $Identity.entry){throw "UNKNOWN_OWNER: PID $($Identity.pid) mudou de identidade; nao sera encerrado."}
  Record-Event 'stop_known_process' @{reason=$Reason;identity=$current}
  $handle=Get-Process -Id $current.pid -ErrorAction Stop
  if($handle.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') -ne ([datetime]$current.created_at).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')){throw 'UNKNOWN_OWNER: tempo de criacao mudou antes do encerramento.'}
  # Use the verified process handle, not a second lookup by PID.
  $handle.Kill();if(-not $handle.WaitForExit(5000)){throw "PID conhecido $($current.pid) nao encerrou."}
}
function Stop-AgentOn8765([int]$KeepPid=0) {
  $owners=@(Get-PortOwners);Record-Event 'port_owners' $owners
  foreach($owner in $owners){if(-not $owner.known){throw "UNKNOWN_OWNER: porta 8765 PID $($owner.pid) executable=$($owner.executable); nao se identificou como agente A-MES conhecido. Nenhum processo desconhecido sera morto."}}
  foreach($owner in $owners){if($owner.pid -ne $KeepPid){Stop-ProcessAndWait $owner 'agente conhecido disputa 8765'}}
}
function Stop-ResidualSamePackageAgents([int]$KeepPid=0) {
  # Historical function name retained; scope now covers ALL verified CLEAN roots.
  $known=@(Get-CimInstance Win32_Process -ErrorAction Stop|Where-Object {$_.ProcessId -ne $PID}|ForEach-Object {Get-ProcessIdentity $_}|Where-Object {$_.known -and $_.pid -ne $KeepPid -and ($_.kind -eq 'python_agent' -or $_.package_root -ine $expected)})
  Record-Event 'known_process_inventory' $known
  foreach($identity in @($known|Sort-Object kind)){Stop-ProcessAndWait $identity 'residuo A-MES conhecido, inclusive sem listener'}
}
function Assert-PortOwner([int]$ExpectedPid) {
  $owners=@(Get-PortOwners)
  foreach($owner in $owners){
    if(-not $owner.known){Record-Event 'unknown_port_owner' $owner;throw "UNKNOWN_OWNER: PID $($owner.pid) executable=$($owner.executable) ocupa 8765."}
    if($owner.pid -ne $ExpectedPid){Record-Event 'port_reoccupied' $owner;$script:conflict=$true;return $false}
  }
  return ($owners.Count -eq 1 -and $owners[0].pid -eq $ExpectedPid)
}
function Get-CanonicalIdentity($Ready,$Capabilities,[int]$ExpectedPid) {
  if(-not $Ready -or -not $Ready.ok -or -not $Ready.ready -or -not $Ready.agent_version -or -not $Ready.candidate_version){return $null}
  if([int]$Ready.pid -ne $ExpectedPid){Record-Event 'ready_pid_mismatch' @{expected_pid=$ExpectedPid;ready=$Ready};$script:conflict=$true;return $null}
  if(-not $Capabilities -or -not $Capabilities.package_root){return $null}
  $actual=[IO.Path]::GetFullPath([string]$Capabilities.package_root).TrimEnd([char]92)
  return [pscustomobject]@{actual=$actual;buildOk=([string]$Ready.agent_build -like 'CANONICAL-*');rootOk=($actual -ieq $expected);nativeOk=[bool]$Capabilities.native_console}
}
function Test-OwnedHandshake {
  $script:startedProcess.Refresh();if($script:startedProcess.HasExited){return $null}
  $processId=$script:startedProcess.Id
  if(-not(Assert-PortOwner $processId)){return $null}
  $ready=Get-PublicReady
  if(-not $ready){return $null}
  if([int]$ready.pid -ne $processId){Record-Event 'ready_pid_mismatch' @{expected_pid=$processId;ready=$ready};$script:conflict=$true;return $null}
  $cap=Get-ProtectedCapabilities;$identity=Get-CanonicalIdentity $ready $cap $processId
  if(-not $identity -or -not $identity.buildOk -or -not $identity.rootOk -or -not $identity.nativeOk){return $null}
  $hard=Get-HardeningHealth;if(-not $hard){return $null}
  $again=Get-PublicReady
  $now=Get-IdentityByPid $processId
  if(-not $again -or [int]$again.pid -ne $processId -or -not $now -or $now.created_at -ne $script:startedIdentity.created_at -or -not(Assert-PortOwner $processId)){return $null}
  return $hard
}
function Start-OwnedAgent {
  # CPython's Windows venv redirector otherwise returns a supervisor PID, not the
  # interpreter PID. Use the same direct-base + venv environment mechanism as
  # CPython Lib/multiprocessing/popen_spawn_win32.py; no agent source is changed.
  $probe=& $python -c "import json,sys; print(json.dumps({'base':sys._base_executable,'prefix':sys.prefix}))"
  if($LASTEXITCODE -ne 0){throw 'Falha ao identificar interpretador do ambiente local.'}
  $runtime=$probe|ConvertFrom-Json
  if([IO.Path]::GetFullPath($runtime.prefix).TrimEnd([char]92) -ine (Join-Path $root '.venv')){throw 'Interpretador nao pertence ao .venv desta pasta.'}
  if(-not(Test-Path -LiteralPath $runtime.base)){throw 'Interpretador base do .venv nao encontrado.'}
  $script:outLog=Join-Path $logs ("agent_stdout_${stamp}_$($script:attempt).log")
  $script:errLog=Join-Path $logs ("agent_stderr_${stamp}_$($script:attempt).log")
  $oldLauncher=$env:__PYVENV_LAUNCHER__
  try{
    $env:__PYVENV_LAUNCHER__=$python
    $script:startedProcess=Start-Process -FilePath $runtime.base -ArgumentList @('-u',('"'+$agent+'"')) -WorkingDirectory (Split-Path $agent -Parent) -WindowStyle Hidden -RedirectStandardOutput $script:outLog -RedirectStandardError $script:errLog -PassThru
    $null=$script:startedProcess.Handle
  }finally{$env:__PYVENV_LAUNCHER__=$oldLauncher}
  $script:startedIdentity=Get-IdentityByPid $script:startedProcess.Id
  if(-not $script:startedIdentity -or -not $script:startedIdentity.known -or $script:startedIdentity.entry -ine $agent){throw 'Processo criado nao confirmou a identidade do entrypoint atual.'}
  Record-Event 'canonical_spawned' $script:startedIdentity
}
function Show-LogTail([string]$Path,[string]$Label){if($Path -and (Test-Path -LiteralPath $Path)){Write-Host "--- $Label ($Path) ---";Get-Content -LiteralPath $Path -Tail 40 -ErrorAction SilentlyContinue|ForEach-Object{Write-Host $_}}}

function Assert-NoPendingUpdateClaim([string]$PackageRoot) {
  # Issue #57: invoked UNDER CanonicalBootstrap mutex. An external updater
  # must hold UpdateTransaction, then CanonicalBootstrap, before creating the
  # persistent claim. This makes a direct launcher respect crash recovery,
  # without changing any of its normal startup/kill/PID logic.
  if(Test-Issue57RelaunchBlocked $PackageRoot){
    throw 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED'
  }
}

try{
  Initialize-ArgvParser
  $mutex=New-Object System.Threading.Mutex($false,'Global\CentralAMES.CanonicalBootstrap.8765')
  try{$script:mutexHeld=$mutex.WaitOne(30000)}catch [System.Threading.AbandonedMutexException]{$script:mutexHeld=$true}
  if(-not $script:mutexHeld){throw 'Outro bootstrap A-MES esta em andamento; nenhuma limpeza concorrente foi executada.'}
  Assert-NoPendingUpdateClaim $root
  $prior=$null
  if(Test-Path -LiteralPath $statePath){try{$prior=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json;Copy-Item -LiteralPath $statePath -Destination (Join-Path $logs ("agent_startup_before_$stamp.json"))}catch{Record-Event 'prior_state_unreadable' $_.Exception.Message}}
  Record-Event 'bootstrap_lock_acquired' @{launcher_pid=$PID;root=$expected}
  if(-not(Test-Path -LiteralPath $python)){throw "Python do ambiente local nao encontrado: $python"}
  if(-not(Test-Path -LiteralPath $agent)){throw "Entrypoint canonico nao encontrado: $agent"}
  # Idempotent only for a previously launcher-owned PID with matching birth/path.
  $reuse=$null
  if($prior -and $prior.status -eq 'ready' -and $prior.package_root -ieq $expected -and $prior.pid){
    $known=Get-IdentityByPid ([int]$prior.pid)
    if($known -and $known.known -and $known.entry -ieq $agent -and $known.created_at -eq $prior.process_created_at){$reuse=$known}
  }
  for($script:attempt=1;$script:attempt -le $MaxAttempts;$script:attempt++){
    $script:conflict=$false
    try{
      $keep=0;if($reuse){$keep=$reuse.pid}
      Stop-AgentOn8765 $keep
      Stop-ResidualSamePackageAgents $keep
      if($reuse){
        $script:startedProcess=Get-Process -Id $reuse.pid;$script:startedIdentity=$reuse
        $script:outLog=$prior.stdout;$script:errLog=$prior.stderr
        Record-Event 'reuse_launcher_owned_pid' $reuse;$reuse=$null
      }else{Start-OwnedAgent}
      $deadline=(Get-Date).AddSeconds([Math]::Max(10,$StartupTimeoutSeconds));$stableSince=$null;$hard=$null
      while((Get-Date) -lt $deadline){
        $hard=Test-OwnedHandshake
        if($script:conflict){throw 'Agente conhecido reocupou 8765 durante startup.'}
        $script:startedProcess.Refresh();if($script:startedProcess.HasExited){Record-Event 'canonical_exited' @{exit_code=$script:startedProcess.ExitCode;owners=@(Get-PortOwners)};throw 'Processo canonico encerrou durante startup.'}
        if($hard){
          if(-not $stableSince){$stableSince=Get-Date}
          if(((Get-Date)-$stableSince).TotalSeconds -ge 3){break}
        }else{$stableSince=$null}
        Start-Sleep -Milliseconds 300
      }
      if(-not $hard -or -not $stableSince -or ((Get-Date)-$stableSince).TotalSeconds -lt 3){throw "Identidade PID/porta/root/token/H1 nao estabilizou em $StartupTimeoutSeconds s."}
      Write-StartupState 'ready' "PID/porta/root/token/H1 confirmados e estaveis; schema=$($hard.schema_version); integrity=$($hard.integrity). Gate fisico pendente."
      Write-Host "[OK] Agente H1 ativo: PID=$($script:startedProcess.Id) / SQLite=$($hard.integrity) / $expected"
      exit 0
    }catch{
      $failure=$_.Exception.Message;Record-Event 'attempt_failed' $failure
      if($script:startedIdentity){Stop-ProcessAndWait $script:startedIdentity 'startup nao validado'}
      if($failure -like '*UNKNOWN_OWNER*' -or $script:attempt -ge $MaxAttempts){throw}
      $script:startedProcess=$null;$script:startedIdentity=$null
      Start-Sleep -Milliseconds 500
    }
  }
}catch{
  $failure=$_.Exception.Message
  if($failure -eq 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED'){
    # Not even startup diagnostics are written while a crash-persistent claim
    # blocks this root. The guardian also remains fail-closed in this state.
    Write-Host '[BLOCKED] Transacao de manutencao pendente ou nao verificavel; agente nao iniciado.'
    throw 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED'
  }
  Write-StartupState 'failed' $failure
  Show-LogTail $script:errLog 'stderr do agente';Show-LogTail $script:outLog 'stdout do agente'
  throw "Startup canonico falhou. $failure Estado: $statePath Evidencia: $historyPath"
}finally{if($script:mutexHeld -and $mutex){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
