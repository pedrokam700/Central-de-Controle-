@echo off
setlocal EnableExtensions
title Central AT - instalacao offline
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_CENTRAL_AT.ps1"
if errorlevel 1 (
  echo.
  echo [AT] Instalacao NAO concluida. Confira a mensagem acima.
  pause
  exit /b 1
)
echo [OK] Instalacao AT validada. Abra 02_ABRIR_AT.bat para usar.
pause
