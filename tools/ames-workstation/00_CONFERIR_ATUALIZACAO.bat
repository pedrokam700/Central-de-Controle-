@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central A-MES - Conferencia assistida somente leitura
if not "%~1"=="" exit /b 64
call "%~dp001_TROCAR.bat" /identificar
exit /b %errorlevel%
