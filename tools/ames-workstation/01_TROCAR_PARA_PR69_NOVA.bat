@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title A-MES - Troca supervisionada
set "SWITCH_ARGS="
set "SWITCH_PAUSE=1"
if not "%~2"=="" exit /b 64
if /I "%~1"=="/lab" (
  set "SWITCH_ARGS=-Laboratory -LocalOnly -NoBrowser"
  set "SWITCH_PAUSE=0"
) else if /I "%~1"=="/local" (
  set "SWITCH_ARGS=-LocalOnly"
) else if not "%~1"=="" (
  echo [BLOQUEADO] Argumento desconhecido. Nenhuma troca executada.
  exit /b 64
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TROCAR_PARA_PR69_NOVA.ps1" %SWITCH_ARGS%
set "SWITCH_RESULT=%errorlevel%"
if not "%SWITCH_RESULT%"=="0" (
  echo.
  echo [BLOQUEADO] Troca nao confirmada. Preserve as duas pastas e os dados novos.
) else (
  echo.
  echo [OK] Troca local concluida. Homologacao fisica permanece pendente.
)
if "%SWITCH_PAUSE%"=="1" pause
exit /b %SWITCH_RESULT%
