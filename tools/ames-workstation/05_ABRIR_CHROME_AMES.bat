@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo [ERRO] Google Chrome nao encontrado.
  exit /b 1
)
set "PROFILE=%LocalAppData%\CentralAMES\ChromeProfile"
if not exist "%PROFILE%" mkdir "%PROFILE%" >nul 2>nul
powershell -NoProfile -Command "try{Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 1|Out-Null;exit 0}catch{exit 1}" >nul 2>nul
if errorlevel 1 (
  start "Chrome A-MES" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-background-mode "http://172.29.185.215/asymes"
  set "READY=0"
  for /L %%I in (1,1,15) do (
    powershell -NoProfile -Command "try{Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 1|Out-Null;exit 0}catch{exit 1}" >nul 2>nul
    if not errorlevel 1 (set "READY=1"&goto :done)
    timeout /t 1 /nobreak >nul
  )
  :done
  if not "%READY%"=="1" (
    echo [ERRO] Chrome abriu, mas CDP 9222 nao respondeu.
    exit /b 2
  )
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://172.29.185.215/asymes';try{Invoke-WebRequest -Method Put -UseBasicParsing ('http://127.0.0.1:9222/json/new?'+[uri]::EscapeDataString($u)) -TimeoutSec 2|Out-Null}catch{}" >nul 2>nul
)
exit /b 0
