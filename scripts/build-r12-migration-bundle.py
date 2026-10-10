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
FILES=('agent.py','agent_entry.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py')
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

def build(destination:Path,frontend_sha:str):
    destination=destination.resolve();frontend_sha=str(frontend_sha).strip().lower()
    if destination.exists():raise ValueError(f'Destination exists: {destination}')
    if not re.fullmatch(r'[0-9a-f]{40}',frontend_sha):raise ValueError('frontend_sha must be an exact 40-hex commit SHA')
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
    payload['ATUALIZAR_R12_EXISTENTE.bat']=(
        '@echo off\r\nsetlocal EnableExtensions\r\n'
        'set "TARGET=%~1"\r\n'
        'if "%TARGET%"=="" (\r\n'
        '  echo Informe a pasta raiz da automacao R12 existente.\r\n'
        '  set /p "TARGET=R12: "\r\n'
        ')\r\n'
        'if "%TARGET%"=="" exit /b 2\r\n'
        'where py >nul 2>nul\r\n'
        'if errorlevel 1 (\r\n'
        '  python "%~dp0ames-agent\\update_candidate.py" update "%TARGET%"\r\n'
        ') else (\r\n'
        '  py -3 "%~dp0ames-agent\\update_candidate.py" update "%TARGET%"\r\n'
        ')\r\n'
        'if errorlevel 1 exit /b %errorlevel%\r\n'
        'echo.\r\n'
        'echo [OK] Migracao aplicada com backup/rollback preservado.\r\n'
        'echo Agora execute 00_INICIAR_AQUI.bat dentro da instalacao atualizada.\r\n'
        'exit /b 0\r\n'
    ).encode('ascii')
    manifest={
        'schema':'central-r12-migration-bundle-v2',
        'purpose':'update-existing-r12-only',
        'frontend_sha':frontend_sha,
        'new_pc_supported':False,
        'factory_gate_required':True,
        'preview_selection':'exact-sha-with-validated-offline-fallback',
        'files':{name:digest(data) for name,data in sorted(payload.items())},
        'notes':['does not contain A-MES credentials/session','does not contain runtime SQLite','updater validates frozen 3028 hashes before update','launcher accepts only a preview whose release-build.json matches frontend_sha; after one valid check it may reuse that exact origin/SHA from cache state']
    }
    payload['MIGRATION_MANIFEST.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    payload['LEIA_PRIMEIRO_R12.txt']=(
        'CENTRAL V2 + A-MES — MIGRACAO DE R12 EXISTENTE\r\n\r\n'
        'Este bundle NAO e instalador para computador novo.\r\n'
        'Ele atualiza uma instalacao R12 existente depois de validar os coletores 3028.\r\n'
        'O updater cria backup do codigo/configuracao/SQLite antes da troca e nao apaga a base.\r\n'
        f'Frontend esperado neste bundle: {frontend_sha}\r\n'
        'O launcher testa Vercel/Netlify e abre somente um preview cujo release-build.json tenha exatamente esse SHA.\r\n'
        'Depois de uma validacao online bem-sucedida, a mesma origem/SHA pode ser reutilizada durante perda de internet para o shell offline.\r\n'
        '1. Pare agente/monitor da R12.\r\n'
        '2. Execute ATUALIZAR_R12_EXISTENTE.bat e informe a pasta da instalacao.\r\n'
        '3. Execute 00_INICIAR_AQUI.bat na instalacao atualizada.\r\n'
        '4. Login A-MES permanece manual.\r\n'
        '5. Execute suporte\\ames-workstation\\CAPTURAR_MOTOR_R12_SEGURO.bat durante o gate para gerar a captura sem dados/sessao.\r\n'
        '6. Rode o gate fisico 9/9 antes de qualquer promocao.\r\n'
    ).encode('utf-8')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(payload.items()):
            info=zipfile.ZipInfo(name,(2026,10,10,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,data)
    with zipfile.ZipFile(destination) as z:
        if z.testzip() is not None:raise ValueError('Corrupt bundle')
    print(destination)
    print('Frontend SHA:',frontend_sha)
    print('SHA-256:',digest(destination.read_bytes()))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('destination',type=Path);p.add_argument('--frontend-sha',required=True);a=p.parse_args();build(a.destination,a.frontend_sha)
