@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
if exist "%ROOT%..\..\.venv\Scripts\python.exe" set "ROOT=%ROOT%..\..\"
for %%I in ("%ROOT%.") do set "ROOT=%%~fI\"
set "PY=%ROOT%.venv\Scripts\python.exe"

if not exist "%PY%" (
  echo [ERRO] Ambiente .venv nao encontrado em %ROOT%.venv
  exit /b 2
)

echo ============================================================
echo   CENTRAL A-MES - REPARO DE DEPENDENCIAS
echo ============================================================
echo Este reparo corrige o caso em que o .venv existe, mas esta incompleto.
echo Nenhum dado, SQLite, configuracao ou sessao A-MES sera apagado.
echo.

"%PY%" -m ensurepip --upgrade >nul 2>nul
echo [1/3] Atualizando instalador Python...
"%PY%" -m pip install --disable-pip-version-check --upgrade pip
if errorlevel 1 goto :fail

echo [2/3] Instalando/verificando dependencias criticas...
"%PY%" -m pip install --disable-pip-version-check "pandas>=2.2" "openpyxl>=3.1" "playwright>=1.55" "pyautogui>=0.9.54" "pyperclip>=1.9"
if errorlevel 1 goto :fail

echo [3/3] Validando imports usados pelo agente...
"%PY%" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright; print('DEPENDENCIAS_OK')"
if errorlevel 1 goto :fail

echo [OK] Ambiente Python reparado e validado.
exit /b 0

:fail
echo.
echo [ERRO] Nao foi possivel reparar as dependencias.
echo Mantenha a internet normal conectada e tente novamente.
exit /b 1
