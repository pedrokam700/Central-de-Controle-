"""Explicit update/rollback. Never delete files or reset the operational database."""
import argparse
import hashlib
import json
import shutil
import socket
import sqlite3
import uuid
from pathlib import Path
FILES=('agent.py','agent_entry.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py')
ROOT_FILES=('INICIAR_POSTO_CENTRAL_V2.bat','00_INICIAR_AQUI.bat','INICIAR_CENTRAL_AMES.cmd',
            'suporte/ames-workstation/ROTA_AMES_APLICAR.bat','suporte/ames-workstation/ROTA_AMES_REMOVER.bat',
            'suporte/ames-workstation/START_AGENT_CANONICAL.ps1','suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1',
            'suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat','suporte/ames-workstation/capture-r12-engine.py')
OPTIONAL_ROOT_FILES=('FRONTEND_GATE.json',)
HASHES={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
ORIGIN='https://central-cora-v2.vercel.app'
PREVIEW_ORIGIN='https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app'
NETLIFY_PREVIEW_ORIGIN='https://deploy-preview-23--productcontrolcenter.netlify.app'
ORIGINS=(ORIGIN,PREVIEW_ORIGIN,NETLIFY_PREVIEW_ORIGIN)

def installation(path):
    target=Path(path).resolve()
    if (target/'ames-agent').is_dir():target=target/'ames-agent'
    if target.name!='ames-agent' or not (target/'agent.py').is_file():raise ValueError('Specify the existing installation or its ames-agent directory')
    for name,expected in HASHES.items():
        if hashlib.sha256((target/name).read_bytes()).hexdigest()!=expected:raise ValueError('Unexpected collector: '+name)
    cfg=json.loads((target/'config.json').read_text(encoding='utf-8-sig')) if (target/'config.json').exists() else {}
    try:
        with socket.create_connection(('127.0.0.1',int(cfg.get('port',8765))),timeout=.5):raise RuntimeError('Stop agent and monitor before updating')
    except OSError:pass
    return target,cfg

def _copy_preserving(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)

def _restore_root(package,saved,manifest):
    for rel in manifest.get('root_files',[]):_copy_preserving(saved/'root'/rel,package/rel)
    for rel in manifest.get('root_absent',[]):
        path=package/rel
        if path.is_file():path.unlink()

def backup(target):
    package=target.parent
    folder=package/'candidate-backups'/uuid.uuid4().hex;folder.mkdir(parents=True)
    agent_files=[];root_files=[];root_absent=[]
    for name in (*FILES,'config.json'):
        if (target/name).exists():_copy_preserving(target/name,folder/'ames-agent'/name);agent_files.append(name)
    for rel in (*ROOT_FILES,*OPTIONAL_ROOT_FILES):
        if (package/rel).exists():_copy_preserving(package/rel,folder/'root'/rel);root_files.append(rel)
        else:root_absent.append(rel)
    db=target/'data'/'ames_local.sqlite3'
    if db.exists():
        src=sqlite3.connect(db);dst=sqlite3.connect(folder/'ames_local.sqlite3')
        try:
            with dst:src.backup(dst)
        finally:dst.close();src.close()
    (folder/'backup.json').write_text(json.dumps({'target':str(target),'agent_files':agent_files,'root_files':root_files,'root_absent':root_absent}),encoding='utf-8')
    return folder

def update(path,source=None):
    target,cfg=installation(path);source=Path(source or Path(__file__).parent);package=target.parent;source_root=source.parent
    manifest=json.loads((source/'candidate-files.json').read_text(encoding='utf-8'))
    for name in FILES:
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=manifest[name]:raise ValueError('Candidate hash mismatch: '+name)
    for rel in ROOT_FILES:
        if not (source_root/rel).is_file():raise ValueError('Candidate workstation file missing: '+rel)
    saved=backup(target)
    try:
        for name in FILES:shutil.copy2(source/name,target/name)
        for rel in ROOT_FILES:_copy_preserving(source_root/rel,package/rel)
        for rel in OPTIONAL_ROOT_FILES:
            if (source_root/rel).is_file():_copy_preserving(source_root/rel,package/rel)
        cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
        (target/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
    except BaseException:
        manifest_old=json.loads((saved/'backup.json').read_text(encoding='utf-8'))
        for name in manifest_old.get('agent_files',[]):_copy_preserving(saved/'ames-agent'/name,target/name)
        _restore_root(package,saved,manifest_old)
        raise
    print('UPDATED 0.5.25-rc1 + canonical 3022 entry; backup/rollback:',saved)
    return saved

def rollback(path,saved=None):
    target,_=installation(path);package=target.parent
    if saved:
        source=Path(saved).resolve();manifest=json.loads((source/'backup.json').read_text(encoding='utf-8'))
        if Path(manifest['target']).resolve()!=target:raise ValueError('Backup belongs to another installation')
        before=backup(target)
        for name in manifest.get('agent_files',[]):
            if not (source/'ames-agent'/name).is_file():raise ValueError('Incomplete backup: '+name)
            _copy_preserving(source/'ames-agent'/name,target/name)
        for rel in manifest.get('root_files',[]):
            if not (source/'root'/rel).is_file():raise ValueError('Incomplete root backup: '+rel)
        _restore_root(package,source,manifest)
    else:
        source=Path(__file__).parent/'rollback-v0523';names=['agent.py','engine_bridge.py','store.py']
        for name in names:
            if not (source/name).is_file():raise ValueError('Incomplete rollback: '+name)
        before=backup(target)
        for name in names:shutil.copy2(source/name,target/name)
    print('ROLLED BACK; SQLite retained; pre-rollback backup:',before)
    return before

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['update','rollback']);p.add_argument('installation');p.add_argument('--backup');args=p.parse_args()
    if args.operation=='update':update(args.installation)
    else:rollback(args.installation,args.backup)
