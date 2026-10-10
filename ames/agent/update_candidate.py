"""Explicit update/rollback. Never delete files or reset the operational database."""
import argparse
import hashlib
import json
import shutil
import socket
import sqlite3
import uuid
from pathlib import Path
FILES=('agent.py','engine_bridge.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py')
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

def backup(target):
    folder=target.parent/'candidate-backups'/uuid.uuid4().hex;folder.mkdir(parents=True);names=[]
    for name in (*FILES,'config.json'):
        if (target/name).exists():shutil.copy2(target/name,folder/name);names.append(name)
    db=target/'data'/'ames_local.sqlite3'
    if db.exists():
        src=sqlite3.connect(db);dst=sqlite3.connect(folder/'ames_local.sqlite3')
        try:
            with dst:src.backup(dst)
        finally:dst.close();src.close()
    (folder/'backup.json').write_text(json.dumps({'target':str(target),'files':names}),encoding='utf-8')
    return folder

def update(path,source=None):
    target,cfg=installation(path);source=Path(source or Path(__file__).parent)
    manifest=json.loads((source/'candidate-files.json').read_text(encoding='utf-8'))
    for name in FILES:
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=manifest[name]:raise ValueError('Candidate hash mismatch: '+name)
    saved=backup(target)
    try:
        for name in FILES:shutil.copy2(source/name,target/name)
        cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
        (target/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
    except BaseException:
        for name in json.loads((saved/'backup.json').read_text(encoding='utf-8'))['files']:shutil.copy2(saved/name,target/name)
        raise
    print('UPDATED 0.5.24-rc1; backup/rollback:',saved)
    return saved

def rollback(path,saved=None):
    target,_=installation(path);source=Path(saved).resolve() if saved else Path(__file__).parent/'rollback-v0523'
    if saved:
        manifest=json.loads((source/'backup.json').read_text(encoding='utf-8'))
        if Path(manifest['target']).resolve()!=target:raise ValueError('Backup belongs to another installation')
        names=manifest['files']
        if not all(n in (*FILES,'config.json') for n in names):raise ValueError('Invalid backup manifest')
    else:names=['agent.py','engine_bridge.py','store.py']
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
