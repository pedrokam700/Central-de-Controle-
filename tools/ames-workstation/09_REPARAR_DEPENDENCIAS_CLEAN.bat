@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central A-MES - Reparar dependencias R11
color 0F

set "AUTO_MODE=0"
if /I "%~1"=="/auto" set "AUTO_MODE=1"

if not exist ".venv\Scripts\python.exe" (
  echo [ERRO] Ambiente .venv ausente. Execute 01_INSTALAR_UMA_VEZ.bat.
  if "%AUTO_MODE%"=="0" pause
  exit /b 20
)
set "VPY=%~dp0.venv\Scripts\python.exe"

echo ============================================================
echo   CENTRAL A-MES 3022 R11 - REPARO DE DEPENDENCIAS
echo ============================================================
echo.
echo A coleta 3028/3074/2114/3022 usa o pacote Python Playwright
echo para controlar o Google Chrome ja instalado via CDP 9222.
echo Este reparo NAO instala Chromium do Playwright.
echo.

echo [1/3] Verificando pip...
"%VPY%" -m ensurepip --upgrade >nul 2>nul
"%VPY%" -m pip --version || goto :fail

echo [2/3] Instalando/reparando requirements do agente...
if exist "vendor\wheels\*.whl" (
  "%VPY%" -m pip install --no-index --find-links "vendor\wheels" -r "ames-agent\requirements.txt" || goto :fail
) else (
  echo       Wheels offline nao incluidos. Usando internet/Ethernet para reparar o ambiente.
  "%VPY%" -m pip install -r "ames-agent\requirements.txt" || goto :fail
)

echo [3/3] Validando dependencias criticas...
"%VPY%" -c "import pandas,openpyxl,playwright,pyautogui,pyperclip; from playwright.sync_api import sync_playwright; print('[OK] pandas/openpyxl/playwright/pyautogui/pyperclip prontos')" || goto :fail
> ".venv\.central_ames_dependencies_r11.ok" echo dependencies=ok

echo.
echo [OK] Dependencias reparadas. Pode iniciar a Central normalmente.
if "%AUTO_MODE%"=="0" pause
exit /b 0

:fail
echo.
echo [ERRO] Nao foi possivel reparar as dependencias Python.
echo Verifique a Ethernet/internet normal e tente novamente.
echo O Wi-Fi A-MES pode permanecer conectado em paralelo; nenhuma senha e alterada.
if "%AUTO_MODE%"=="0" pause
exit /b 21
