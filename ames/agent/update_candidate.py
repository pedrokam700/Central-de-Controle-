"""Explicit update/rollback. Never delete files or reset the operational database."""
import argparse
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import uuid
from pathlib import Path
FILES=('agent.py','agent_entry.py','agent_hardened_entry.py','base_paging_backend.py','candidate_config.py','hardening.py','local_security.py','operational_calendar.py','origin_policy.py','workstation_pairing.py','update_readiness.py','maintenance_admission.py','engine_bridge.py','integrated_snapshot_history.py','store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py','preflight.py','operator_evidence.py','production_shift.py','workstation_autostart.py','agent_3012_patch.py','ames_3012_live.py','ames_3012_strategy.py','repair_3012.py','repair_3012_capture.py','repair_association.py','local_sn.py','network_watch.py','performance_indexes.py','source_capture.py','sn_lookup_context.py','fastlane_runtime_guard.py','factory_redfix.py','offline_catalog.py','map_3012.py','comment_provenance_3028.py')
ROOT_FILES=('INICIAR_POSTO_CENTRAL_V2.bat','00_INICIAR_AQUI.bat','INICIAR_CENTRAL_AMES.cmd',
            'suporte/ames-workstation/ROTA_AMES_APLICAR.bat','suporte/ames-workstation/ROTA_AMES_REMOVER.bat',
            'suporte/ames-workstation/START_AGENT_CANONICAL.ps1','suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1',
            'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1',
            'suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat','suporte/ames-workstation/capture-r12-engine.py')
OPTIONAL_ROOT_FILES=('FRONTEND_GATE.json',)
HASHES={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
ORIGIN='https://central-cora-v2.vercel.app'
PREVIEW_ORIGIN='https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app'
NETLIFY_PREVIEW_ORIGIN='https://deploy-preview-23--productcontrolcenter.netlify.app'
# Preview URLs stay as historical/dev constants, but an operational workstation
# must not gain new preview CORS permissions automatically. Existing explicit
# user origins are preserved; only the stable Central origin is appended.
ORIGINS=(ORIGIN,)

def installation(path):
    target=Path(path).resolve()
    if (target/'ames-agent').is_dir():target=target/'ames-agent'
    if target.name!='ames-agent' or not (target/'agent.py').is_file():raise ValueError('Specify the existing installation or its ames-agent directory')
    for name,expected in HASHES.items():
        if hashlib.sha256((target/name).read_bytes()).hexdigest()!=expected:raise ValueError('Unexpected collector: '+name)
    cfg=json.loads((target/'config.json').read_text(encoding='utf-8-sig')) if (target/'config.json').exists() else {}
    if not isinstance(cfg,dict):raise ValueError('Invalid config.json root')
    try:
        with socket.create_connection(('127.0.0.1',int(cfg.get('port',8765))),timeout=.5):raise RuntimeError('Stop agent and monitor before updating')
    except OSError:pass
    return target,cfg

def _copy_preserving(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)

def _atomic_json(path,value):
    path=Path(path);tmp=path.with_name(path.name+'.tmp.'+uuid.uuid4().hex)
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    parsed=json.loads(tmp.read_text(encoding='utf-8'))
    if not isinstance(parsed,dict):raise ValueError('Invalid generated config')
    os.replace(tmp,path)

def _restore_root(package,saved,manifest):
    for rel in manifest.get('root_files',[]):_copy_preserving(saved/'root'/rel,package/rel)
    for rel in manifest.get('root_absent',[]):
        path=package/rel
        if path.is_file():path.unlink()

def _restore_agent(target,saved,manifest):
    for name in manifest.get('agent_files',[]):
        src=saved/'ames-agent'/name
        if not src.is_file():raise ValueError('Incomplete backup: '+name)
        _copy_preserving(src,target/name)
    for name in manifest.get('agent_absent',[]):
        path=target/name
        if path.is_file():path.unlink()

def backup(target, extra_root=()):
    package=target.parent
    folder=package/'candidate-backups'/uuid.uuid4().hex;folder.mkdir(parents=True)
    agent_files=[];agent_absent=[];root_files=[];root_absent=[]
    for name in (*FILES,'config.json'):
        if (target/name).exists():_copy_preserving(target/name,folder/'ames-agent'/name);agent_files.append(name)
        else:agent_absent.append(name)
    for rel in dict.fromkeys((*ROOT_FILES,*OPTIONAL_ROOT_FILES,*extra_root)):
        if (package/rel).exists():_copy_preserving(package/rel,folder/'root'/rel);root_files.append(rel)
        else:root_absent.append(rel)
    db=target/'data'/'ames_local.sqlite3'
    if db.exists():
        src=sqlite3.connect(db);dst=sqlite3.connect(folder/'ames_local.sqlite3')
        try:
            with dst:src.backup(dst)
        finally:dst.close();src.close()
    (folder/'backup.json').write_text(json.dumps({'target':str(target),'agent_files':agent_files,'agent_absent':agent_absent,'root_files':root_files,'root_absent':root_absent}),encoding='utf-8')
    return folder

def update(path,source=None):
    target,cfg=installation(path);source=Path(source or Path(__file__).parent);package=target.parent;source_root=source.parent
    manifest=json.loads((source/'candidate-files.json').read_text(encoding='utf-8'))
    for name in FILES:
        if not (source/name).is_file():raise ValueError('Candidate file missing: '+name)
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=manifest[name]:raise ValueError('Candidate hash mismatch: '+name)
    for rel in ROOT_FILES:
        if not (source_root/rel).is_file():raise ValueError('Candidate workstation file missing: '+rel)
    extras={}
    local_manifest=source_root/'LOCAL_BUNDLE_MANIFEST.json'
    if local_manifest.is_file():
        extras=json.loads(local_manifest.read_text(encoding='utf-8'))['files']
        for rel,expected in extras.items():
            candidate=(source_root/rel).resolve()
            if source_root.resolve() not in candidate.parents or not (rel.startswith(('frontend/','factory-engine/','network/')) or rel in ('ames-agent/requirements.txt','START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','09_REPARAR_DEPENDENCIAS.bat')):raise ValueError('Invalid local bundle path')
            if hashlib.sha256(candidate.read_bytes()).hexdigest()!=expected:raise ValueError('Local asset hash mismatch: '+rel)
    saved=backup(target,extras)
    try:
        for name in FILES:shutil.copy2(source/name,target/name)
        for rel in ROOT_FILES:_copy_preserving(source_root/rel,package/rel)
        for rel in OPTIONAL_ROOT_FILES:
            if (source_root/rel).is_file():_copy_preserving(source_root/rel,package/rel)
        for rel in extras:_copy_preserving(source_root/rel,package/rel)
        if extras:cfg['engine_dir']=str((package/'factory-engine').resolve())
        cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
        _atomic_json(target/'config.json',cfg)
    except BaseException:
        manifest_old=json.loads((saved/'backup.json').read_text(encoding='utf-8'))
        _restore_agent(target,saved,manifest_old)
        _restore_root(package,saved,manifest_old)
        raise
    print('UPDATED 0.5.25-rc1 + hardening H1; backup/rollback:',saved)
    return saved

def rollback(path,saved=None):
    target,_=installation(path);package=target.parent
    if saved:
        source=Path(saved).resolve();manifest=json.loads((source/'backup.json').read_text(encoding='utf-8'))
        if Path(manifest['target']).resolve()!=target:raise ValueError('Backup belongs to another installation')
        before=backup(target)
        _restore_agent(target,source,manifest)
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
