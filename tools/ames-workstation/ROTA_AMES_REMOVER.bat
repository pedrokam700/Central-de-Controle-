@echo off
setlocal EnableExtensions
title Central V2 - Remover rota A-MES
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetRoute -DestinationPrefix '172.29.185.215/32' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue; Write-Host '[OK] Rota temporaria removida.'"
exit /b %errorlevel%
