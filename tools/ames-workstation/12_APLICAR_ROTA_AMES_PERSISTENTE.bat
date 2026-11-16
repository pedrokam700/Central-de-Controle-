@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo === REDE A-MES: ROTA PERSISTENTE /32 ===
call "%~dp008_PREPARAR_REDE_AMES.bat"
exit /b %errorlevel%
