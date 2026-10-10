"""Reproducible clean candidate preserving engine/helpers and exact 3028 bytes."""
import argparse
import hashlib
import json
from pathlib import Path,PurePosixPath
import zipfile
SOURCE_SHA='1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167'
COLLECTORS={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
FILES=['agent.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py']
ORIGINS=['https://central-cora-v2.vercel.app','https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app','https://deploy-preview-23--productcontrolcenter.netlify.app']
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
        for info in old.infolist():
            parts=PurePosixPath(info.filename).parts
            # Reference ZIP includes a runtime SQLite database: never redistribute it.
            if info.is_dir() or any(p.lower() in ('data','__pycache__','.git','.venv','logs','output','outputs','checkpoints','chromeprofile') for p in parts) or info.filename.endswith(('.pyc','.sqlite3','.db','.log')):continue
            files[info.filename]=old.read(info)
        config_example=prefix+'config.example.json'
        if config_example in files:
            cfg=json.loads(files[config_example].decode('utf-8-sig'))
            cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
            files[config_example]=(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        for name in ['agent.py','engine_bridge.py','store.py']:files[prefix+'rollback-v0523/'+name]=old.read(prefix+name)
        for name in [*FILES,'update_candidate.py']:files[prefix+name]=(root/'ames'/'agent'/name).read_bytes().replace(b'\r\n',b'\n')
        files[prefix+'candidate-files.json']=json.dumps({n:hashlib.sha256(files[prefix+n]).hexdigest() for n in FILES},sort_keys=True,indent=2).encode()
        files[base+'CANDIDATO_0_5_24_RC1.md']=(root/'ames'/'agent'/'README.md').read_bytes().replace(b'\r\n',b'\n')
        files[base+'suporte/PREPARAR_PREVIEW_CENTRAL_V2.ps1']=(root/'scripts'/'ames-authorize-preview-origin.ps1').read_bytes().replace(b'\r\n',b'\n')
        for action,filename in [('update','ATUALIZAR_CANDIDATO.bat'),('rollback','ROLLBACK_CANDIDATO.bat')]:
            files[base+filename]=('@echo off\r\nsetlocal\r\nif "%~1"=="" (\r\n  echo Uso: '+filename+' "C:\\pasta\\instalacao-existente"\r\n  pause\r\n  exit /b 1\r\n)\r\nwhere py >nul 2>nul\r\nif errorlevel 1 (\r\n  python "%~dp0ames-agent\\update_candidate.py" '+action+' "%~1"\r\n) else (\r\n  py -3 "%~dp0ames-agent\\update_candidate.py" '+action+' "%~1"\r\n)\r\npause\r\n').encode('ascii')
        files[base+'ABRIR_CENTRAL_V2.bat']=b'@echo off\r\nstart "" "https://central-cora-v2.vercel.app"\r\n'
    with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED) as new:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(2026,10,9,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;new.writestr(info,data)
    with zipfile.ZipFile(destination) as new:assert new.testzip() is None
    print('Candidate:',destination);print('SHA-256:',hashlib.sha256(destination.read_bytes()).hexdigest())
    print('Original collectors/engine/helpers/UI retained; runtime databases excluded; backup/rollback included.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');a=p.parse_args();build(a.source,a.destination)
