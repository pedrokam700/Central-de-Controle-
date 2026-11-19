@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title A-MES - Troca supervisionada
set "SWITCH_ARGS="
set "SWITCH_PAUSE=1"
if not "%~2"=="" exit /b 64
if /I "%~1"=="/identificar" goto IDENTIFY_READ_ONLY
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

:IDENTIFY_READ_ONLY
echo Conferencia somente leitura. Nenhuma troca, rede ou agente sera iniciado.
rem This command reads policy metadata only; NEVER loads or interprets a PS1.
powershell.exe -NoProfile -NonInteractive -Command "$p=Get-ExecutionPolicy; if($p -eq 'Restricted'){exit 77}; exit 0"
if errorlevel 1 goto IDENTIFY_TI_STOP
powershell.exe -NoProfile -NonInteractive -File "%~dp0TROCAR_PARA_PR69_NOVA.ps1" -IdentifyOnly
set "IDENTIFY_RESULT=%errorlevel%"
if "%IDENTIFY_RESULT%"=="0" (
  echo Raiz ativa observada. Isto NAO autoriza atualizar; dados e pendencias nao foram abertos.
) else (
  echo STOP: instalacao nao comprovada ou execucao nao autorizada. Preserve todas as pastas.
  echo Se houver PSSecurityException, assinatura, AppLocker ou WDAC: encaminhar a TI.
)
pause
exit /b %IDENTIFY_RESULT%

:IDENTIFY_TI_STOP
echo STOP_TI_EXECUTION_POLICY
 echo A TI deve avaliar a politica efetiva e autorizar o preflight pelos controles corporativos.
echo Nenhuma politica foi alterada. Nao iniciar a troca nem tentar contornar o bloqueio.
pause
exit /b 77
