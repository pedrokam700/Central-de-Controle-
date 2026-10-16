@echo off
setlocal EnableExtensions
title Central V2 - Remover rota A-MES
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath '%~f0' -ArgumentList '/elevated' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  exit /b %errorlevel%
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target='172.29.185.215/32';foreach($store in @('ActiveStore','PersistentStore')){Get-NetRoute -DestinationPrefix $target -PolicyStore $store -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue};Write-Host '[OK] Rota A-MES removida dos stores ativo e persistente.'"
exit /b %errorlevel%
