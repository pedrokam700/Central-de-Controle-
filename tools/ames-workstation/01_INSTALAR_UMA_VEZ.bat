@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Central A-MES - CLEAN Integrada - Instalacao unica
color 0F

set "AUTO_MODE=0"
if /I "%~1"=="/auto" set "AUTO_MODE=1"

echo ============================================================
echo   CENTRAL + A-MES CLEAN INTEGRADA - INSTALACAO UNICA
echo ============================================================
echo.
echo Esta instalacao prepara SOMENTE esta pasta nova.
echo Nao altera a CLEAN V3 e nao migra banco automaticamente.
echo O Google Chrome instalado no PC sera usado via CDP.
echo.

rem /auto is used ONLY after START_LOCAL_CANDIDATE has checked the network,
rem or by the offline GitHub Windows installer test. A human opening the
rem installer directly must not mistake a local-only install for MES readiness.
if "%AUTO_MODE%"=="0" (
  echo [REDE] Confirmando TAXXX_5G e rota persistente A-MES antes da instalacao...
  if not exist "%~dp008_PREPARAR_REDE_AMES.bat" goto :network_error
  call "%~dp008_PREPARAR_REDE_AMES.bat" /auto
  if errorlevel 1 goto :network_error
)

set "PYEXE="
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined PYEXE (
  where py >nul 2>nul && for /f "delims=" %%P in ('py -3.12 -c "import sys; print(sys.executable)" 2^>nul') do set "PYEXE=%%P"
)
if not defined PYEXE (
  where python >nul 2>nul && for /f "delims=" %%P in ('python -c "import sys; print(sys.executable if sys.version_info[:2]==(3,12) else '')" 2^>nul') do if not "%%P"=="" set "PYEXE=%%P"
)

if not defined PYEXE (
  if exist "vendor\python\python-3.12.10-amd64.exe" (
    echo [1/7] Python 3.12 nao encontrado. Instalando pacote offline incluido...
    start /wait "" "vendor\python\python-3.12.10-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0 Include_pip=1 SimpleInstall=1
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
  ) else (
    echo [1/7] Python 3.12 nao encontrado. Tentando baixar o instalador oficial...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile '%TEMP%\python-3.12.10-amd64.exe'; exit 0 } catch { exit 1 }"
    if errorlevel 1 goto :python_error
    start /wait "" "%TEMP%\python-3.12.10-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0 Include_pip=1 SimpleInstall=1
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
  )
) else (
  echo [1/7] Python encontrado: !PYEXE!
)
if not defined PYEXE goto :python_error
"%PYEXE%" --version || goto :python_error

if not exist ".venv\Scripts\python.exe" (
  echo [2/7] Criando ambiente Python isolado nesta pasta...
  "%PYEXE%" -m venv .venv || goto :venv_error
) else (
  echo [2/7] Ambiente isolado desta pasta ja existe.
)
set "VPY=%~dp0.venv\Scripts\python.exe"

echo [3/7] Instalando/verificando dependencias...
if exist "vendor\wheels\*.whl" (
  "%VPY%" -m pip install --disable-pip-version-check --no-index --find-links "vendor\wheels" -r "ames-agent\requirements.txt" || goto :dep_error
) else (
  "%VPY%" -m pip install --disable-pip-version-check -r "ames-agent\requirements.txt" || goto :dep_error
)

echo [4/7] Criando configuracao e SQLite LOCAIS desta CLEAN...
if not exist "ames-agent\config.example.json" goto :config_error
if not exist "ames-agent\config.json" copy /Y "ames-agent\config.example.json" "ames-agent\config.json" >nul
if not exist "ames-agent\data" mkdir "ames-agent\data" >nul 2>nul
"%VPY%" -c "from pathlib import Path; import sys; agent=Path.cwd()/'ames-agent'; sys.path.insert(0,str(agent)); import store; s=store.Store(agent/'data'/'ames_local.sqlite3'); s.initialize(); print('[OK] SQLite local inicializado / migrado nesta pasta')" || goto :db_error

echo [5/7] Verificando Google Chrome...
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  if exist "vendor\chrome\GoogleChromeStandaloneEnterprise64.msi" (
    echo       Chrome nao encontrado. Instalando pacote offline incluido...
    start /wait msiexec /i "vendor\chrome\GoogleChromeStandaloneEnterprise64.msi" /qn /norestart
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
  )
)
if not exist "%CHROME%" (
  echo       Chrome ainda nao encontrado. Tentando instalador oficial...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/chrome/install/latest/chrome_installer.exe' -OutFile '%TEMP%\chrome_installer.exe'; exit 0 } catch { exit 1 }"
  if not errorlevel 1 start /wait "" "%TEMP%\chrome_installer.exe" /silent /install
  set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
  if not exist "!CHROME!" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  if not exist "!CHROME!" set "CHROME=!LocalAppData!\Google\Chrome\Application\chrome.exe"
)
if not exist "%CHROME%" goto :chrome_error
echo       [OK] Chrome: %CHROME%

echo [6/7] Autoteste de dependencias...
"%VPY%" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from zoneinfo import ZoneInfo; ZoneInfo('America/Sao_Paulo'); print('[OK] Dependencias Python')" || goto :dep_error

echo [7/7] Teste real do agente local em porta isolada...
"%VPY%" "ames-agent\selftest_runtime.py" || goto :agent_error
> ".venv\.central_ames_clean_integrated.ok" echo dependencies=ok

echo.
echo ============================================================
echo [OK] CLEAN INTEGRADA PRONTA NESTA PASTA
echo ============================================================
echo Use 00_INICIAR_AQUI.bat para iniciar o posto.
echo A CLEAN V3 nao foi alterada.
echo.
if "%AUTO_MODE%"=="0" pause
exit /b 0

:python_error
echo [ERRO] Nao foi possivel localizar/instalar Python 3.12.
goto :fail
:venv_error
echo [ERRO] Nao foi possivel criar o ambiente .venv nesta pasta.
goto :fail
:dep_error
echo [ERRO] Falha ao instalar/verificar dependencias Python.
goto :fail
:config_error
echo [ERRO] config.example.json nao existe no pacote. Pacote invalido.
goto :fail
:db_error
echo [ERRO] Falha ao inicializar o SQLite local desta pasta.
goto :fail
:chrome_error
echo [ERRO] Google Chrome nao foi localizado/instalado.
goto :fail
:agent_error
echo [ERRO] O agente nao passou no selftest local.
goto :fail
:network_error
echo [ERRO] Rede A-MES ainda nao validada. Conecte TAXXX_5G e repita.
goto :fail
:fail
if "%AUTO_MODE%"=="0" pause
exit /b 1
