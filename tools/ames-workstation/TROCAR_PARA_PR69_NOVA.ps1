param([switch]$LocalOnly,[switch]$NoBrowser,[switch]$Laboratory)
# Supervised PR69 switch. Never copies, overwrites or deletes old operational data.
# The CLEAN builder injects the exact expected SHA into the value below.
$ErrorActionPreference='Stop'
$NewRoot=[IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$ExpectedSha='__BUNDLE_SHA__'
$RunKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName='CentralAMESOperatorAgent'
$mutex=$null;$held=$false;$oldRun=$null;$oldRoot=$null
$stopped=$false;$committed=$false;$failed=$false;$rollbackNeeded=$false
$backupRoot=$null;$python=$null;$registrationChanged=$false
$candidateMayHaveRun=$false;$switchDir=$null
if($NoBrowser -and -not $LocalOnly){throw 'NoBrowser_requires_LocalOnly'}
if($Laboratory -and (-not $LocalOnly -or -not $NoBrowser)){throw 'LAB_REQUIRES_LOCAL_ONLY_AND_NO_BROWSER'}

function Fail([string]$message){throw $message}
function EqualPath($a,$b){return ([string]$a).TrimEnd('\') -ieq ([string]$b).TrimEnd('\')}
function Full([string]$path){if(-not [IO.Path]::IsPathRooted($path)){return $null};try{return [IO.Path]::GetFullPath($path).TrimEnd('\')}catch{return $null}}
function RootFor([string]$entry,[string]$parentName){
  $path=Full $entry
  if(-not $path -or -not(Test-Path -LiteralPath $path -PathType Leaf)){return $null}
  $parent=Split-Path $path -Parent
  if((Split-Path $parent -Leaf) -ine $parentName){return $null}
  if($parentName -eq 'ames-agent'){$root=Split-Path $parent -Parent}
  else {
    if((Split-Path (Split-Path $parent -Parent) -Leaf) -ine 'suporte'){return $null}
    $root=Split-Path (Split-Path $parent -Parent) -Parent
  }
  foreach($required in @('00_INICIAR_AQUI.bat','ames-agent\agent_hardened_entry.py','CANDIDATE_MANIFEST.json')){
    if(-not(Test-Path -LiteralPath (Join-Path $root $required) -PathType Leaf)){return $null}
  }
  return $root
}
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class PR69Argv {
 [DllImport("shell32.dll",SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)]string s,out int n);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 public static string[] Split(string cmd){int n;IntPtr p=CommandLineToArgvW(cmd,out n);if(p==IntPtr.Zero)return new string[0];try{var a=new string[n];for(int i=0;i<n;i++)a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return a;}finally{LocalFree(p);}}
}
'@
function SplitArgv([string]$line){if(-not $line){return @()};return @([PR69Argv]::Split($line))}
function ValueAfter([string[]]$tokens,[string]$flag){for($i=0;$i -lt $tokens.Count-1;$i++){if($tokens[$i] -ieq $flag){return $tokens[$i+1]}};return $null}
function RelauncherType($process){
  if(-not $process -or -not $process.CommandLine){return $null}
  $exe=[IO.Path]::GetFileName([string]$process.ExecutablePath)
  if($exe -notin @('powershell.exe','pwsh.exe')){return $null}
  $entry=ValueAfter (SplitArgv $process.CommandLine) '-File'
  if(-not $entry){return $null}
  $leaf=[IO.Path]::GetFileName([string]$entry)
  if($leaf -ieq 'KEEP_AGENT_RUNNING.ps1'){return 'guardian'}
  if($leaf -in @('START_AGENT_CANONICAL.ps1','START_LOCAL_CANDIDATE.ps1')){return 'launcher'}
  return $null
}
function Identify($process){
  if(-not $process -or -not $process.CommandLine){return $null}
  $argv=SplitArgv $process.CommandLine
  $exe=[IO.Path]::GetFileName([string]$process.ExecutablePath)
  if(-not $exe){return $null}
  $exe=$exe.ToLowerInvariant()
  $kind=$null;$root=$null
  if($exe -in @('python.exe','pythonw.exe')){
    $i=1;while($i -lt $argv.Count -and $argv[$i] -in @('-u','-B')){$i++}
    if($i -lt $argv.Count -and [IO.Path]::GetFileName($argv[$i]) -in @('agent_hardened_entry.py','agent_entry.py','agent.py')){
      $root=RootFor $argv[$i] 'ames-agent';$kind='agent'
    }
  }elseif($exe -in @('powershell.exe','pwsh.exe')){
    $entry=ValueAfter $argv '-File'
    if($entry){
      $leaf=[IO.Path]::GetFileName([string]$entry)
      if($leaf -in @('KEEP_AGENT_RUNNING.ps1','START_AGENT_CANONICAL.ps1')){
        $root=RootFor $entry 'ames-workstation'
        $given=Full (ValueAfter $argv '-Root')
        if(-not $given -or -not(EqualPath $given $root)){$root=$null}
        if($leaf -ieq 'KEEP_AGENT_RUNNING.ps1'){$kind='guardian'}else{$kind='launcher'}
      }elseif($leaf -ieq 'START_LOCAL_CANDIDATE.ps1'){
        $path=Full $entry
        if($path -and (Test-Path -LiteralPath $path -PathType Leaf)){
          $candidateRoot=Split-Path $path -Parent
          if((RootFor (Join-Path $candidateRoot 'ames-agent\agent_hardened_entry.py') 'ames-agent') -and
             (Test-Path -LiteralPath (Join-Path $candidateRoot 'START_LOCAL_CANDIDATE.ps1') -PathType Leaf)){
            $root=$candidateRoot
          }
        }
        $kind='launcher'
      }
    }
  }
  if(-not $kind -or -not $root){return $null}
  return [pscustomobject]@{pid=[int]$process.ProcessId;created=[string]$process.CreationDate;command=[string]$process.CommandLine;kind=$kind;root=$root}
}
function ListenerPids {return @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)}
function RegistryRun {
  if(-not(Test-Path $RunKey)){return $null}
  $item=Get-ItemProperty -Path $RunKey -ErrorAction Stop
  $prop=$item.PSObject.Properties[$RunName]
  if($prop){return [string]$prop.Value}
  return $null
}
function WriteRun($value){
  if($null -eq $value){Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue}
  else {New-Item -Path $RunKey -Force|Out-Null;Set-ItemProperty -Path $RunKey -Name $RunName -Value $value -Type String}
}
function Invoke-StateTransfer([string]$operation){
  $tool=Join-Path $NewRoot 'suporte\ames-workstation\SAFE_STATE_TRANSFER.py'
  $argsList=@($tool,$operation,'--old-root',$oldRoot,'--new-root',$NewRoot)
  if($operation -eq 'stage'){$argsList+=@('--backup-root',$backupRoot)}
  $output=& $python @argsList
  $code=$LASTEXITCODE
  try{$result=($output|Out-String|ConvertFrom-Json -ErrorAction Stop)}catch{Fail 'Recibo da transferencia de estado invalido.'}
  if($code -ne 0 -or $result.ok -ne $true){
    $reason=if($result.reason){[string]$result.reason}else{'transferencia_nao_comprovada'}
    Fail "Transferencia de estado bloqueada: $reason"
  }
  return $result
}
function Write-SwitchEvidence([string]$Phase){
  if(-not $script:switchDir){Fail 'Journal de troca indisponivel; recuperacao supervisionada obrigatoria.'}
  $target=Join-Path $script:switchDir ($Phase+'.json')
  $body=[ordered]@{schema='central-switch-v1';phase=$Phase;old_root=$oldRoot;candidate_root=$NewRoot;backup_root=$backupRoot;candidate_may_have_run=$script:candidateMayHaveRun;physical='PENDING';created_at=(Get-Date).ToUniversalTime().ToString('o')}
  $bytes=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json))
  $stream=New-Object IO.FileStream($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  if((Get-Item -LiteralPath $target).Length -ne $bytes.Length){Fail 'Journal incompleto; nao retomar automaticamente.'}
}
function Preserve-CandidateIntent {
  # This is a durable fail-closed barrier, NOT an atomic multi-file transaction.
  # Take the SAME bootstrap gate before retiring A, so no direct starter can
  # race the persistent marker. Known guardians are already stopped.
  $gate=New-Object System.Threading.Mutex($false,'Global\CentralAMES.CanonicalBootstrap.8765')
  $locked=$false
  try{
    try{$locked=$gate.WaitOne(10000)}catch [System.Threading.AbandonedMutexException]{$locked=$true}
    if(-not $locked){Fail 'Bootstrap concorrente; recuperacao supervisionada obrigatoria.'}
    $script:switchDir=Join-Path $NewRoot '.ames-switch'
    if(Test-Path -LiteralPath $script:switchDir){Fail 'Journal anterior existe; nao sobrescrever nem retomar.'}
    New-Item -ItemType Directory -Path $script:switchDir -ErrorAction Stop|Out-Null
    Write-SwitchEvidence 'candidate-intent'
    $retired=Join-Path $oldRoot '.ames-update'
    if(Test-Path -LiteralPath $retired){
      $item=Get-Item -LiteralPath $retired -Force
      if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or @(Get-ChildItem -LiteralPath $retired -Force).Count){Fail 'Estado de manutencao antigo nao comprovado.'}
    }else{New-Item -ItemType Directory -Path $retired -ErrorAction Stop|Out-Null}
    $bytes=[Text.Encoding]::UTF8.GetBytes('CENTRAL_SWITCH_RETIRED_GENERATION_PRESERVE_ALL_DATA')
    $stream=New-Object IO.FileStream((Join-Path $retired 'switch-retired.txt'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  }finally{if($locked){$gate.ReleaseMutex()};$gate.Dispose()}
}
function Assert-InstallationLaboratory([switch]$CheckSource){
  # An explicit synthetic CI authorization, NEVER a fabricated operator click.
  # This path cannot certify a factory network, account or workstation.
  if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or $env:GITHUB_RUN_ID -notmatch '^\d+$'){Fail 'LAB_HOST_UNVERIFIED'}
  $lab=[IO.Path]::GetFullPath($env:INSTALL98_ROOT).TrimEnd('\')
  if((Split-Path $lab -Parent) -ine [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') -or
     (Split-Path $lab -Leaf) -cne ('CENTRAL-INSTALL-LAB-'+$env:GITHUB_RUN_ID) -or
     (Split-Path $NewRoot -Parent) -ine $lab -or
     [IO.File]::ReadAllText((Join-Path $lab '.installation98-synthetic.json')) -cne 'CENTRAL98_SYNTHETIC_INSTALLATION_ONLY'){Fail 'LAB_ROOT_UNVERIFIED'}
  $proof=Get-Content -LiteralPath (Join-Path $lab 'containment.json') -Raw|ConvertFrom-Json
  if($proof.kernel_deny_proven -ne $true -or $proof.loopback_proven -ne $true -or
     [long]$proof.wfp_record_id -le 0 -or [long]$proof.probe_pid -le 0){Fail 'LAB_WFP_DENIAL_UNVERIFIED'}
  $event=Get-WinEvent -LogName Security -FilterXPath ('*[System[EventRecordID='+[long]$proof.wfp_record_id+']]') -ErrorAction Stop
  $xml=[xml]$event.ToXml();$fields=@{};foreach($d in $xml.Event.EventData.Data){$fields[$d.Name]=[string]$d.'#text'}
  if($event.Id -notin @(5157,5152) -or $fields['DestAddress'] -cne '198.51.100.1' -or
     [long]$fields['ProcessID'] -ne [long]$proof.probe_pid -or $event.TimeCreated -lt (Get-Date).AddHours(-1)){Fail 'LAB_WFP_DENIAL_UNVERIFIED'}
  if(@(Get-NetFirewallProfile|Where-Object {-not $_.Enabled}).Count){Fail 'LAB_FIREWALL_DISABLED'}
  $rules=@(Get-NetFirewallRule -Group ('CENTRAL98-'+$env:GITHUB_RUN_ID) -ErrorAction Stop)
  if($rules.Count -ne [int]$proof.rules -or @($rules|Where-Object {$_.Enabled -ne 'True' -or $_.Action -ne 'Block' -or $_.Direction -ne 'Outbound'}).Count){Fail 'LAB_FIREWALL_RULES_UNVERIFIED'}
  foreach($rule in $rules){if(@($rule|Get-NetFirewallAddressFilter|Where-Object {$_.RemoteAddress -ne 'Any'}).Count){Fail 'LAB_EGRESS_SCOPE_UNVERIFIED'}}
  $programs=@($rules|Get-NetFirewallApplicationFilter|ForEach-Object {$_.Program})
  foreach($required in @((Get-Command python -ErrorAction Stop).Source,(Join-Path $NewRoot '.venv\Scripts\python.exe'),(Join-Path $NewRoot '.venv\Lib\site-packages\playwright\driver\node.exe'),(Join-Path $PSHOME 'powershell.exe'),'C:\Program Files\Google\Chrome\Application\chrome.exe')){
    if($programs -notcontains $required){Fail 'LAB_EXECUTABLE_NOT_CONTAINED'}
  }
  if($CheckSource){
    if((Split-Path $oldRoot -Parent) -ine $lab){Fail 'LAB_SOURCE_OUTSIDE_ROOT'}
    $cfg=Get-Content -LiteralPath (Join-Path $oldRoot 'ames-agent\config.json') -Raw|ConvertFrom-Json
    if($cfg.host -cne '127.0.0.1' -or [int]$cfg.port -ne 8765 -or $cfg.ames_host -cne '127.0.0.1' -or [int]$cfg.ames_port -ne 9 -or
       $cfg.ames_start_url -cne 'http://127.0.0.1:9/SYNTHETIC98' -or $cfg.ames_wifi_profile -cne 'SYNTHETIC98-NO-WLAN' -or
       -not ([IO.Path]::GetFullPath($cfg.chrome_profile_dir)).StartsWith($lab+'\',[StringComparison]::OrdinalIgnoreCase)){Fail 'LAB_CONFIGURATION_NOT_SYNTHETIC'}
    $identity=[IO.File]::ReadAllText((Join-Path $oldRoot 'ames-agent\data\local_agent_token')).Trim()
    if(-not $identity.StartsWith('SYNTHETIC98-') -or $identity.Length -lt 64){Fail 'LAB_IDENTITY_NOT_SYNTHETIC'}
  }
}
function StopKnown($known){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($known.pid)" -ErrorAction SilentlyContinue
  $now=Identify $p
  if(-not $now -or $now.created -ne $known.created -or $now.command -cne $known.command -or $now.kind -ne $known.kind -or -not(EqualPath $now.root $known.root)){
    Fail "PID $($known.pid) mudou de identidade; nenhum processo estranho sera encerrado."
  }
  Stop-Process -Id $known.pid -Force -ErrorAction Stop
  try{Wait-Process -Id $known.pid -Timeout 12 -ErrorAction Stop}catch{if(Get-Process -Id $known.pid -ErrorAction SilentlyContinue){throw}}
  $script:stopped=$true
}

try {
  if(Test-Path -LiteralPath (Join-Path $NewRoot '.ames-switch')){Fail 'Journal de troca anterior existe; preservar evidencias e recuperar com supervisao.'}
  $manifest=Get-Content -LiteralPath (Join-Path $NewRoot 'CANDIDATE_MANIFEST.json') -Raw | ConvertFrom-Json
  if($manifest.sha -cne $ExpectedSha -or $manifest.development -or -not $manifest.standalone_clean){Fail 'SHA/estado do pacote PR69 diferente do esperado; troca bloqueada.'}
  foreach($required in @('00_INICIAR_AQUI.bat','01_INSTALAR_UMA_VEZ.bat','08_PREPARAR_REDE_AMES.bat','TROCAR_PARA_PR69_NOVA.ps1','START_LOCAL_CANDIDATE.ps1','network/ensure_ames_route.ps1','suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1','suporte\ames-workstation\SAFE_STATE_TRANSFER.py','suporte\ames-workstation\issue57_update_preflight.py','ames-agent\agent_hardened_entry.py')){
    $file=Join-Path $NewRoot $required
    if(-not(Test-Path -LiteralPath $file -PathType Leaf)){Fail "Pacote incompleto: $required"}
    $manifestKey=$required.Replace('\','/')
    $expected=$manifest.files.PSObject.Properties[$manifestKey]
    if(-not $expected){Fail "Arquivo sem hash no manifesto: $required"}
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne ([string]$expected.Value).ToLowerInvariant()){Fail "Arquivo alterado: $required"}
  }
  # Hash-check the ENTIRE release, including the frontend being tested,
  # before any process/registry changes or temporary runtime preparation.
  $prefix=$NewRoot+'\'
  foreach($entry in @($manifest.files.PSObject.Properties)){
    $relative=[string]$entry.Name
    if(-not $relative -or $relative.StartsWith('/') -or $relative.Contains('\') -or
       $relative.Contains(':') -or $relative -match '(^|/)\.\.?(/|$)'){
      Fail 'Manifesto contem caminho inseguro; troca bloqueada.'
    }
    $file=[IO.Path]::GetFullPath((Join-Path $NewRoot ($relative.Replace('/','\'))))
    if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or
       -not(Test-Path -LiteralPath $file -PathType Leaf)){
      Fail 'Manifesto referencia arquivo ausente ou fora do pacote.'
    }
    $current=$file
    while(-not(EqualPath $current $NewRoot)){
      $info=Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if($info.Attributes -band [IO.FileAttributes]::ReparsePoint){Fail 'Pacote contem link ou junction; troca bloqueada.'}
      $current=Split-Path $current -Parent
    }
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne ([string]$entry.Value).ToLowerInvariant()){Fail "Hash do pacote divergente: $relative"}
  }
  if(-not(Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)){Fail 'Get-NetTCPConnection indisponivel.'}
  Write-Host "Pacote PR69 confirmado: $ExpectedSha"
  Write-Host 'A troca prepara dependencias ANTES de interromper o agente.'
  Write-Host 'Depois de parar o agente, faz backup privado, ensaio de restauracao e transferencia verificada.'
  Write-Host 'Somente execute sem coletas/sincronizacoes pendentes.'

  if($Laboratory){Assert-InstallationLaboratory}
  # Network checks happen before stopping the old agent; a failed Wi-Fi/UAC
  # must not cause production downtime.
  if(-not $LocalOnly){
  & (Join-Path $NewRoot '08_PREPARAR_REDE_AMES.bat') /auto
  if($LASTEXITCODE -ne 0){Fail 'Rede da nova instalacao ainda nao comprovada.'}
  }else{Write-Host '[LOCAL] Somente inicializacao e historicos locais; rede/MES NAO homologados.'}

  $mutex=New-Object System.Threading.Mutex($false,'Global\CentralAMES.UpdateTransaction.8765')
  try{$held=$mutex.WaitOne(12000)}catch [System.Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){Fail 'Trava de atualizacao ocupada; nenhum agente encerrado.'}
  # The canonical starter can still be completing a legitimate bootstrap when
  # the operator clicks TROCAR. Let it exit on its own; never kill a launcher
  # whose PID has not been independently attested to a single package root.
  $waitDeadline=(Get-Date).AddSeconds(75)
  $announcedWait=$false
  while($true){
    $all=@(Get-CimInstance Win32_Process -ErrorAction Stop)
    $known=@($all | ForEach-Object {Identify $_} | Where-Object {$_})
    $launchers=@($all | Where-Object {(RelauncherType $_) -eq 'launcher'})
    foreach($launcher in $launchers){
      $match=@($known | Where-Object {$_.pid -eq $launcher.ProcessId -and $_.kind -eq 'launcher'})
      if($match.Count -ne 1){
        $leaf=[IO.Path]::GetFileName([string](ValueAfter (SplitArgv $launcher.CommandLine) '-File'))
        Fail "Inicializador A-MES nao reconhecido PID $($launcher.ProcessId) ($leaf); preservado sem encerrar nenhum agente."
      }
      if(EqualPath $match[0].root $NewRoot){Fail 'Inicializador da nova pasta ja esta em andamento; aguarde seu encerramento.'}
    }
    if($launchers.Count -eq 0){break}
    if(-not $announcedWait){Write-Host '[AGUARDANDO] Inicializador A-MES antigo ainda finalizando; ate 75 segundos, sem encerrar nenhum PID.' -ForegroundColor Yellow;$announcedWait=$true}
    if((Get-Date) -ge $waitDeadline){
      Fail "Inicializador A-MES PID $($launchers[0].ProcessId) segue ativo depois de 75 segundos; nenhum agente encerrado."
    }
    Start-Sleep -Seconds 2
  }
  # Reinspect immediately after the last launcher exits. The transaction
  # mutex suppresses enrolled guardians throughout this supervised transition.
  $all=@(Get-CimInstance Win32_Process -ErrorAction Stop)
  $known=@($all | ForEach-Object {Identify $_} | Where-Object {$_})
  $listeners=ListenerPids
  foreach($listener in $listeners){
    if(@($known|Where-Object {$_.pid -eq $listener -and $_.kind -eq 'agent'}).Count -ne 1){Fail "Porta 8765 pertence a PID nao reconhecido: $listener"}
  }
  foreach($process in $all){
    $type=RelauncherType $process
    if($type -and -not(@($known|Where-Object {$_.pid -eq $process.ProcessId -and $_.kind -eq $type}).Count)){
      $entry=[IO.Path]::GetFileName([string](ValueAfter (SplitArgv $process.CommandLine) '-File'))
      Fail "Relauncher A-MES nao reconhecido PID $($process.ProcessId) ($entry); troca bloqueada."
    }
  }
  if(@($known|Where-Object {$_.kind -eq 'launcher'}).Count){Fail 'Outro inicializador A-MES comecou durante o inventario; aguarde e tente novamente.'}
  $roots=@($known|ForEach-Object {$_.root}|Sort-Object -Unique)
  if($roots.Count -gt 1){Fail 'Mais de uma instalacao ativa; precisa de investigacao manual.'}
  if($roots.Count -eq 0){Fail 'Nenhum agente/guardian antigo identificado; para PC virgem, use 00_INICIAR_AQUI.bat.'}
  $oldRoot=$roots[0]
  if(EqualPath $oldRoot $NewRoot){Fail 'Nova versao ja esta ativa.'}
  if(-not(Test-Path -LiteralPath (Join-Path $oldRoot 'suporte\ames-workstation\START_AGENT_CANONICAL.ps1') -PathType Leaf)){
    Fail 'Instalacao antiga nao tem launcher canonico para rollback automatico; troca bloqueada.'
  }
  # Retirement requires the exact attested barrier-aware launcher/helper/guardian.
  # Do not assume an unknown older installation honors crash-persistent claims.
  foreach($name in @('START_AGENT_CANONICAL.ps1','ISSUE57_RELAUNCH_ENROLLMENT.ps1','KEEP_AGENT_RUNNING.ps1')){
    $oldFile=Join-Path $oldRoot ('suporte\ames-workstation\'+$name)
    $newFile=Join-Path $NewRoot ('suporte\ames-workstation\'+$name)
    if(-not(Test-Path -LiteralPath $oldFile -PathType Leaf) -or
       (Get-FileHash -LiteralPath $oldFile).Hash -cne (Get-FileHash -LiteralPath $newFile).Hash){
      Fail 'Contrato de bloqueio persistente da instalacao antiga nao comprovado; nao interromper.'
    }
  }
  $oldRun=RegistryRun
  if($oldRun){
    $runTokens=SplitArgv $oldRun
    $watcher=ValueAfter $runTokens '-File'
    $regRoot=Full (ValueAfter $runTokens '-Root')
    $watcherRoot=if($watcher){RootFor $watcher 'ames-workstation'}else{$null}
    $registryProblems=@()
    if(-not $regRoot){$registryProblems+='parametro_Root_invalido'}
    if(-not $watcherRoot){$registryProblems+='guardian_nao_atestado'}
    if($regRoot -and -not(EqualPath $oldRoot $regRoot)){$registryProblems+='raiz_diferente_do_agente'}
    if($regRoot -and $watcherRoot -and -not(EqualPath $regRoot $watcherRoot)){$registryProblems+='script_guardian_em_outra_raiz'}
    if($registryProblems.Count){
      Fail ('Inicio automatico antigo nao corresponde ao agente ativo: '+($registryProblems -join ',')+'. Preservado sem alteracao.')
    }
  }
  if(Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue){
    $tasks=@(Get-ScheduledTask -ErrorAction Stop|Where-Object {$_.State -ne 'Disabled' -and @($_.Actions|Where-Object {($_.Execute+' '+$_.Arguments) -match 'KEEP_AGENT_RUNNING|START_AGENT_CANONICAL|agent_hardened_entry'}).Count})
    if($tasks.Count){Fail 'Agendador Windows possui relauncher A-MES; troca bloqueada.'}
  }
  $services=@(Get-CimInstance Win32_Service -ErrorAction Stop|Where-Object {$_.StartMode -ne 'Disabled' -and $_.PathName -match 'KEEP_AGENT_RUNNING|START_AGENT_CANONICAL|agent_hardened_entry'})
  if($services.Count){Fail 'Servico Windows relanca A-MES; troca bloqueada.'}
  if(@($known|Where-Object {$_.kind -eq 'guardian'}).Count -and -not $oldRun){
    Fail 'Guardian antigo ativo mas nao registrado no inicio automatico; comportamento de retorno nao comprovado.'
  }
  if($listeners.Count){
    $tokenFile=Join-Path $oldRoot 'ames-agent\data\local_agent_token'
    if(-not(Test-Path -LiteralPath $tokenFile)){Fail 'Token antigo indisponivel para conferir coletas.'}
    $token=(Get-Content -LiteralPath $tokenFile -Raw).Trim()
    if($token.Length -lt 32){Fail 'Token antigo invalido.'}
    try{$jobs=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/jobs' -Headers @{'X-Central-Agent-Token'=$token} -TimeoutSec 5}
    catch{Fail 'Nao foi possivel confirmar estado das coletas; troca bloqueada.'}
    if($null -eq $jobs.jobs){Fail 'Agente antigo nao retornou lista de coletas valida.'}
    if(@($jobs.jobs|Where-Object {$_.status -in @('running','queued','pending','starting','in_progress')}).Count){Fail 'Ha coleta em andamento; troca bloqueada.'}
  }
  # Running the normal installer before migration would create a fresh SQLite
  # and block safe transfer. /prepare installs dependencies only, with NO data.
  & (Join-Path $NewRoot '01_INSTALAR_UMA_VEZ.bat') /prepare
  if($LASTEXITCODE -ne 0){Fail 'Dependencias da nova versao nao foram preparadas; agente antigo preservado.'}
  $python=Join-Path $NewRoot '.venv\Scripts\python.exe'
  if(-not(Test-Path -LiteralPath $python -PathType Leaf)){Fail 'Python da nova versao indisponivel.'}
  $receipt=Invoke-StateTransfer 'preflight'
  if(-not $receipt.candidate_pristine -or -not $receipt.old_runtime_present){Fail 'Preflight de estado nao comprovado.'}
  $backupRoot=Join-Path (Split-Path $NewRoot -Parent) ('CENTRAL_AMES_BACKUP_'+$ExpectedSha.Substring(0,8)+'_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'_'+[guid]::NewGuid().ToString('N').Substring(0,8))
  # Ask only after validating the old agent, guardian and idle job queue.
  # A click on 01_TROCAR is the operator's intent; never demand a typed word.
  # PCs without an identified old agent exit above with the 00_INICIAR_AQUI path.
  if($Laboratory){
    Assert-InstallationLaboratory -CheckSource
    Write-Host 'LAB_AUTHORIZATION=EXPLICIT_SYNTHETIC_CI; OPERATOR_DIALOG=NOT_EXERCISED'
  }else{
  try {
    $dialog=New-Object -ComObject WScript.Shell -ErrorAction Stop
    $answer=$dialog.Popup('Agente antigo identificado e nenhuma coleta ativa observada. Confirmou que nao ha sincronizacao pendente no navegador? A troca fara backup privado e restauracao ensaiada antes de iniciar a nova versao. Continuar?',0,'Central/A-MES - troca com preservacao de historico',0x34)
  } catch {
    Fail 'Confirmacao visual do Windows indisponivel; troca bloqueada sem desligar o agente antigo.'
  }
  if($answer -ne 6){Fail 'Operador escolheu nao prosseguir; agente antigo preservado.'}
  }
  if($oldRun){WriteRun $null;$registrationChanged=$true}
  foreach($process in @($known|Where-Object {$_.kind -eq 'guardian'})){StopKnown $process}
  foreach($process in @($known|Where-Object {$_.kind -eq 'agent'})){StopKnown $process}
  Start-Sleep -Seconds 2
  if((ListenerPids).Count){Fail 'Porta 8765 foi ocupada novamente.'}
  # The old runtime is now quiesced under the transaction mutex. On error,
  # original files are NEVER modified; candidate staging is left for audit.
  $receipt=Invoke-StateTransfer 'stage'
  if(-not $receipt.backup_verified -or -not $receipt.restore_rehearsed -or
     -not $receipt.source_unchanged -or -not $receipt.staged_identity_verified){
    Fail 'Backup, ensaio de restauracao ou identidade da transferencia nao comprovados.'
  }
  Write-Host '[OK] SQLite, configuracao, token e arquivos operacionais transferidos com backup ensaiado.'
  # Unknown is treated as possible execution BEFORE journal/start I/O. Even a
  # failed journal write must never reopen A after this conservative boundary.
  $candidateMayHaveRun=$true
  Preserve-CandidateIntent
  $startup=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $NewRoot 'START_LOCAL_CANDIDATE.ps1'))
  if($LocalOnly){$startup+='-LocalOnly'}
  if($NoBrowser){$startup+='-NoBrowser'}
  & powershell.exe @startup
  if($LASTEXITCODE -ne 0){Fail 'Novo launcher nao passou no preflight.'}
  $owners=ListenerPids
  if($owners.Count -ne 1){Fail 'Novo agente nao confirmou listener unico na porta 8765.'}
  $newProcess=Identify (Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])" -ErrorAction SilentlyContinue)
  if(-not $newProcess -or $newProcess.kind -ne 'agent' -or -not(EqualPath $newProcess.root $NewRoot)){Fail 'PID do novo agente nao corresponde a pasta PR69.'}
  if($oldRun){
    $watcher=Join-Path $NewRoot 'suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1'
    $value='powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$watcher+'" -Root "'+$NewRoot+'"'
    WriteRun $value
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$watcher+'"'),'-Root',('"'+$NewRoot+'"'))
  }
  Write-SwitchEvidence 'committed'
  $committed=$true
  Write-Host 'TROCA_PR69=SUCCESS' -ForegroundColor Green
  Write-Host "Backup privado confirmado: $backupRoot"
  Write-Host 'Pasta antiga preservada. Historico transferido; validacao fisica continua obrigatoria.'
} catch {
  $failed=$true
  Write-Host ('TROCA_PR69=BLOCKED: '+$_.Exception.Message) -ForegroundColor Red
  if(-not $committed -and -not $candidateMayHaveRun -and $registrationChanged -and $oldRun){
    try{WriteRun $oldRun;Write-Host 'Inicio automatico antigo restaurado.'}catch{Write-Host 'ATENCAO: falha ao restaurar registro de inicio automatico.'}
  }
  if(-not $committed -and $stopped){$rollbackNeeded=$true}
} finally {
  if($held -and $mutex){$mutex.ReleaseMutex()}
  if($mutex){$mutex.Dispose()}
}
if($rollbackNeeded){
  if($candidateMayHaveRun){
    # R2: preserve B and C0; no restart of stale A and no old Run registration.
    # The A retirement marker also blocks its attested canonical/guardian.
    Write-Host 'ROLLBACK_ANTIGO=STOP_NEW_OR_UNKNOWN_EVIDENCE' -ForegroundColor Red
    Write-Host 'Preserve A, B e backup. Retorno exige recuperacao supervisionada; nao substituir SQLite.'
    exit 1
  }
  # Never kill unknown PIDs. Only reclaim the verified candidate root, then
  # restart the preserved old installation AFTER releasing UpdateTransaction.
  try {
    $all=@(Get-CimInstance Win32_Process -ErrorAction Stop)
    $newKnown=@($all|ForEach-Object {Identify $_}|Where-Object {$_ -and (EqualPath $_.root $NewRoot)})
    $oldKnown=@($all|ForEach-Object {Identify $_}|Where-Object {$_ -and (EqualPath $_.root $oldRoot)})
    $listeners=ListenerPids
    foreach($pidOnPort in $listeners){
      $candidate=@($newKnown|Where-Object {$_.pid -eq $pidOnPort -and $_.kind -eq 'agent'})
      $original=@($oldKnown|Where-Object {$_.pid -eq $pidOnPort -and $_.kind -eq 'agent'})
      if($candidate.Count -ne 1 -and $original.Count -ne 1){
        Fail "Porta 8765 ocupada por PID nao comprovado no rollback: $pidOnPort"
      }
    }
    foreach($item in @($newKnown|Where-Object {$_.kind -eq 'guardian'})){StopKnown $item}
    foreach($item in @($newKnown|Where-Object {$_.kind -eq 'agent'})){StopKnown $item}
    $remaining=ListenerPids
    if($remaining.Count -gt 1){Fail 'Multiplos listeners na porta 8765; rollback automatico bloqueado.'}
    if($remaining.Count -eq 0){
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $oldRoot 'suporte\ames-workstation\START_AGENT_CANONICAL.ps1') -Root $oldRoot
      if($LASTEXITCODE -ne 0){Fail 'Inicializador antigo retornou erro.'}
    }
    $oldListener=ListenerPids
    if($oldListener.Count -ne 1){Fail 'Listener da versao antiga nao confirmado.'}
    $oldAgent=Identify (Get-CimInstance Win32_Process -Filter "ProcessId=$($oldListener[0])" -ErrorAction SilentlyContinue)
    if(-not $oldAgent -or $oldAgent.kind -ne 'agent' -or -not(EqualPath $oldAgent.root $oldRoot)){
      Fail 'Agente antigo nao comprovado apos reinicio.'
    }
    if($oldRun){
      $oldGuardian=Join-Path $oldRoot 'suporte\ames-workstation\KEEP_AGENT_RUNNING.ps1'
      Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$oldGuardian+'"'),'-Root',('"'+$oldRoot+'"'))
    }
    Write-Host 'ROLLBACK_ANTIGO=SUCCESS; dados originais preservados.' -ForegroundColor Green
  }catch{
    Write-Host ('ROLLBACK_ANTIGO=MANUAL: '+$_.Exception.Message) -ForegroundColor Red
    Write-Host 'Nao inicie outra pasta ate conferir porta 8765 e processos; preserve as duas instalacoes e o backup.'
  }
}
if($failed){exit 1}
