"""Reproducible clean candidate preserving engine/helpers and exact 3028 bytes."""
import argparse
import hashlib
import json
from pathlib import Path,PurePosixPath
import zipfile
SOURCE_SHA='1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167'
COLLECTORS={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
FILES=['agent.py','agent_entry.py','agent_hardened_entry.py','hardening.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py']
PRODUCTION_URL='https://central-cora-v2.vercel.app'
VERCEL_PREVIEW_URL='https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app'
PR_PREVIEW_URL='https://deploy-preview-23--productcontrolcenter.netlify.app'
ORIGINS=[PRODUCTION_URL,VERCEL_PREVIEW_URL,PR_PREVIEW_URL]
def build(source,destination):
    source,destination=Path(source).resolve(),Path(destination).resolve()
    if destination.exists() or source==destination:raise ValueError('New destination required')
    if hashlib.sha256(source.read_bytes()).hexdigest()!=SOURCE_SHA:raise ValueError('Original ZIP mismatch')
    root=Path(__file__).resolve().parents[1];files={}
    with zipfile.ZipFile(source) as old:
        prefix=next(n[:-len('agent.py')] for n in old.namelist() if n.endswith('/ames-agent/agent.py'));base=prefix[:-len('ames-agent/')]
        for name,digest in COLLECTORS.items():
            assert hashlib.sha256(old.read(prefix+name)).hexdigest()==digest
            assert hashlib.sha256((root/'ames'/'agent'/name).read_bytes()).hexdigest()==digest
        tela3022=next((n for n in old.namelist() if n.endswith('/AMES_Automacao_V0_16_PADRAO_VALIDADO/ames/tela_3022.py')),None)
        if not tela3022:raise ValueError('Source package has no tela_3022.py')
        source3022=old.read(tela3022).decode('utf-8-sig',errors='replace')
        for symbol in ('class Tela3022','def correlacionar_falha_3022','def extrair_passagens_processo'):
            if symbol not in source3022:raise ValueError('3022 source lacks required R11/R12 contract: '+symbol)
        for info in old.infolist():
            parts=PurePosixPath(info.filename).parts
            if info.is_dir() or any(p.lower() in ('data','__pycache__','.git','.venv','logs','output','outputs','checkpoints','chromeprofile') for p in parts) or info.filename.endswith(('.pyc','.sqlite3','.db','.log')):continue
            files[info.filename]=old.read(info)
        config_example=prefix+'config.example.json'
        if config_example in files:
            cfg=json.loads(files[config_example].decode('utf-8-sig'))
            cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
            files[config_example]=(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        for name in ['agent.py','engine_bridge.py','store.py']:files[prefix+'rollback-v0523/'+name]=old.read(prefix+name)
        if base+'00_INICIAR_AQUI.bat' in files:files[base+'rollback-v0523/00_INICIAR_AQUI.bat']=files[base+'00_INICIAR_AQUI.bat']
        for name in [*FILES,'update_candidate.py']:files[prefix+name]=(root/'ames'/'agent'/name).read_bytes().replace(b'\r\n',b'\n')
        files[prefix+'candidate-files.json']=json.dumps({n:hashlib.sha256(files[prefix+n]).hexdigest() for n in FILES},sort_keys=True,indent=2).encode()
        files[base+'CANDIDATO_0_5_24_RC1.md']=(root/'ames'/'agent'/'README.md').read_bytes().replace(b'\r\n',b'\n')
        files[base+'suporte/PREPARAR_PREVIEW_CENTRAL_V2.ps1']=(root/'scripts'/'ames-authorize-preview-origin.ps1').read_bytes().replace(b'\r\n',b'\n')
        workstation=root/'tools'/'ames-workstation'
        workstation_files={
            'ROTA_AMES_APLICAR.bat':'suporte/ames-workstation/ROTA_AMES_APLICAR.bat',
            'ROTA_AMES_REMOVER.bat':'suporte/ames-workstation/ROTA_AMES_REMOVER.bat',
            'START_AGENT_CANONICAL.ps1':'suporte/ames-workstation/START_AGENT_CANONICAL.ps1',
            'DIAGNOSTICO_POSTO.ps1':'suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1',
            'CAPTURAR_MOTOR_R12_SEGURO.bat':'suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat',
            'capture-r12-engine.py':'suporte/ames-workstation/capture-r12-engine.py',
        }
        for source_name,target_name in workstation_files.items():files[base+target_name]=(workstation/source_name).read_bytes()
        launcher=(workstation/'INICIAR_POSTO_CENTRAL_V2.bat').read_bytes()
        files[base+'INICIAR_POSTO_CENTRAL_V2.bat']=launcher
        files[base+'00_INICIAR_AQUI.bat']=launcher
        files[base+'INICIAR_CENTRAL_AMES.cmd']=b'@echo off\r\ncall "%~dp0INICIAR_POSTO_CENTRAL_V2.bat" %*\r\n'
        for action,filename in [('update','ATUALIZAR_CANDIDATO.bat'),('rollback','ROLLBACK_CANDIDATO.bat')]:
            files[base+filename]=('@echo off\r\nsetlocal\r\nif "%~1"=="" (\r\n  echo Uso: '+filename+' "C:\\pasta\\instalacao-existente"\r\n  pause\r\n  exit /b 1\r\n)\r\nwhere py >nul 2>nul\r\nif errorlevel 1 (\r\n  python "%~dp0ames-agent\\update_candidate.py" '+action+' "%~1"\r\n) else (\r\n  py -3 "%~dp0ames-agent\\update_candidate.py" '+action+' "%~1"\r\n)\r\npause\r\n').encode('ascii')
        files[base+'ABRIR_CENTRAL_V2.bat']=('@echo off\r\nstart "" "'+PRODUCTION_URL+'/Central-de-Controle-/"\r\n').encode('ascii')
        files[base+'ABRIR_PREVIEW_PR23.bat']=('@echo off\r\nstart "" "'+VERCEL_PREVIEW_URL+'/Central-de-Controle-/"\r\n').encode('ascii')
    with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED) as new:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(2026,10,9,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;new.writestr(info,data)
    with zipfile.ZipFile(destination) as new:assert new.testzip() is None
    print('Candidate:',destination);print('SHA-256:',hashlib.sha256(destination.read_bytes()).hexdigest())
    print('Exact 3028 retained; R11/R12 3022 contract required; hardening H1 and single-Central bootstrap included.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');a=p.parse_args();build(a.source,a.destination)