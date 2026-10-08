@echo off
setlocal EnableExtensions
title Central A-MES - Remover rota temporaria V0.5.3

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Removendo somente a rota temporaria 172.29.185.215/32...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Get-NetRoute -DestinationPrefix '172.29.185.215/32' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue;" ^
"Write-Host 'Concluido.'"
echo.
pause
