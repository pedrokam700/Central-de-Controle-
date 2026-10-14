from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
AGENT=ROOT/'ames'/'agent'
WORKSTATION=ROOT/'tools'/'ames-workstation'
FILES=('agent.py','agent_entry.py','agent_hardened_entry.py','hardening.py','local_security.py','operational_calendar.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py','preflight.py','operator_evidence.py','production_shift.py','agent_3012_patch.py','ames_3012_live.py','repair_3012.py','local_sn.py','network_watch.py','performance_indexes.py','fastlane_runtime_guard.py')
PREVIEW_URLS=(
    'https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app',
    'https://deploy-preview-23--productcontrolcenter.netlify.app',
)
ROOT_FILES={
    'INICIAR_POSTO_CENTRAL_V2.bat':WORKSTATION/'INICIAR_POSTO_CENTRAL_V2.bat',
    '00_INICIAR_AQUI.bat':WORKSTATION/'INICIAR_POSTO_CENTRAL_V2.bat',
    'INICIAR_CENTRAL_AMES.cmd':None,
    'suporte/ames-workstation/ROTA_AMES_APLICAR.bat':WORKSTATION/'ROTA_AMES_APLICAR.bat',
    'suporte/ames-workstation/ROTA_AMES_REMOVER.bat':WORKSTATION/'ROTA_AMES_REMOVER.bat',
    'suporte/ames-workstation/START_AGENT_CANONICAL.ps1':WORKSTATION/'START_AGENT_CANONICAL.ps1',
    'suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1':WORKSTATION/'DIAGNOSTICO_POSTO.ps1',
    'suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat':WORKSTATION/'CAPTURAR_MOTOR_R12_SEGURO.bat',
    'suporte/ames-workstation/capture-r12-engine.py':WORKSTATION/'capture-r12-engine.py',
}


def digest(data:bytes)->str:return hashlib.sha256(data).hexdigest()

def _validate_updater_contract():
    source=(AGENT/'update_candidate.py').read_text(encoding='utf-8')
    match=re.search(r"FILES=\((.*?)\)\nROOT_FILES=",source,re.S)
    if not match:raise ValueError('Could not read update_candidate FILES contract')
    updater=set(re.findall(r"'([^']+\.py)'",match.group(1)))
    expected=set(FILES)
    if updater!=expected:
        missing=sorted(updater-expected);extra=sorted(expected-updater)
        raise ValueError(f'Bundle/updater FILES mismatch; missing={missing}; extra={extra}')


