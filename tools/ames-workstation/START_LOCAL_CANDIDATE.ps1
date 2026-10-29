$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
Set-Location $Root
$Python=Join-Path $Root '.venv\Scripts\python.exe'
$Diagnostic=Join-Path $Root 'suporte\ames-workstation\DIAGNOSTICO_POSTO.ps1'

function Invoke-StartupDiagnostic {
  if(-not (Test-Path -LiteralPath $Diagnostic)){return}
  try{
    Write-Host ''
    Write-Host '=== DIAGNOSTICO AUTOMATICO DO STARTUP ===' -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Diagnostic -Root $Root
  }catch{
    Write-Host ('[WARN] Diagnostico automatico tambem falhou: '+$_.Exception.Message) -ForegroundColor Yellow
  }
}

try {
  # Candidate launches never take over an already serving agent. The canonical
  # bootstrap may terminate a *known* older agent, but an older independent
  # guardian could restart it. Only the supervised migration can retire that
  # guardian; this preliminary check is deliberately fail-closed.
  if(-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)){
    throw 'Windows nao disponibilizou Get-NetTCPConnection; nao e seguro assumir a porta 8765 sem inventario.'
  }
  $listeners=@(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count -gt 0){
    $ownerIds=($listeners|ForEach-Object { [string]$_.OwningProcess }|Sort-Object -Unique) -join ', '
    throw "Porta 8765 ja ocupada pelo(s) PID(s) $ownerIds. NAO iniciar o candidato sobre o agente existente. Inventariar guardian e executar transicao supervisionada primeiro."
  }
  # A virgin workstation must prove its A-MES Wi-Fi/route before starting
  # the agent. The network tool will request UAC only when route repair is needed.
  $NetworkSetup=Join-Path $Root '08_PREPARAR_REDE_AMES.bat'
  if(-not(Test-Path -LiteralPath $NetworkSetup)){throw 'Pacote incompleto: 08_PREPARAR_REDE_AMES.bat'}
  & $NetworkSetup
  if($LASTEXITCODE -ne 0){throw 'Rede A-MES nao validada. Conecte TAXXX_5G ou solicite apoio da TI para a rota persistente.'}
  if(!(Test-Path $Python)){& "$Root\01_INSTALAR_UMA_VEZ.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Instalacao Python falhou'}}
  & $Python -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright; from zoneinfo import ZoneInfo; ZoneInfo('America/Sao_Paulo')"
  if($LASTEXITCODE -ne 0){& "$Root\09_REPARAR_DEPENDENCIAS.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Reparo de dependencias falhou'}}

  # SQLite/API first: assistance remains available even if MES/WLAN is down.
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\suporte\ames-workstation\START_AGENT_CANONICAL.ps1" -Root $Root
  if($LASTEXITCODE -ne 0){throw 'Agente canonico nao iniciou. O diagnostico automatico sera executado.'}

  $tokenPath=Join-Path $Root 'ames-agent\data\local_agent_token'
  if(-not (Test-Path -LiteralPath $tokenPath)){throw 'Token local do agente nao foi criado.'}
  $token=(Get-Content -LiteralPath $tokenPath -Raw).Trim()
  if($token.Length -lt 32){throw 'Token local do agente existe, mas e invalido.'}

  # The guardian owns conservative Wi-Fi and /32 recovery. No default gateway changes.
  & "$Root\05_ABRIR_CHROME_AMES.bat"
  if($LASTEXITCODE -ne 0){Write-Warning 'Chrome/CDP pendente. Consulta local permanece disponivel.'}

  Start-Process "http://127.0.0.1:8765/Central-de-Controle-/#ames_agent_token=$token"
  Write-Host '[OK] Central + A-MES local. Login A-MES continua manual. Gate fisico pendente.'
}catch{
  Write-Host ('[ERRO] '+$_.Exception.Message) -ForegroundColor Red
  Invoke-StartupDiagnostic
  Write-Host ''
  Write-Host 'O posto NAO foi considerado pronto. Nao inicie coleta ate corrigir a causa acima.' -ForegroundColor Red
  Read-Host 'Enter para fechar'
  exit 1
}
