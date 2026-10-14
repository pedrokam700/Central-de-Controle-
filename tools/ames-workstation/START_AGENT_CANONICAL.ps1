param(
  [Parameter(Mandatory=$true)][string]$Root,
  [int]$StartupTimeoutSeconds=60
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $Root).Path
$expected=[IO.Path]::GetFullPath($root).TrimEnd([char]92)
$python=Join-Path $root '.venv\Scripts\python.exe'
$agent=Join-Path $root 'ames-agent\agent_hardened_entry.py'
$tokenPath=Join-Path $root 'ames-agent\data\local_agent_token'
$logs=Join-Path $root 'logs'
$statePath=Join-Path $logs 'agent_startup_state.json'
$script:startedProcess=$null
$script:outLog=$null
$script:errLog=$null
$script:lastProbeError=''
$script:lastHardeningError=''

New-Item -ItemType Directory -Force -Path $logs | Out-Null
if(-not (Test-Path -LiteralPath $python)){throw "Python do ambiente local nao encontrado: $python"}
if(-not (Test-Path -LiteralPath $agent)){throw "Entrypoint canonico endurecido nao encontrado: $agent"}

function Write-StartupState {
  param([string]$Status,[string]$Message='')
  $payload=[ordered]@{
    updated_at=(Get-Date).ToUniversalTime().ToString('o')
    status=$Status
    message=$Message
    package_root=$expected
    pid=$null
    stdout=$script:outLog
    stderr=$script:errLog
  }
  if($script:startedProcess){$payload.pid=$script:startedProcess.Id}
  try{$payload|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $statePath -Encoding UTF8}catch{}
}

function Get-AgentToken {
  if(-not (Test-Path -LiteralPath $tokenPath)){return $null}
  try{
    $token=(Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
    if($token.Length -ge 32){return $token}
  }catch{}
  return $null
}

function Get-AgentHeaders {
  $token=Get-AgentToken
  if(-not $token){return $null}
  return @{'X-Central-Agent-Token'=$token}
}

function Get-HardeningHealth {
  $script:lastHardeningError=''
  $headers=Get-AgentHeaders
  if(-not $headers){$script:lastHardeningError='Token local ainda nao disponivel.';return $null}
  try {
    $hh=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/hardening/health' -Headers $headers -TimeoutSec 5
    $indexesOk=$true
    if($null -ne $hh.performance_indexes){$indexesOk=[bool]$hh.performance_indexes.ok}
    if($hh.ok -and [string]$hh.hardening -eq 'H1' -and [string]$hh.integrity -eq 'ok' -and [int]$hh.schema_version -ge 1 -and [string]$hh.local_security.mode -eq 'workstation-token-v1' -and $indexesOk){return $hh}
    $script:lastHardeningError='Resposta H1 recebida, mas o contrato de integridade/seguranca/indexes nao ficou GREEN.'
  } catch {$script:lastHardeningError=$_.Exception.Message}
  return $null
}

function Get-PublicHealth {
  $script:lastProbeError=''
  try{return Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 5}catch{$script:lastProbeError=$_.Exception.Message;return $null}
}

function Stop-ProcessAndWait {
  param([Parameter(Mandatory=$true)][int]$ProcessId,[string]$Reason='reinicio controlado')
  $proc=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if(-not $proc){return}
  Write-Host "Parando processo A-MES PID $ProcessId ($Reason)..."
  Stop-Process -Id $ProcessId -Force -ErrorAction Stop
  for($i=0;$i -lt 50;$i++){
    if(-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)){return}
    Start-Sleep -Milliseconds 100
  }
  throw "Processo A-MES PID $ProcessId nao encerrou em ate 5 s."
}

