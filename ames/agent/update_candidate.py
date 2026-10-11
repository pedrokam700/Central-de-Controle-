"""Explicit update/rollback/frontend staging. Never delete operational data."""
import argparse
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import stat
import uuid
import zipfile
from pathlib import Path, PurePosixPath
FILES=(
    'agent.py','agent_entry.py','agent_hardened_entry.py','hardening.py','local_security.py',
    'operational_calendar.py','operational_registry.py','diagnostics.py','migrations.py','disaster_recovery.py',
    'support_diagnostics.py','workstation_identity.py','retention_policy.py','engine_bridge.py',
    'store.py','mes_scheduler.py','canonical.py','process_timeline.py','process_r11.py'
)
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
FRONTEND_PACKAGE_SCHEMA='central-immutable-frontend-v1'
FRONTEND_PACKAGE_MANIFEST='FRONTEND_PACKAGE_MANIFEST.json'
FRONTEND_STAGE_SCHEMA='central-local-frontend-stage-v1'
FRONTEND_STAGE_MARKER='_CENTRAL_FRONTEND_STAGE.json'
FRONTEND_STAGE_MANIFEST='_CENTRAL_FRONTEND_MANIFEST.json'

def _package_target(path):
    target=Path(path).resolve()
    if (target/'ames-agent').is_dir():target=target/'ames-agent'
    if target.name!='ames-agent' or not (target/'agent.py').is_file():raise ValueError('Specify the existing installation or its ames-agent directory')
    return target,target.parent

def installation(path):
    target,_=_package_target(path)
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

def _sha256_bytes(data):return hashlib.sha256(data).hexdigest()
def _sha256_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def _safe_zip_member(name):
    pure=PurePosixPath(name)
    if not name or name.startswith('/') or '\\' in name or '..' in pure.parts:return False
    return True

def _frontend_package_manifest(package_path,expected_sha):
    expected=str(expected_sha or '').strip().lower()
    if len(expected)!=40 or any(ch not in '0123456789abcdef' for ch in expected):raise ValueError('frontend SHA must be exact 40-hex commit SHA')
    package_path=Path(package_path).resolve()
    if not package_path.is_file():raise ValueError('Immutable frontend package not found')
    with zipfile.ZipFile(package_path,'r') as archive:
        infos=archive.infolist();names=[i.filename for i in infos]
        if len(names)!=len(set(names)):raise ValueError('Duplicate member in immutable frontend package')
        for info in infos:
            if not _safe_zip_member(info.filename):raise ValueError('Unsafe member in immutable frontend package: '+info.filename)
            mode=(info.external_attr>>16)&0o170000
            if mode==stat.S_IFLNK:raise ValueError('Symlink refused in immutable frontend package: '+info.filename)
        if FRONTEND_PACKAGE_MANIFEST not in names:raise ValueError('Immutable frontend manifest missing')
        manifest=json.loads(archive.read(FRONTEND_PACKAGE_MANIFEST).decode('utf-8'))
        if manifest.get('schema')!=FRONTEND_PACKAGE_SCHEMA:raise ValueError('Unsupported immutable frontend schema')
        if str(manifest.get('frontend_sha') or '').lower()!=expected:raise ValueError('Immutable frontend package SHA mismatch')
        files=manifest.get('files')
        if not isinstance(files,list) or not files:raise ValueError('Immutable frontend file manifest empty')
        expected_members={FRONTEND_PACKAGE_MANIFEST}
        seen_paths=set()
        for item in files:
            rel=str(item.get('path') or '')
            if not _safe_zip_member(rel) or rel in seen_paths:raise ValueError('Invalid/duplicate frontend path: '+rel)
            seen_paths.add(rel);member='frontend/'+rel;expected_members.add(member)
            try:data=archive.read(member)
            except KeyError as exc:raise ValueError('Immutable frontend member missing: '+member) from exc
            if len(data)!=int(item.get('bytes',-1)):raise ValueError('Immutable frontend size mismatch: '+member)
            if _sha256_bytes(data)!=str(item.get('sha256') or ''):raise ValueError('Immutable frontend hash mismatch: '+member)
        extra=set(names)-expected_members
        if extra:raise ValueError('Unexpected immutable frontend members: '+','.join(sorted(extra)))
        required={'frontend/release-build.json','frontend/release-identity.json','frontend/Central-de-Controle-/index.html'}
        if not required<=expected_members:raise ValueError('Immutable frontend missing release/canonical files')
        release=json.loads(archive.read('frontend/release-build.json').decode('utf-8'))
        if str(release.get('sha') or '').lower()!=expected:raise ValueError('release-build SHA mismatch inside immutable frontend')
        identity=archive.read('frontend/release-identity.json')
        if _sha256_bytes(identity)!=str(manifest.get('release_identity_sha256') or ''):raise ValueError('release identity digest mismatch inside immutable frontend')
    return manifest