def _update_bat()->bytes:
    return r'''@echo off
setlocal EnableExtensions
title Central V2 + A-MES - Atualizar instalacao existente
set "TARGET=%~1"
set "RC=0"

echo ============================================================
echo   CENTRAL V2 + A-MES - ATUALIZAR INSTALACAO EXISTENTE
echo ============================================================
echo Compatibilidade: V0.5.23 LOCAL 3022 R11 e instalacoes R12
echo que mantenham os coletores 3028 congelados.
echo.

if not defined TARGET (
  echo Selecione a pasta da automacao antiga na janela que vai abrir.
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject Shell.Application;$f=$s.BrowseForFolder(0,'Selecione a pasta da automacao existente (R11/R12)',0,0);if($f){$p=$f.Self.Path;if($p){Write-Output $p}}"`) do set "TARGET=%%I"
)
if not defined TARGET goto :cancel

for %%I in ("%TARGET%") do (set "TARGET_FULL=%%~fI"& set "TARGET_NAME=%%~nxI")
if not exist "%TARGET_FULL%" (
  echo [ERRO] A pasta selecionada nao existe:
  echo        %TARGET_FULL%
  set "RC=2"
  goto :fail
)

rem Se o usuario selecionar a pasta externa criada pelo ZIP e houver exatamente
rem uma instalacao valida logo abaixo, entra nela automaticamente.
if not exist "%TARGET_FULL%\ames-agent\agent.py" if /I not "%TARGET_NAME%"=="ames-agent" (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$r=[IO.Path]::GetFullPath($env:TARGET_FULL);$c=@(Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue ^| Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'ames-agent\agent.py')});if($c.Count -eq 1){Write-Output $c[0].FullName}"`) do set "TARGET_FULL=%%I"
  for %%I in ("%TARGET_FULL%") do set "TARGET_NAME=%%~nxI"
)

if /I "%TARGET_NAME%"=="ames-agent" (
  if not exist "%TARGET_FULL%\agent.py" (
    echo [ERRO] A pasta ames-agent selecionada nao contem agent.py.
    set "RC=3"
    goto :fail
  )
) else (
  if not exist "%TARGET_FULL%\ames-agent\agent.py" (
    echo [ERRO] Esta pasta nao parece ser uma instalacao A-MES compativel.
    echo        Selecione a pasta que contem ames-agent.
    set "RC=3"
    goto :fail
  )
)

echo [OK] Instalacao encontrada:
echo      %TARGET_FULL%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue;if($p){exit 9}else{exit 0}" >nul 2>nul
if errorlevel 9 (
  echo [ERRO] O agente antigo ainda esta iniciado na porta 8765.
  echo        Feche a automacao antiga e qualquer janela PowerShell/CMD dela.
  echo        Depois execute este atualizador novamente.
  set "RC=9"
  goto :fail
)

set "CAPTURE_ROOT=%TARGET_FULL%"
if /I "%TARGET_NAME%"=="ames-agent" for %%I in ("%TARGET_FULL%\..") do set "CAPTURE_ROOT=%%~fI"
set "CAPTURE=%CAPTURE_ROOT%\ENGINE_CAPTURE_PREMIGRATION.zip"

where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [ERRO] Python nao foi encontrado no Windows.
    set "RC=10"
    goto :fail
  )
  set "PYRUN=python"
) else (
  set "PYRUN=py -3"
)

if not exist "%CAPTURE%" (
  echo [PRE-MIGRACAO] Capturando o motor original sem dados/sessao...
  %PYRUN% "%~dp0suporte\ames-workstation\capture-r12-engine.py" "%CAPTURE_ROOT%" "%CAPTURE%"
  if errorlevel 1 (
    echo [AVISO] A captura automatica nao foi criada.
    echo         A instalacao ainda nao foi alterada por esta etapa.
    echo         O updater seguira protegido por backup e hashes congelados.
  ) else (
    echo [OK] Captura pre-migracao:
    echo      %CAPTURE%
  )
) else (
  echo [PRE-MIGRACAO] Captura original ja existe e sera preservada:
  echo                %CAPTURE%
)

echo.
echo [ATUALIZACAO] Validando coletores, criando backup e aplicando candidato...
%PYRUN% "%~dp0ames-agent\update_candidate.py" update "%TARGET_FULL%"
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo [ERRO] O atualizador recusou a instalacao ou encontrou um problema.
  echo        Nada deve ser testado ate corrigirmos a mensagem acima.
  goto :fail
)

echo.
echo ============================================================
echo [OK] ATUALIZACAO CONCLUIDA
echo ============================================================
echo Backup/rollback preservado.
echo SQLite operacional preservado.
echo Coletores 3028 foram validados antes da troca.
echo.
echo Agora abra a pasta atualizada e execute:
echo   00_INICIAR_AQUI.bat
echo.
echo Esta janela ficara aberta ate voce confirmar.
pause
exit /b 0

:cancel
echo.
echo [CANCELADO] Nenhuma pasta foi selecionada. Nada foi alterado.
set "RC=2"
goto :fail

:fail
if "%RC%"=="" set "RC=1"
echo.
echo ============================================================
echo [NAO CONCLUIDO] Nenhuma coleta deve ser iniciada ainda.
echo Codigo de saida: %RC%
echo ============================================================
echo Esta janela nao vai fechar sozinha. Tire um print desta tela.
pause
exit /b %RC%
'''.encode('ascii',errors='replace')

