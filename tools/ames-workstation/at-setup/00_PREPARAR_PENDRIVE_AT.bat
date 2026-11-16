@echo off
setlocal EnableExtensions
title Preparar dependencias do pendrive AT - somente PC administrador
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PREPARAR_DEPENDENCIAS_AT.ps1"
if errorlevel 1 (
  echo [AT] Dependencias nao ficaram prontas. Confira a mensagem acima.
  pause
  exit /b 1
)
echo [OK] Volte a Central local - Usuarios AT - Gerar instalador AT offline.
pause
