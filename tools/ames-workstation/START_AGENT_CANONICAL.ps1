param(
  [Parameter(Mandatory=$true)][string]$Root
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path $Root).Path
$pythonw=Join-Path $root '.venv\Scripts\pythonw.exe'
$python=Join-Path $root '.venv\Scripts\python.exe'
$agent=Join-Path $root 'ames-agent\agent.py'
$logs=Join-Path $root 'logs'
$outLog=Join-Path $logs 'agent_stdout.log'
$errLog=Join-Path $logs 'agent_stderr.log'

New-Item -ItemType Directory -Force -Path $logs | Out-Null
if(-not (Test-Path $python)){throw "Python do ambiente local nao encontrado: $python"}
if(-not (Test-Path $pythonw)){$pythonw=$python}
if(-not (Test-Path $agent)){throw "Agente canonico nao encontrado: $agent"}

try{
  $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2
  if($h.ok){
    if([string]$h.candidate_version -notlike '0.5.24*' -and [string]$h.candidate_version -notlike '0.5.25*'){
      throw "A porta 8765 ja esta ocupada por outro agente (candidate_version=$($h.candidate_version)). Pare a versao antiga antes de continuar."
    }
    Write-Host "[OK] Agente canonico ja esta ativo: $($h.candidate_version)"
    exit 0
  }
}catch{
  if($_.Exception.Message -like 'A porta 8765 ja esta ocupada*'){throw}
}

Set-Content -Path $outLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Set-Content -Path $errLog -Value ("=== START " + (Get-Date -Format s) + " ===") -Encoding UTF8
Start-Process -FilePath $pythonw -ArgumentList @($agent) -WorkingDirectory (Split-Path $agent -Parent) -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 500
  try{
    $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 1
    if($h.ok){Write-Host "[OK] Agente ativo: $($h.candidate_version)";exit 0}
  }catch{}
}
throw "Agente iniciou, mas a API 8765 nao respondeu. Consulte $errLog"
