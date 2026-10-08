@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central A-MES - Inicializacao V0.5.5

if not exist ".venv\Scripts\python.exe" (
  echo [ERRO] Ambiente .venv nao encontrado.
  echo Execute 01_INSTALAR_UMA_VEZ.bat primeiro.
  echo.
  pause
  exit /b 1
)

if not exist "ames-agent\config.json" (
  copy /Y "ames-agent\config.example.json" "ames-agent\config.json" >nul
)

if not exist "logs" mkdir "logs" >nul 2>nul

echo [1/4] Abrindo Chrome dedicado A-MES...
call 05_ABRIR_CHROME_AMES.bat
if errorlevel 1 (
  echo [ERRO] Nao foi possivel abrir o Chrome dedicado.
  pause
  exit /b 1
)

echo [2/4] Verificando agente local...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"try { $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 1; if($h.ok){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul

if errorlevel 1 (
  echo Agente nao esta rodando. Iniciando...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ames-agent\start_agent_v055.ps1"
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao iniciar o agente.
    echo Veja os arquivos mais recentes em:
    echo %~dp0logs
    echo.
    pause
    exit /b 1
  )
) else (
  echo Agente ja estava ativo.
)

echo [3/4] Aguardando API local...
set "READY=0"
for /L %%I in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 1; if($h.ok){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :AGENT_READY
  )
  timeout /t 1 /nobreak >nul
)

:AGENT_READY
if not "%READY%"=="1" (
  echo.
  echo [ERRO] O processo foi iniciado, mas a API 8765 nao respondeu em 20 segundos.
  echo.
  echo --- agent_stderr.log ---
  if exist "logs\agent_stderr.log" type "logs\agent_stderr.log"
  echo.
  echo --- agent_stdout.log ---
  if exist "logs\agent_stdout.log" type "logs\agent_stdout.log"
  echo.
  echo Nao continue para a coleta. Envie esta tela ou os logs.
  pause
  exit /b 1
)

echo [4/4] Abrindo Central A-MES...
start "" "http://127.0.0.1:8765/"

echo.
echo [OK] Central A-MES iniciada.
echo - Agente: http://127.0.0.1:8765/api/v1/health
echo - Chrome CDP: http://127.0.0.1:9222/json/version
echo.
exit /b 0
