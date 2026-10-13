$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
Set-Location $Root
$Python=Join-Path $Root '.venv\Scripts\python.exe'
try {
  if(!(Test-Path $Python)){& "$Root\01_INSTALAR_UMA_VEZ.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Instalacao Python falhou'}}
  & $Python -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright; from zoneinfo import ZoneInfo; ZoneInfo('America/Sao_Paulo')"
  if($LASTEXITCODE -ne 0){& "$Root\09_REPARAR_DEPENDENCIAS.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Reparo de dependencias falhou'}}
  # SQLite/API first: assistance remains available even if MES/WLAN is down.
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\suporte\ames-workstation\START_AGENT_CANONICAL.ps1" -Root $Root
  if($LASTEXITCODE -ne 0){throw 'Agente canonico nao iniciou. Consulte logs.'}
  # The guardian owns conservative Wi-Fi and /32 recovery. No default gateway changes.
  & "$Root\05_ABRIR_CHROME_AMES.bat"
  if($LASTEXITCODE -ne 0){Write-Warning 'Chrome/CDP pendente. Consulta local permanece disponivel.'}
  $token=(Get-Content -LiteralPath "$Root\ames-agent\data\local_agent_token" -Raw).Trim()
  Start-Process "http://127.0.0.1:8765/Central-de-Controle-/#ames_agent_token=$token"
  Write-Host '[OK] Central + A-MES local. Login A-MES continua manual. Gate fisico pendente.'
}catch{Write-Host ('[ERRO] '+$_.Exception.Message) -ForegroundColor Red;Read-Host 'Enter para fechar';exit 1}
