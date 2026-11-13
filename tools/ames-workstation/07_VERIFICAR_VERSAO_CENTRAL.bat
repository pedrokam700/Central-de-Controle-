@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFICAR_VERSAO_CENTRAL.ps1" -Root "%~dp0"
if errorlevel 1 (
  echo [BLOQUEADO] A Central exibida na porta 8765 nao foi comprovada como esta candidata.
  echo Nao reinstale, nao apague caches, nao repita coletas. Preserve o posto para diagnostico.
)
pause
