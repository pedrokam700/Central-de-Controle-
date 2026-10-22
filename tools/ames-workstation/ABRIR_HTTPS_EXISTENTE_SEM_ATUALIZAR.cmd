@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo CENTRAL + A-MES - Pareamento temporario somente leitura
echo Nao modifica SQLite, config, token ou agente.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ABRIR_HTTPS_EXISTENTE_SEM_ATUALIZAR.ps1"
echo.
echo Finalizado. Verifique a Central HTTPS aberta no Microsoft Edge.
pause
