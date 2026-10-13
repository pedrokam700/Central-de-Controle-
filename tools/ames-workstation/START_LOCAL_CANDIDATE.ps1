$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
Set-Location $Root
$Python=Join-Path $Root '.venv\Scripts\python.exe'
try {
  if(!(Test-Path $Python)){& "$Root\01_INSTALAR_UMA_VEZ.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Instalacao Python falhou'}}
  & $Python -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright"
  if($LASTEXITCODE -ne 0){& "$Root\09_REPARAR_DEPENDENCIAS.bat" /auto;if($LASTEXITCODE -ne 0){throw 'Reparo de dependencias falhou'}}
  # A-MES connectivity is optional for reading the local SQLite and history.
  $oppo=@(Get-NetIPConfiguration | Where-Object {$_.IPv4Address.IPAddress -like '172.29.*' -and $_.IPv4DefaultGateway.NextHop -like '172.29.*'})
  if($oppo.Count -gt 0){
    $route=Join-Path $Root 'network\ensure_ames_route.ps1'
    $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){& powershell -NoProfile -ExecutionPolicy Bypass -File $route}
    else {$p=Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$route`"" -Verb RunAs -Wait -PassThru;if($p.ExitCode -ne 0){Write-Warning 'Rota MES pendente. Consulta local permanece disponivel.'}}
  }else{Write-Warning 'Wi-Fi A-MES ausente. Abrindo dados locais.'}
  & "$Root\05_ABRIR_CHROME_AMES.bat"
  if($LASTEXITCODE -ne 0){Write-Warning 'Chrome/CDP pendente. Consulta local permanece disponivel.'}
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\suporte\ames-workstation\START_AGENT_CANONICAL.ps1" -Root $Root
  if($LASTEXITCODE -ne 0){throw 'Agente canonico nao iniciou. Consulte logs.'}
  $token=(Get-Content -LiteralPath "$Root\ames-agent\data\local_agent_token" -Raw).Trim()
  Start-Process "http://127.0.0.1:8765/Central-de-Controle-/#ames_agent_token=$token"
  Write-Host '[OK] Central + A-MES local. Login A-MES continua manual. Gate fisico pendente.'
}catch{Write-Host ('[ERRO] '+$_.Exception.Message) -ForegroundColor Red;Read-Host 'Enter para fechar';exit 1}
