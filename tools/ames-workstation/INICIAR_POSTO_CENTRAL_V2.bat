@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Quando empacotado este arquivo fica na raiz do candidato.
set "ROOT=%~dp0"
if exist "%ROOT%..\..\ames-agent\agent.py" set "ROOT=%ROOT%..\..\"
for %%I in ("%ROOT%.") do set "ROOT=%%~fI\"

set "CENTRAL=https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app/Central-de-Controle-/"
if /I "%~1"=="/prod" set "CENTRAL=https://central-cora-v2.vercel.app/Central-de-Controle-/"

echo ============================================================
echo   CENTRAL V2 + A-MES - INICIAR POSTO
echo ============================================================
echo Arquitetura: Central web ^+ um agente local ^+ um Chrome/CDP.
echo Nenhuma senha A-MES/Wi-Fi e armazenada por este launcher.
echo.

if not exist "%ROOT%.venv\Scripts\python.exe" (
  if exist "%ROOT%01_INSTALAR_UMA_VEZ.bat" (
    echo [1/7] Primeiro uso: instalando ambiente local uma unica vez...
    call "%ROOT%01_INSTALAR_UMA_VEZ.bat" /auto
    if errorlevel 1 goto :fail
  ) else (
    echo [ERRO] .venv ausente e instalador 01_INSTALAR_UMA_VEZ.bat nao encontrado.
    goto :fail
  )
) else (
  echo [1/7] Ambiente local encontrado.
)

rem R11 provou que python.exe existente nao significa ambiente completo. Uma
rem instalacao interrompida pode deixar o .venv sem Playwright/openpyxl/etc.
echo [2/7] Validando dependencias criticas do motor...
call :depscheck
if errorlevel 1 (
  if exist "%ROOT%09_REPARAR_DEPENDENCIAS.bat" (
    echo       Ambiente incompleto detectado. Reparando automaticamente...
    call "%ROOT%09_REPARAR_DEPENDENCIAS.bat" /auto
    if errorlevel 1 goto :fail
    call :depscheck
    if errorlevel 1 goto :fail
  ) else (
    echo [ERRO] Dependencias incompletas e 09_REPARAR_DEPENDENCIAS.bat ausente.
    goto :fail
  )
) else (
  echo       pandas/openpyxl/playwright/pyautogui/pyperclip: OK
)

if not exist "%ROOT%ames-agent\config.json" if exist "%ROOT%ames-agent\config.example.json" copy /Y "%ROOT%ames-agent\config.example.json" "%ROOT%ames-agent\config.json" >nul

echo [3/7] Verificando acesso A-MES...
call :probe
if errorlevel 1 (
  netsh wlan show profiles 2>nul | findstr /I /C:"TAXXX_5G" >nul 2>nul
  if not errorlevel 1 (
    echo       Tentando reconectar o perfil TAXXX_5G ja salvo no Windows...
    netsh wlan connect name="TAXXX_5G" >nul 2>nul
    timeout /t 5 /nobreak >nul
    call :probe
  )
)
if errorlevel 1 (
  if exist "%ROOT%suporte\ames-workstation\ROTA_AMES_APLICAR.bat" (
    call "%ROOT%suporte\ames-workstation\ROTA_AMES_APLICAR.bat"
  ) else if exist "%ROOT%12_APLICAR_ROTA_AMES_TEMPORARIA.bat" (
    call "%ROOT%12_APLICAR_ROTA_AMES_TEMPORARIA.bat"
  ) else (
    echo [ERRO] A-MES indisponivel e ferramenta de rota ausente.
    goto :fail
  )
  call :probe
  if errorlevel 1 (
    echo [ERRO] A rota foi preparada, mas 172.29.185.215:80 continua inacessivel.
    goto :fail
  )
)

echo [4/7] Iniciando/verificando agente canonico...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%suporte\ames-workstation\START_AGENT_CANONICAL.ps1" -Root "%ROOT%"
if errorlevel 1 goto :fail

echo [5/7] Abrindo Chrome dedicado A-MES pelo mesmo agente...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/chrome/start' -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 12;if(-not $r.ok){exit 1};exit 0}catch{Write-Host $_.Exception.Message;exit 1}"
if errorlevel 1 goto :fail

echo [6/7] Preflight local...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 3;Write-Host ('Agente: '+$h.candidate_version+' / Build='+$h.agent_build+' / A-MES='+$h.ames_reachable+' / CDP='+$h.chrome_cdp_reachable+' / 3022='+$h.auto_3022_ready);if(-not $h.ok){exit 1}}catch{Write-Host $_.Exception.Message;exit 1}"
if errorlevel 1 goto :fail

echo [7/7] Abrindo a UNICA Central...
start "" "%CENTRAL%"
echo.
echo [OK] Posto iniciado.
echo - Central: %CENTRAL%
echo - Agente local: http://127.0.0.1:8765
echo - Chrome A-MES: perfil dedicado / CDP 9222
echo - O login do A-MES continua manual.
echo - Se a internet externa cair depois do primeiro carregamento/cache valido,
echo   a coleta local continua; a Central usa cache e o Firebase sincroniza ao voltar.
exit /b 0

:depscheck
"%ROOT%.venv\Scripts\python.exe" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright" >nul 2>nul
exit /b %errorlevel%

:probe
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=New-Object Net.Sockets.TcpClient;try{$a=$c.BeginConnect('172.29.185.215',80,$null,$null);if(-not $a.AsyncWaitHandle.WaitOne(2500,$false)){exit 1};$c.EndConnect($a);exit 0}catch{exit 1}finally{$c.Close()}" >nul 2>nul
exit /b %errorlevel%

:fail
echo.
echo [ERRO] O posto NAO ficou pronto. Nao inicie coleta ate corrigir a etapa acima.
if exist "%ROOT%suporte\ames-workstation\DIAGNOSTICO_POSTO.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%suporte\ames-workstation\DIAGNOSTICO_POSTO.ps1" -Root "%ROOT%"
pause
exit /b 1
