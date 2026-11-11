@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central A-MES - Troca segura com backup e retorno
call "%~dp001_TROCAR_PARA_PR69_NOVA.bat"
exit /b %errorlevel%