function Stop-AgentOn8765 {
  $listeners=@(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
  foreach($processId in @($listeners.OwningProcess | Sort-Object -Unique)){
    if(-not $processId){continue}
    $process=Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    $cmd=if($process){[string]$process.CommandLine}else{''}
    if(-not $process -or $cmd -notmatch 'agent(_hardened|_clean)?_entry\.py|agent\.py'){
      throw "Porta 8765 ocupada pelo PID $processId, que nao foi confirmado como agente A-MES. Feche-o manualmente; nenhum processo desconhecido sera morto."
    }
    Stop-ProcessAndWait -ProcessId $processId -Reason 'agente incompatível/residual na porta 8765'
  }
}

function Stop-ResidualSamePackageAgents {
  $all=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  foreach($process in @($all)){
    if(-not $process.CommandLine){continue}
    if([int]$process.ProcessId -eq [int]$PID){continue}
    $cmd=[string]$process.CommandLine
    if($cmd.IndexOf($agent,[StringComparison]::OrdinalIgnoreCase) -ge 0){
      Stop-ProcessAndWait -ProcessId ([int]$process.ProcessId) -Reason 'processo residual da mesma pasta'
    }
  }
}

function Get-CanonicalIdentity {
  param($Health)
  if(-not $Health -or -not $Health.ok){return $null}
  if(-not $Health.agent_version -or -not $Health.candidate_version -or -not $Health.agent_build -or -not $Health.db){
    throw 'A porta 8765 respondeu, mas nao se identificou como agente A-MES completo.'
  }
  $actual=''
  if($Health.package_root){$actual=[IO.Path]::GetFullPath([string]$Health.package_root).TrimEnd([char]92)}
  return [pscustomobject]@{
    actual=$actual
    buildOk=([string]$Health.agent_build -like 'CANONICAL-*')
    rootOk=($actual -and $actual -ieq $expected)
  }
}

function Show-LogTail {
  param([string]$Path,[string]$Label)
  if(-not $Path -or -not (Test-Path -LiteralPath $Path)){Write-Host "$Label: arquivo ainda nao criado.";return}
  $lines=@(Get-Content -LiteralPath $Path -Tail 40 -ErrorAction SilentlyContinue)
  if(-not $lines -or $lines.Count -eq 0){Write-Host "$Label: vazio.";return}
  Write-Host "--- $Label ($Path) ---"
  $lines|ForEach-Object{Write-Host $_}
}

# Reuso idempotente: primeiro prove identidade publica; depois use o token local
# para consultar o diagnostico H1 protegido. O endpoint H1 NAO e publico.
$existing=Get-PublicHealth
if($existing){
  $identity=Get-CanonicalIdentity $existing
  $hard=$null
  if($identity.buildOk -and $identity.rootOk){$hard=Get-HardeningHealth}
  if($identity.buildOk -and $identity.rootOk -and $hard){
    Write-Host "[OK] Agente canonico H1 ja esta ativo: $($existing.candidate_version) / $($existing.agent_build) / schema=$($hard.schema_version) / $($identity.actual)"
    exit 0
  }
  Write-Host "Agente incompatível/incompleto detectado: versao=$($existing.candidate_version) build=$($existing.agent_build) root=$($identity.actual) H1=$([bool]$hard)"
  if($script:lastHardeningError){Write-Host "H1: $script:lastHardeningError"}
  Stop-AgentOn8765
}else{
  # Health indisponivel nao autoriza iniciar cegamente sobre uma porta ocupada.
  $listeners=@(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count -gt 0){Stop-AgentOn8765}
}

# Mata apenas residuos desta MESMA pasta que ficaram vivos sem listener. Isso
# cobre startup interrompido sem tocar em processos desconhecidos/outros postos.
Stop-ResidualSamePackageAgents

$stamp=Get-Date -Format 'yyyyMMdd_HHmmss_fff'
$script:outLog=Join-Path $logs ("agent_stdout_$stamp.log")
$script:errLog=Join-Path $logs ("agent_stderr_$stamp.log")
Set-Content -LiteralPath $script:outLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Set-Content -LiteralPath $script:errLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8

try{
  # python.exe + -u: janela escondida, mas stdout/stderr reais e sem buffer.
  # pythonw deixava diagnostico vazio/ambíguo em falhas de startup.
  $script:startedProcess=Start-Process -FilePath $python -ArgumentList @('-u',('"'+$agent+'"')) -WorkingDirectory (Split-Path $agent -Parent) -WindowStyle Hidden -RedirectStandardOutput $script:outLog -RedirectStandardError $script:errLog -PassThru
  Write-StartupState -Status 'starting' -Message 'Processo criado; aguardando /ready, /health e H1 autenticado.'

  $deadline=(Get-Date).AddSeconds([Math]::Max(10,$StartupTimeoutSeconds))
  $ready=$null
  while((Get-Date) -lt $deadline){
    if($script:startedProcess.HasExited){
      throw "Agente encerrou durante o startup com exit code $($script:startedProcess.ExitCode)."
    }
    try{
      $ready=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3
      if($ready.ready){break}
    }catch{$script:lastProbeError=$_.Exception.Message}
    Start-Sleep -Milliseconds 500
  }
  if(-not $ready -or -not $ready.ready){throw "API /ready nao respondeu em ate $StartupTimeoutSeconds s. Ultimo probe: $script:lastProbeError"}

  $health=Get-PublicHealth
  if(-not $health){throw "API /health falhou apos /ready. Ultimo probe: $script:lastProbeError"}
  $identity=Get-CanonicalIdentity $health
  if(-not $identity.buildOk){throw "Build inesperado apos startup: $($health.agent_build)"}
  if(-not $identity.rootOk){throw "Agente iniciou de pasta divergente. Esperado=$expected Atual=$($identity.actual)"}

  $hard=Get-HardeningHealth
  if(-not $hard){throw "H1 protegido nao validou com o token deste posto. $script:lastHardeningError"}

  Write-StartupState -Status 'ready' -Message "H1 GREEN; schema=$($hard.schema_version); integrity=$($hard.integrity)."
  Write-Host "[OK] Agente H1 ativo: $($health.candidate_version) / $($health.agent_build) / schema=$($hard.schema_version) / SQLite=$($hard.integrity) / $($identity.actual)"
  exit 0
}catch{
  $failure=$_.Exception.Message
  if($script:startedProcess -and -not $script:startedProcess.HasExited){
    try{Stop-ProcessAndWait -ProcessId $script:startedProcess.Id -Reason 'startup nao validado'}catch{Write-Host ('[WARN] Falha ao limpar processo iniciado: '+$_.Exception.Message) -ForegroundColor Yellow}
  }
  Write-StartupState -Status 'failed' -Message $failure
  Show-LogTail -Path $script:errLog -Label 'stderr do agente'
  Show-LogTail -Path $script:outLog -Label 'stdout do agente'
  throw "Startup canonico falhou e o processo iniciado foi limpo. $failure Estado: $statePath"
}