def _rollback_bat()->bytes:
    return r'''@echo off
setlocal EnableExtensions
title Central V2 + A-MES - Restaurar instalacao anterior
set "TARGET=%~1"
set "RC=0"

if not defined TARGET (
  echo Selecione a pasta da instalacao migrada.
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject Shell.Application;$f=$s.BrowseForFolder(0,'Selecione a pasta da instalacao migrada',0,0);if($f){$p=$f.Self.Path;if($p){Write-Output $p}}"`) do set "TARGET=%%I"
)
if not defined TARGET (
  echo [CANCELADO] Nada foi alterado.
  pause
  exit /b 2
)

for %%I in ("%TARGET%") do (set "TARGET_FULL=%%~fI"& set "TARGET_NAME=%%~nxI")
set "PACKAGE_ROOT=%TARGET_FULL%"
if /I "%TARGET_NAME%"=="ames-agent" for %%I in ("%TARGET_FULL%\..") do set "PACKAGE_ROOT=%%~fI"

set "BACKUP=%~2"
if "%BACKUP%"=="" for /f "usebackq delims=" %%B in (`powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$p=Join-Path $env:PACKAGE_ROOT 'candidate-backups';if(Test-Path $p){$b=Get-ChildItem $p -Directory ^| Where-Object {Test-Path (Join-Path $_.FullName 'backup.json')} ^| Sort-Object LastWriteTime -Descending ^| Select-Object -First 1 -ExpandProperty FullName;if($b){Write-Output $b}}"`) do set "BACKUP=%%B"
if "%BACKUP%"=="" (
  echo [ERRO] Nenhum backup candidato foi encontrado em:
  echo        %PACKAGE_ROOT%\candidate-backups
  pause
  exit /b 3
)

where py >nul 2>nul
if errorlevel 1 (set "PYRUN=python") else (set "PYRUN=py -3")
echo Restaurando backup:
echo %BACKUP%
%PYRUN% "%~dp0ames-agent\update_candidate.py" rollback "%TARGET_FULL%" --backup "%BACKUP%"
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo [ERRO] Rollback nao concluido. Codigo: %RC%
  pause
  exit /b %RC%
)
echo [OK] Rollback concluido. SQLite operacional foi preservado.
pause
exit /b 0
'''.encode('ascii',errors='replace')

