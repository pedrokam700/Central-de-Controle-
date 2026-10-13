@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Central A-MES - Instalacao unica R11
color 0F

set "AUTO_MODE=0"
if /I "%~1"=="/auto" set "AUTO_MODE=1"

echo ============================================================
echo   CENTRAL + A-MES OFFLINE V0.5.23 3022 R11 - INSTALACAO UNICA
echo ============================================================
echo.
echo Este processo prepara um ambiente isolado dentro desta pasta.
echo Nao precisa instalar Playwright Chromium: usamos o Google Chrome do PC.
echo.

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
    echo [1/8] Python nao encontrado. Instalando pacote incluido...
    start /wait "" "vendor\python\python-3.12.10-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0 Include_pip=1 SimpleInstall=1
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
  ) else (
    echo [1/8] Python nao encontrado e o instalador offline nao esta no pacote.
    echo Tentando baixar o Python oficial. Mantenha a internet conectada.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile '%TEMP%\python-3.12.10-amd64.exe'; exit 0 } catch { exit 1 }"
    if errorlevel 1 goto :python_error
    start /wait "" "%TEMP%\python-3.12.10-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0 Include_pip=1 SimpleInstall=1
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
  )
) else (
  echo [1/8] Python encontrado: !PYEXE!
)

if not defined PYEXE goto :python_error
"%PYEXE%" --version || goto :python_error

if not exist ".venv\Scripts\python.exe" (
  echo [2/8] Criando ambiente Python isolado...
  "%PYEXE%" -m venv .venv || goto :venv_error
) else (
  echo [2/8] Ambiente isolado ja existe.
)

set "VPY=%~dp0.venv\Scripts\python.exe"

echo [3/8] Instalando dependencias...
if exist "vendor\wheels\*.whl" (
  "%VPY%" -m pip install --no-index --find-links "vendor\wheels" -r "ames-agent\requirements.txt" || goto :dep_error
) else (
  echo       Wheels offline nao encontrados; usando internet.
  "%VPY%" -m pip install --upgrade pip || goto :dep_error
  "%VPY%" -m pip install -r "ames-agent\requirements.txt" || goto :dep_error
)

echo [4/8] Preparando configuracao e banco local...
if not exist "ames-agent\data\ames_local.sqlite3" (
  if "%AUTO_MODE%"=="1" (
    echo       Banco novo detectado. R11 inicia limpo e nao faz perguntas S/N no primeiro uso.
    echo       Para copiar dados antigos depois, use 11_MIGRAR_DADOS_ANTERIORES.bat.
  ) else (
    echo       Banco novo detectado. Migracao opcional pode ser feita agora.
    call "suporte\MIGRAR_DADOS_DE_VERSAO_ANTERIOR.bat" /installer
  )
)
if not exist "ames-agent\config.json" copy /Y "ames-agent\config.example.json" "ames-agent\config.json" >nul
"%VPY%" -c "from pathlib import Path; import sys; root=Path.cwd(); agent=root/'ames-agent'; sys.path.insert(0,str(agent)); import store; s=store.Store(agent/'data'/'ames_local.sqlite3'); s.initialize(); print('[OK] SQLite local inicializado / migrado')" || goto :db_error

echo [5/8] Verificando Google Chrome...
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  if exist "vendor\chrome\GoogleChromeStandaloneEnterprise64.msi" (
    echo       Chrome nao encontrado. Tentando instalar o pacote offline incluido...
    start /wait msiexec /i "vendor\chrome\GoogleChromeStandaloneEnterprise64.msi" /qn /norestart
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
  )
)
if not exist "%CHROME%" (
  echo       Chrome ainda nao encontrado. Tentando baixar o instalador oficial...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/chrome/install/latest/chrome_installer.exe' -OutFile '%TEMP%\chrome_installer.exe'; exit 0 } catch { exit 1 }"
  if not errorlevel 1 (
    start /wait "" "%TEMP%\chrome_installer.exe" /silent /install
  )
  set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
  if not exist "!CHROME!" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  if not exist "!CHROME!" set "CHROME=!LocalAppData!\Google\Chrome\Application\chrome.exe"
)
if not exist "%CHROME%" (
  echo [ERRO] Google Chrome nao foi localizado nem instalado automaticamente.
  echo Conecte a Ethernet/internet normal e execute novamente, ou coloque o MSI aprovado em vendor\chrome.
if "%AUTO_MODE%"=="0" pause
  exit /b 15
) else (
  echo [OK] Chrome: %CHROME%
)

echo [6/8] Autoteste de dependencias...
"%VPY%" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright; print('[OK] Dependencias Python')" || goto :dep_error
> ".venv\.central_ames_dependencies_r11.ok" echo dependencies=ok

echo [7/8] Teste real do agente local em porta isolada...
"%VPY%" "ames-agent\selftest_runtime.py" || goto :agent_error

echo [8/8] Criando atalho de uso diario...
call "suporte\CRIAR_ATALHO_DESKTOP.bat" /silent >nul 2>nul

echo.
echo ============================================================
echo [OK] PRONTO PARA USO
echo ============================================================
echo Agora use INICIAR_CENTRAL_AMES.cmd ^(recomendado^) ou 00_INICIAR_AQUI.bat
echo.
if "%AUTO_MODE%"=="0" pause
exit /b 0

:python_error
echo [ERRO] Nao foi possivel localizar/instalar Python 3.12.
if "%AUTO_MODE%"=="0" pause
exit /b 10
:venv_error
echo [ERRO] Nao foi possivel criar o ambiente .venv.
if "%AUTO_MODE%"=="0" pause
exit /b 11
:dep_error
echo [ERRO] Falha ao instalar/verificar dependencias.
if "%AUTO_MODE%"=="0" pause
exit /b 12
:db_error
echo [ERRO] Falha ao inicializar o banco local.
if "%AUTO_MODE%"=="0" pause
exit /b 13

:agent_error
echo [ERRO] O agente compilou, mas nao conseguiu iniciar/responder localmente.
if "%AUTO_MODE%"=="0" pause
exit /b 14
