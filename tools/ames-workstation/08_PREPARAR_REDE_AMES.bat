@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "AUTO_MODE=0"
if /I "%~1"=="/auto" set "AUTO_MODE=1"
if not exist "%~dp0network\ensure_ames_route.ps1" (
  echo [ERRO] Pacote incompleto: network\ensure_ames_route.ps1
  if "%AUTO_MODE%"=="0" pause
  exit /b 3
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network\ensure_ames_route.ps1"
if errorlevel 1 (
  echo [BLOQUEADO] Conecte TAXXX_5G e confirme rota A-MES antes da coleta.
  if "%AUTO_MODE%"=="0" pause
  exit /b 2
)
echo [OK] Rede A-MES validada. Rota /32 persistente preservada.
if "%AUTO_MODE%"=="0" pause
exit /b 0
