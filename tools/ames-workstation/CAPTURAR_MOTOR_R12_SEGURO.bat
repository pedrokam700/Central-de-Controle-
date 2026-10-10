@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PACKAGE_ROOT=%~dp0..\..\"
for %%I in ("%PACKAGE_ROOT%.") do set "PACKAGE_ROOT=%%~fI\"
set "PY=%PACKAGE_ROOT%.venv\Scripts\python.exe"
set "SCRIPT=%~dp0capture-r12-engine.py"
if not exist "%PY%" (
  echo [ERRO] Python local nao encontrado: %PY%
  exit /b 1
)
if not exist "%SCRIPT%" (
  echo [ERRO] Ferramenta de captura nao encontrada: %SCRIPT%
  exit /b 1
)
set "R12_ROOT=%~1"
if "%R12_ROOT%"=="" set "R12_ROOT=%PACKAGE_ROOT%"
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "D=%%d%%b%%c"
for /f "tokens=1-3 delims=:,. " %%a in ("%time%") do set "T=%%a%%b%%c"
set "T=%T: =0%"
set "OUT=%PACKAGE_ROOT%R12_ENGINE_CAPTURE_%D%_%T%.zip"
echo Capturando somente codigo/configuracao sanitizada do motor R12...
"%PY%" "%SCRIPT%" "%R12_ROOT%" "%OUT%"
if errorlevel 1 exit /b 1
echo.
echo [OK] Captura criada: %OUT%
echo Envie este ZIP para a fusao do pacote de computador novo.
exit /b 0
