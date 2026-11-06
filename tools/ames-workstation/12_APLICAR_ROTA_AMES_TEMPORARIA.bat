@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo === REDE A-MES: ROTA TEMPORARIA /32 ===
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network\ensure_ames_route.ps1" -Temporary
if errorlevel 1 (
  echo [BLOQUEADO] Wi-Fi corporativo sem validacao. Nenhuma coleta iniciada.
  pause
  exit /b 2
)
echo [OK] Rota para o host A-MES verificada. Modo temporario nao cria persistencia.
pause
exit /b 0