def _verify_staged_frontend(folder,manifest):
    folder=Path(folder)
    for item in manifest['files']:
        path=folder/item['path']
        if not path.is_file():raise ValueError('Staged frontend member missing: '+item['path'])
        if path.stat().st_size!=int(item['bytes']):raise ValueError('Staged frontend size mismatch: '+item['path'])
        if _sha256_file(path)!=item['sha256']:raise ValueError('Staged frontend hash mismatch: '+item['path'])
    return True

def _verify_stage_metadata(folder,manifest,package_digest):
    folder=Path(folder);marker_path=folder/FRONTEND_STAGE_MARKER;manifest_path=folder/FRONTEND_STAGE_MANIFEST
    if not marker_path.is_file() or not manifest_path.is_file():raise ValueError('Existing frontend stage metadata missing; refusing overwrite')
    state=json.loads(marker_path.read_text(encoding='utf-8'));stored_manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    if state.get('schema')!=FRONTEND_STAGE_SCHEMA or state.get('frontend_sha')!=manifest.get('frontend_sha') or state.get('package_sha256')!=package_digest:raise ValueError('Existing frontend stage identity mismatch; refusing overwrite')
    if stored_manifest!=manifest:raise ValueError('Existing frontend stage manifest mismatch; refusing overwrite')
    if state.get('stage_manifest_sha256')!=_sha256_file(manifest_path):raise ValueError('Existing frontend stage manifest digest mismatch; refusing overwrite')
    _verify_staged_frontend(folder,stored_manifest)
    return True

def stage_frontend(path,frontend_package,expected_sha):
    _,package_root=_package_target(path)
    package_path=Path(frontend_package).resolve();manifest=_frontend_package_manifest(package_path,expected_sha)
    sha=str(manifest['frontend_sha']).lower();root=package_root/'frontend-packages';final=root/sha
    package_digest=_sha256_file(package_path)
    if final.exists():
        _verify_stage_metadata(final,manifest,package_digest)
        return final
    root.mkdir(parents=True,exist_ok=True);temp=root/(sha+'.stage.'+uuid.uuid4().hex)
    temp.mkdir()
    try:
        with zipfile.ZipFile(package_path,'r') as archive:
            for item in manifest['files']:
                rel=item['path'];data=archive.read('frontend/'+rel);dst=temp/rel;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(data)
        _verify_staged_frontend(temp,manifest)
        _atomic_json(temp/FRONTEND_STAGE_MANIFEST,manifest)
        manifest_digest=_sha256_file(temp/FRONTEND_STAGE_MANIFEST)
        _atomic_json(temp/FRONTEND_STAGE_MARKER,{
            'schema':FRONTEND_STAGE_SCHEMA,
            'frontend_sha':sha,
            'package_sha256':package_digest,
            'stage_manifest_sha256':manifest_digest,
            'release_identity_sha256':manifest.get('release_identity_sha256'),
            'canonical_path':'/Central-de-Controle-/',
            'activated':False,
            'serving_origin':None,
        })
        os.replace(temp,final)
    except BaseException:
        shutil.rmtree(temp,ignore_errors=True)
        raise
    print('FRONTEND STAGED (not activated):',final)
    return final

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

def backup(target):
    package=target.parent
    folder=package/'candidate-backups'/uuid.uuid4().hex;folder.mkdir(parents=True)
    agent_files=[];agent_absent=[];root_files=[];root_absent=[]
    for name in (*FILES,'config.json'):
        if (target/name).exists():_copy_preserving(target/name,folder/'ames-agent'/name);agent_files.append(name)
        else:agent_absent.append(name)
    for rel in (*ROOT_FILES,*OPTIONAL_ROOT_FILES):
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
    saved=backup(target)
    try:
        for name in FILES:shutil.copy2(source/name,target/name)
        for rel in ROOT_FILES:_copy_preserving(source_root/rel,package/rel)
        for rel in OPTIONAL_ROOT_FILES:
            if (source_root/rel).is_file():_copy_preserving(source_root/rel,package/rel)
        cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
        _atomic_json(target/'config.json',cfg)
    except BaseException:
        manifest_old=json.loads((saved/'backup.json').read_text(encoding='utf-8'))
        _restore_agent(target,saved,manifest_old)
        _restore_root(package,saved,manifest_old)
        raise
    print('UPDATED 0.5.25-rc1 + production hardening; backup/rollback:',saved)
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
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['update','rollback','stage-frontend']);p.add_argument('installation');p.add_argument('--backup');p.add_argument('--package');p.add_argument('--frontend-sha');args=p.parse_args()
    if args.operation=='update':update(args.installation)
    elif args.operation=='rollback':rollback(args.installation,args.backup)
    else:
        if not args.package or not args.frontend_sha:p.error('stage-frontend requires --package and --frontend-sha')
        stage_frontend(args.installation,args.package,args.frontend_sha)