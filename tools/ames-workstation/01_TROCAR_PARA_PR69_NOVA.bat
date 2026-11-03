@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title A-MES PR69 - Troca supervisionada
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TROCAR_PARA_PR69_NOVA.ps1"
if errorlevel 1 (
  echo.
  echo [BLOQUEADO] Troca nao confirmada. NAO inicie dois agentes.
  echo Envie print do motivo e preserve as duas pastas.
) else (
  echo.
  echo [OK] Troca concluida; mantenha a pasta anterior para rollback.
)
pause
