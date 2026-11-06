@echo off
setlocal EnableExtensions
title Central AT - Consulta por SN
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ProgramFiles%\CentralAT\INICIAR_CENTRAL_AT.ps1"
if errorlevel 1 (
  echo [AT] A Central AT nao iniciou. Veja a mensagem acima.
  pause
  exit /b 1
)