def build(destination:Path,frontend_sha:str):
    destination=destination.resolve();frontend_sha=str(frontend_sha).strip().lower()
    if destination.exists():raise ValueError(f'Destination exists: {destination}')
    if not re.fullmatch(r'[0-9a-f]{40}',frontend_sha):raise ValueError('frontend_sha must be an exact 40-hex commit SHA')
    _validate_updater_contract()
    payload={}
    for name in (*FILES,'update_candidate.py'):
        path=AGENT/name
        if not path.is_file():raise ValueError(f'Missing agent file: {name}')
        payload[f'ames-agent/{name}']=path.read_bytes().replace(b'\r\n',b'\n')
    payload['ames-agent/candidate-files.json']=(json.dumps({name:digest(payload[f'ames-agent/{name}']) for name in FILES},sort_keys=True,indent=2)+'\n').encode()
    for rel,path in ROOT_FILES.items():
        if path is None:
            data=b'@echo off\r\ncall "%~dp0INICIAR_POSTO_CENTRAL_V2.bat" %*\r\n'
        else:
            if not path.is_file():raise ValueError(f'Missing workstation file: {path}')
            data=path.read_bytes()
        payload[rel]=data
    gate={
        'schema':'central-frontend-gate-v1',
        'expected_sha':frontend_sha,
        'preview_urls':list(PREVIEW_URLS),
        'release_build_path':'/release-build.json',
        'central_path':'/Central-de-Controle-/',
        'factory_gate_required':True,
    }
    payload['FRONTEND_GATE.json']=(json.dumps(gate,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    update_bat=_update_bat()
    rollback_bat=_rollback_bat()
    payload['ATUALIZAR_INSTALACAO_EXISTENTE.bat']=update_bat
    payload['ATUALIZAR_R12_EXISTENTE.bat']=b'@echo off\r\ncall "%~dp0ATUALIZAR_INSTALACAO_EXISTENTE.bat" %*\r\nexit /b %errorlevel%\r\n'
    payload['RESTAURAR_INSTALACAO_ANTERIOR.bat']=rollback_bat
    payload['ROLLBACK_R12_EXISTENTE.bat']=b'@echo off\r\ncall "%~dp0RESTAURAR_INSTALACAO_ANTERIOR.bat" %*\r\nexit /b %errorlevel%\r\n'
    manifest={
        'schema':'central-existing-installation-migration-v5',
        'purpose':'update-existing-compatible-r11-r12',
        'supported_existing_baselines':['V0.5.23_LOCAL_3022_R11','R12-compatible-with-frozen-3028-hashes'],
        'frontend_sha':frontend_sha,
        'new_pc_supported':False,
        'factory_gate_required':True,
        'preview_selection':'exact-sha-with-validated-offline-fallback',
        'pre_migration_capture':'best-effort-before-update',
        'rollback':'latest-candidate-backup',
        'installer_ux':'folder-picker-explicit-result-no-auto-close',
        'hardening':'H1-snapshot-lifecycle-migrations-atomic-config-workstation-token-operational-calendar',
        'files':{name:digest(data) for name,data in sorted(payload.items())},
        'notes':['does not contain A-MES credentials/session','does not contain runtime SQLite or workstation token','updater validates frozen 3028 hashes before update','V0.5.23 LOCAL 3022 R11 is accepted only when the frozen 3028 hashes and expected agent structure match','launcher accepts only a preview whose release-build.json matches frontend_sha; after one valid check it may reuse that exact origin/SHA from cache state','update attempts a safe engine capture before modifying the installation','rollback helper restores the newest candidate backup, removes migration-only agent files that did not previously exist and preserves operational SQLite','hardening H1 adds explicit SQLite migrations, hides incomplete snapshots from canonical/latest reads, uses atomic config writes, requires a local workstation token for hosted Central API access and separates production-day boundary from work-shift classification']
    }
    payload['MIGRATION_MANIFEST.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    readme=(
        'CENTRAL V2 + A-MES — ATUALIZACAO DE INSTALACAO EXISTENTE\r\n\r\n'
        'Este bundle NAO e instalador para computador totalmente novo.\r\n'
        'Ele atualiza a V0.5.23 LOCAL 3022 R11 usada no posto ou uma R12 compativel,\r\n'
        'somente depois de validar a estrutura e os hashes congelados dos coletores 3028.\r\n'
        'O updater cria backup do codigo/configuracao/SQLite antes da troca e nao apaga a base.\r\n'
        'O instalador usa seletor de pasta e nao fecha sozinho em sucesso/erro.\r\n'
        f'Frontend esperado neste bundle: {frontend_sha}\r\n'
        '1. Feche agente/monitor antigos.\r\n'
        '2. Execute ATUALIZAR_INSTALACAO_EXISTENTE.bat.\r\n'
        '3. Selecione a pasta da automacao antiga. O wrapper do ZIP com uma unica instalacao valida tambem e aceito.\r\n'
        '4. Aguarde [OK] ATUALIZACAO CONCLUIDA.\r\n'
        '5. Abra a instalacao atualizada e execute 00_INICIAR_AQUI.bat.\r\n'
        '6. Login A-MES permanece manual.\r\n'
        '7. Rode o gate fisico antes de qualquer promocao.\r\n'
        '8. Para desfazer, use RESTAURAR_INSTALACAO_ANTERIOR.bat; o SQLite operacional e preservado.\r\n'
    ).encode('utf-8')
    payload['LEIA_PRIMEIRO.txt']=readme
    payload['LEIA_PRIMEIRO_R12.txt']=readme
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(payload.items()):
            info=zipfile.ZipInfo(name,(2026,10,13,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,data)
    with zipfile.ZipFile(destination) as z:
        if z.testzip() is not None:raise ValueError('Corrupt bundle')
    print(destination)
    print('Frontend SHA:',frontend_sha)
    print('SHA-256:',digest(destination.read_bytes()))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('destination',type=Path);p.add_argument('--frontend-sha',required=True);a=p.parse_args();build(a.destination,a.frontend_sha)
