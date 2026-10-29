@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "%~dp0network\ensure_ames_route.ps1" (
  echo [ERRO] Pacote incompleto: network\ensure_ames_route.ps1
  exit /b 3
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network\ensure_ames_route.ps1"
if errorlevel 1 (
  echo [BLOQUEADO] Conecte TAXXX_5G e confirme rota A-MES antes da coleta.
  exit /b 2
)
exit /b 0
