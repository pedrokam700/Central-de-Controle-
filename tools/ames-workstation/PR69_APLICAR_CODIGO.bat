@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo BLOQUEADO: execute este arquivo dentro da instalacao PR69 atual, com .venv pronta.
  pause
  exit /b 2
)
".venv\Scripts\python.exe" "_PR69_PATCH\pr69_apply_code.py"
if errorlevel 1 (
  echo CORRECAO NAO APLICADA. Confira a mensagem acima.
  pause
  exit /b 2
)
echo Arquivos de codigo atualizados. Banco, token e configuracoes mantidos.
pause
