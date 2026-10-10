param(
  [Parameter(Mandatory=$true)][string]$Root
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path $Root).Path
$expected=[IO.Path]::GetFullPath($root).TrimEnd([char]92)
$pythonw=Join-Path $root '.venv\Scripts\pythonw.exe'
$python=Join-Path $root '.venv\Scripts\python.exe'
$agent=Join-Path $root 'ames-agent\agent_hardened_entry.py'
$logs=Join-Path $root 'logs'
$outLog=Join-Path $logs 'agent_stdout.log'
$errLog=Join-Path $logs 'agent_stderr.log'

New-Item -ItemType Directory -Force -Path $logs | Out-Null
if(-not (Test-Path $python)){throw "Python do ambiente local nao encontrado: $python"}
if(-not (Test-Path $pythonw)){$pythonw=$python}
if(-not (Test-Path $agent)){throw "Entrypoint canonico endurecido nao encontrado: $agent"}

function Stop-AgentOn8765 {
  $listeners=Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
  if($listeners){
    $listeners.OwningProcess | Sort-Object -Unique | ForEach-Object {
      Write-Host "Parando agente local incompatível PID $_ na porta 8765..."
      Stop-Process -Id $_ -Force -ErrorAction Stop
    }
    Start-Sleep -Milliseconds 500
  }
}

try{
  $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2
  if($h.ok){
    if(-not $h.agent_version -or -not $h.db){throw 'A porta 8765 respondeu, mas nao se identificou como agente A-MES.'}
    $actual=''
    if($h.package_root){$actual=[IO.Path]::GetFullPath([string]$h.package_root).TrimEnd([char]92)}
    $versionOk=([string]$h.candidate_version -like '0.5.24*' -or [string]$h.candidate_version -like '0.5.25*')
    $buildOk=([string]$h.agent_build -like 'CANONICAL-*')
    $rootOk=($actual -and $actual -ieq $expected)
    if($versionOk -and $buildOk -and $rootOk){
      Write-Host "[OK] Agente canonico ja esta ativo: $($h.candidate_version) / $($h.agent_build) / $actual"
      exit 0
    }
    Write-Host "Agente de outra pasta/build detectado: versao=$($h.candidate_version) build=$($h.agent_build) root=$actual"
    Stop-AgentOn8765
  }
}catch{
  if($_.Exception.Message -like 'A porta 8765 respondeu, mas*'){throw}
  # Sem agente valido respondendo. Se houver listener residual, nao mate cegamente:
  # o start abaixo falhara e os logs/diagnostico mostrarao a ocupacao.
}

Set-Content -Path $outLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Set-Content -Path $errLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Start-Process -FilePath $pythonw -ArgumentList @($agent) -WorkingDirectory (Split-Path $agent -Parent) -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 500
  try{
    $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 1
    $actual='';if($h.package_root){$actual=[IO.Path]::GetFullPath([string]$h.package_root).TrimEnd([char]92)}
    if($h.ok -and [string]$h.agent_build -like 'CANONICAL-*' -and $actual -ieq $expected){
      Write-Host "[OK] Agente ativo: $($h.candidate_version) / $($h.agent_build) / $actual"
      exit 0
    }
  }catch{}
}
throw "Agente iniciou, mas a API 8765 nao respondeu com o entrypoint/pasta canonicos. Consulte $errLog"