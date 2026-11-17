"""Verified code generations with persistent recovery; never restore operational data."""
import argparse
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import uuid
import stat
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
FILES=('agent.py','agent_entry.py','agent_hardened_entry.py','base_paging_backend.py','candidate_config.py','hardening.py','local_security.py','operational_calendar.py','origin_policy.py','workstation_pairing.py','update_readiness.py','maintenance_admission.py','engine_bridge.py','integrated_snapshot_history.py','partial_retry.py','trace_auto_resume.py','store.py','mes_scheduler.py','canonical.py','production_diagnostics.py','material_trace_provenance.py','process_timeline.py','process_r11.py','preflight.py','operator_evidence.py','production_shift.py','workstation_autostart.py','agent_3012_patch.py','ames_3012_live.py','ames_3012_strategy.py','repair_3012.py','repair_3012_capture.py','repair_association.py','local_sn.py','network_watch.py','performance_indexes.py','source_capture.py','sn_lookup_context.py','fastlane_runtime_guard.py','factory_redfix.py','offline_catalog.py','map_3012.py','comment_provenance_3028.py','at_offline_package.py','at_profiles.py','trace_3012_enrichment.py')
ROOT_FILES=('INICIAR_POSTO_CENTRAL_V2.bat','00_INICIAR_AQUI.bat','INICIAR_CENTRAL_AMES.cmd',
            'suporte/ames-workstation/ROTA_AMES_APLICAR.bat','suporte/ames-workstation/ROTA_AMES_REMOVER.bat',
            'suporte/ames-workstation/START_AGENT_CANONICAL.ps1','suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1',
            'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1',
            'suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1',
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

# Multi-file replacement is NOT atomic. The existing startup barrier remains
# present until one complete generation has been verified. Only code/config is
# restored: SQLite/WAL, tokens, checkpoints and browser state are never targets.
BACKUP_SCHEMA='central-updater-backup-v2'
TRANSACTION_SCHEMA='central-updater-transaction-v1'

class RecoveryRequired(RuntimeError):
    pass

class LegacyBackupUnverified(ValueError):
    pass


def _regular(path):
    try:
        info=path.lstat()
    except FileNotFoundError:
        return False
    if stat.S_ISLNK(info.st_mode) or getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0):
        raise ValueError('Untrusted link/reparse point')
    if not stat.S_ISREG(info.st_mode) or info.st_nlink>1:
        raise ValueError('Untrusted non-regular or shared file')
    return True


def _root(path):
    path=Path(path).absolute()
    info=path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.is_symlink() or getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0):
        raise ValueError('Untrusted directory')
    return path.resolve()


def _relative(relative):
    if not isinstance(relative,str) or not relative or any(ord(c)<32 for c in relative) or '\\' in relative or ':' in relative:
        raise ValueError('Unsafe member path')
    parts=PurePosixPath(relative).parts
    if relative.startswith('/') or '/'.join(parts)!=relative or any(p in ('.','..') or p.endswith(('.',' ')) for p in parts):
        raise ValueError('Unsafe member path')
    return parts


def _safe_path(root,relative):
    parts=_relative(relative)
    path=root.joinpath(*parts)
    current=root
    for part in parts:
        current=current/part
        try:info=current.lstat()
        except FileNotFoundError:continue
        if stat.S_ISLNK(info.st_mode) or getattr(info,'st_file_attributes',0)&getattr(stat,'FILE_ATTRIBUTE_REPARSE_POINT',0):
            raise ValueError('Member link/reparse point')
    if not path.resolve().is_relative_to(root):raise ValueError('Member escapes root')
    return path


def _software(relative):
    _relative(relative)
    lowered=relative.casefold();leaf=PurePosixPath(relative).name.lower()
    if (lowered.startswith(('ames-agent/data/','factory-engine/output/','factory-engine/logs/','factory-engine/screenshots/')) or leaf.endswith(('.sqlite','.sqlite3','.db','-wal','-shm','-journal'))
            or leaf in ('local_agent_token','cookies.json','session.json','.env')):
        raise ValueError('Operational data is never a restore target')
    if relative.startswith('ames-agent/'):
        if relative not in {'ames-agent/'+n for n in (*FILES,'config.json','requirements.txt')}:
            raise ValueError('Unknown agent restore member')
    elif relative not in (*ROOT_FILES,*OPTIONAL_ROOT_FILES,'START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','09_REPARAR_DEPENDENCIAS.bat') and not relative.startswith(('frontend/','factory-engine/','network/')):
        raise ValueError('Unknown root restore member')
    return relative


def _digest(path):
    if not _regular(path):raise ValueError('Missing member')
    h=hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda:handle.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def installation(path,*,recovery=False):
    target=_root(path)
    if (target/'ames-agent').is_dir():target=_root(target/'ames-agent')
    if target.name!='ames-agent' or not _regular(target/'agent.py'):raise ValueError('Specify existing ames-agent')
    marker=target.parent/'.ames-update'
    if marker.exists():
        _root(marker)
        if not recovery and any(marker.iterdir()):raise RecoveryRequired('Pending update; supervised recovery required')
    for name,expected in HASHES.items():
        if _digest(target/name)!=expected:raise ValueError('Unexpected frozen collector')
    cfg=json.loads((target/'config.json').read_text(encoding='utf-8-sig')) if _regular(target/'config.json') else {}
    if not isinstance(cfg,dict):raise ValueError('Invalid config root')
    try:
        with socket.create_connection(('127.0.0.1',int(cfg.get('port',8765))),timeout=.5):raise RuntimeError('Stop agent/monitor before update/recovery')
    except OSError:pass
    return target,cfg


def _copy_preserving(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)


def _atomic_json(path,value):
    tmp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex)
    try:
        with tmp.open('x',encoding='utf-8') as handle:
            json.dump(value,handle,ensure_ascii=False,sort_keys=True,indent=2)
            handle.write('\n');handle.flush();os.fsync(handle.fileno())
        os.replace(tmp,path)
    finally:
        if tmp.exists():tmp.unlink()


def _phase(name):
    """No-op boundary used only by synthetic fault/crash injection tests."""


def _hash_table(folder):
    result={}
    for file in folder.rglob('*'):
        if file.is_dir():_root(file)
        else:result[file.relative_to(folder).as_posix()]=_digest(file)
    return result


def _validate_manifest(manifest):
    fields=('agent_files','agent_absent','root_files','root_absent')
    for name in fields:
        if not isinstance(manifest.get(name),list) or any(not isinstance(p,str) for p in manifest[name]):raise ValueError('Invalid backup inventory')
    members={}
    for kind in ('agent','root'):
        for status in ('files','absent'):
            for name in manifest[kind+'_'+status]:
                relative=_software('ames-agent/'+name if kind=='agent' else name)
                if relative.casefold() in members:raise ValueError('Duplicate/conflicting backup member')
                members[relative.casefold()]=relative
    required={'ames-agent/'+n for n in (*FILES,'config.json')}|set(ROOT_FILES)|set(OPTIONAL_ROOT_FILES)
    if not required.issubset(set(members.values())):raise ValueError('Incomplete backup scope')
    if 'agent.py' not in manifest['agent_files']:raise ValueError('Backup lacks required agent entry')
    if not isinstance(manifest.get('target'),str):raise ValueError('Missing backup target')


def _load_backup(saved,*,legacy_proof=None):
    saved=_root(saved);file=saved/'backup.json'
    if not _regular(file):raise ValueError('Missing backup manifest')
    manifest=json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(manifest,dict):raise ValueError('Invalid backup manifest')
    if manifest.get('schema')!=BACKUP_SCHEMA:
        if legacy_proof is None:raise LegacyBackupUnverified('Legacy backup lacks integrity proof; inspect only')
        proof=json.loads(Path(legacy_proof).read_text()) if isinstance(legacy_proof,(str,Path)) else legacy_proof
        if not isinstance(proof,dict) or proof.get('schema')!='central-updater-legacy-proof-v1' or proof.get('backup_json_sha256')!=_digest(file):
            raise LegacyBackupUnverified('Invalid independent legacy proof')
        trusted=proof.get('manifest')
        if not isinstance(trusted,dict) or trusted.get('schema')!=BACKUP_SCHEMA or trusted.get('target')!=manifest.get('target'):
            raise LegacyBackupUnverified('Legacy proof target/schema mismatch')
        for key in ('agent_files','root_files'):
            if trusted.get(key)!=manifest.get(key):raise LegacyBackupUnverified('Legacy proof inventory mismatch')
        for key in ('agent_absent','root_absent'):
            if not set(manifest.get(key,[])).issubset(set(trusted.get(key,[]))):raise LegacyBackupUnverified('Legacy absence mismatch')
        manifest=trusted
    _validate_manifest(manifest)
    expected=manifest.get('sha256')
    if not isinstance(expected,dict):raise ValueError('Backup digests missing')
    names={'ames-agent/'+n for n in manifest['agent_files']}|{'root/'+p for p in manifest['root_files']}
    if (saved/'ames_local.sqlite3').exists():names.add('ames_local.sqlite3')
    if set(expected)!=names:raise ValueError('Backup digest inventory mismatch')
    actual=_hash_table(saved);actual.pop('backup.json',None)
    if actual!=expected:raise ValueError('Backup integrity mismatch')
    return saved,manifest


def inspect_backup(saved):
    try:
        _,manifest=_load_backup(saved)
        return {'schema':manifest['schema'],'integrity_proven':True,'restore_authorized':False}
    except LegacyBackupUnverified:
        return {'schema':'legacy','integrity_proven':False,'restore_authorized':False,'reason':'independent_proof_required'}


def _restore_agent(target,saved,manifest):
    """Prepare a plan; NEVER copy one member before validating the whole backup."""
    return {'ames-agent/'+name:(saved/'ames-agent'/name if name in manifest['agent_files'] else None)
            for name in (*manifest['agent_files'],*manifest['agent_absent'])}


def _restore_root(package,saved,manifest):
    """Prepare the other half of the same validated generation, without writes."""
    return {name:(saved/'root'/name if name in manifest['root_files'] else None)
            for name in (*manifest['root_files'],*manifest['root_absent'])}


def backup(target,extra_root=()):
    target=_root(target);package=target.parent
    roots=list(dict.fromkeys((*ROOT_FILES,*OPTIONAL_ROOT_FILES,*extra_root)))
    # Validate every source/path before creating the backup folder.
    entries={}
    for rel in ['ames-agent/'+n for n in (*FILES,'config.json')]+roots:
        _software(rel);path=_safe_path(package,rel)
        entries[rel]=path if _regular(path) else None
    folder=package/'candidate-backups'/uuid.uuid4().hex
    _safe_path(package,'candidate-backups')
    folder.mkdir(parents=True,mode=0o700)
    manifest={'schema':BACKUP_SCHEMA,'target':str(target),'agent_files':[],'agent_absent':[],'root_files':[],'root_absent':[]}
    for rel,src in entries.items():
        agent=rel.startswith('ames-agent/');name=rel[len('ames-agent/'):] if agent else rel
        manifest[('agent_' if agent else 'root_')+('files' if src else 'absent')].append(name)
        if src:
            dst=folder/('ames-agent/'+name if agent else 'root/'+name)
            expected=_digest(src);_copy_preserving(src,dst)
            if _digest(dst)!=expected or _digest(src)!=expected:raise ValueError('Backup source changed')
    db=target/'data'/'ames_local.sqlite3'
    if db.exists():
        if not _regular(db):raise ValueError('Invalid database source')
        src=sqlite3.connect(db.resolve().as_uri()+'?mode=ro',uri=True);dst=sqlite3.connect(folder/'ames_local.sqlite3')
        try:
            src.backup(dst);dst.commit()
        finally:dst.close();src.close()
    manifest['sha256']=_hash_table(folder)
    _atomic_json(folder/'backup.json',manifest)
    _load_backup(folder)
    return folder


@contextmanager
def _claim_lock(marker,*,create):
    file=marker/'claim.lock'
    if create:
        with file.open('xb') as handle:handle.write(b'1');handle.flush();os.fsync(handle.fileno())
    if not _regular(file):raise RecoveryRequired('Invalid claim')
    with file.open('r+b') as handle:
        if os.name=='nt':
            import msvcrt
            try:msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            except OSError as error:raise RecoveryRequired('Updater/recovery is already active') from error
            try:yield
            finally:handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
        else:
            import fcntl
            try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError as error:raise RecoveryRequired('Updater/recovery is already active') from error
            try:yield
            finally:fcntl.flock(handle,fcntl.LOCK_UN)


def _seal(marker,name,plan,expected_hashes=None):
    hashes={}
    for rel,src in plan.items():
        _software(rel);dst=_safe_path(marker/name,rel)
        if src is None:hashes[rel]=None
        else:
            expected=expected_hashes[rel] if expected_hashes is not None else _digest(src)
            if _digest(src)!=expected:raise ValueError('Source differs from validated inventory')
            _copy_preserving(src,dst)
            if _digest(dst)!=expected or _digest(src)!=expected:raise ValueError('Staging integrity changed')
            hashes[rel]=expected
    file=marker/(name+'.json');_atomic_json(file,hashes)
    return _digest(file)


def _staged(marker,name,expected):
    file=marker/(name+'.json')
    if _digest(file)!=expected:raise RecoveryRequired('Staging manifest changed')
    hashes=json.loads(file.read_text())
    if not isinstance(hashes,dict):raise RecoveryRequired('Invalid staged inventory')
    for rel,digest in hashes.items():
        _software(rel)
        if digest is not None and _digest(_safe_path(marker/name,rel))!=digest:raise RecoveryRequired('Staged member changed')
    return hashes


def _current(package,relative):
    path=_safe_path(package,relative)
    return _digest(path) if _regular(path) else None


def _verify_generation(package,hashes):
    for rel,expected in hashes.items():
        if _current(package,rel)!=expected:raise RecoveryRequired('Destination generation not verified')


def _known_generation(package,before,desired):
    if set(before)!=set(desired):raise RecoveryRequired('Generation scope mismatch')
    for rel in before:
        if _current(package,rel) not in (before[rel],desired[rel]):raise RecoveryRequired('Destination changed outside updater; manual review required')


def _apply(package,marker,name,hashes):
    for rel,expected in hashes.items():
        path=_safe_path(package,rel)
        _phase('before:'+rel)
        if expected is None:
            if _regular(path):path.unlink()
        else:
            src=_safe_path(marker/name,rel)
            if _digest(src)!=expected:raise RecoveryRequired('Staged source corrupt')
            path.parent.mkdir(parents=True,exist_ok=True)
            temp=path.with_name('.'+path.name+'.pending-'+uuid.uuid4().hex)
            try:
                # Own unique temp file, same directory as destination. One rename
                # per file; there is no multi-file atomic filesystem transaction.
                with temp.open('xb'):pass
                _copy_preserving(src,temp)
                with temp.open('r+b') as handle:handle.flush();os.fsync(handle.fileno())
                if _digest(temp)!=expected:raise RecoveryRequired('Temporary copy corrupt')
                os.replace(temp,path)
            finally:
                if temp.exists():temp.unlink()
        _phase('after:'+rel)
    _verify_generation(package,hashes)


def _journal(marker,record,state):
    record['state']=state;_atomic_json(marker/'transaction.json',record)


def _finish(package,marker,record):
    # Claim handle is CLOSED before moving the directory (Windows). Concurrent
    # recovery seeing COMPLETE may only verify/finalize, never replace files.
    archive=package/'candidate-backups'/('transaction-'+record['transaction_id'])
    _safe_path(package,'candidate-backups')
    archive.parent.mkdir(parents=True,exist_ok=True)
    if archive.exists():raise RecoveryRequired('Archive already exists; preserve claim for review')
    try:os.rename(marker,archive)
    except OSError as error:raise RecoveryRequired('Verified generation; claim retained until supervised finalization') from error


def _transaction(target,plan,operation,expected_hashes):
    package=target.parent;marker=package/'.ames-update'
    if marker.exists():
        _root(marker)
        if any(marker.iterdir()):raise RecoveryRequired('Pending transaction')
    else:marker.mkdir(mode=0o700)
    record={'schema':TRANSACTION_SCHEMA,'transaction_id':uuid.uuid4().hex,'target':str(target),'operation':operation,'state':'PREPARING'}
    with _claim_lock(marker,create=True):
        _journal(marker,record,'PREPARING')
        try:
            before_backup=backup(target,[p for p in plan if p not in {'ames-agent/'+n for n in (*FILES,'config.json')}])
            record['backup']=str(before_backup)
            before={rel:(_safe_path(package,rel) if _regular(_safe_path(package,rel)) else None) for rel in plan}
            record['before_sha256']=_seal(marker,'before',before)
            record['desired_sha256']=_seal(marker,'desired',plan,expected_hashes)
            old=_staged(marker,'before',record['before_sha256']);new=_staged(marker,'desired',record['desired_sha256'])
            _known_generation(package,old,new)
            _journal(marker,record,'PREPARED');_phase('prepared')
            _journal(marker,record,'APPLYING');_apply(package,marker,'desired',new)
            _phase('verified');_journal(marker,record,'COMPLETE')
        except Exception:
            if record['state'] in ('PREPARING','PREPARED'):
                # No destination replacement has started; retain snapshots for audit.
                _journal(marker,record,'CANCELLED')
            else:
                try:
                    _journal(marker,record,'COMPENSATING')
                    old=_staged(marker,'before',record['before_sha256']);new=_staged(marker,'desired',record['desired_sha256'])
                    _known_generation(package,old,new);_apply(package,marker,'before',old)
                    _journal(marker,record,'COMPENSATED')
                except BaseException as error:
                    _journal(marker,record,'RECOVERY_REQUIRED')
                    raise RecoveryRequired('Compensation failed; preserve claim/backup and recover explicitly') from error
            failed=True
        except BaseException:
            # KeyboardInterrupt/SystemExit/controlled interruption preserve the
            # last persisted phase and both sealed generations; never auto-restart.
            raise
        else:failed=False
    _finish(package,marker,record)
    if failed:raise RecoveryRequired('Operation failed; original generation preserved and verified')
    return before_backup


def recover(path,*,transaction_id):
    target,_=installation(path,recovery=True);package=target.parent;marker=_root(package/'.ames-update')
    with _claim_lock(marker,create=False):
        record=json.loads((marker/'transaction.json').read_text())
        if (record.get('schema')!=TRANSACTION_SCHEMA or record.get('transaction_id')!=transaction_id
                or Path(record.get('target','')).resolve()!=target or not isinstance(transaction_id,str)
                or len(transaction_id)!=32 or any(c not in '0123456789abcdef' for c in transaction_id)):
            raise RecoveryRequired('Transaction identity mismatch')
        state=record.get('state')
        if state in ('PREPARING','CANCELLED'):
            # This state is persisted BEFORE any replacement can be attempted.
            _journal(marker,record,'CANCELLED')
        else:
            old=_staged(marker,'before',record['before_sha256']);new=_staged(marker,'desired',record['desired_sha256'])
            if state in ('COMPLETE','COMPENSATED'):
                _verify_generation(package,new if state=='COMPLETE' else old)
            elif state in ('PREPARED','APPLYING','COMPENSATING','RECOVERY_REQUIRED'):
                try:
                    _known_generation(package,old,new)
                    _journal(marker,record,'COMPENSATING');_apply(package,marker,'before',old)
                    _journal(marker,record,'COMPENSATED')
                except BaseException:
                    _journal(marker,record,'RECOVERY_REQUIRED');raise
            else:raise RecoveryRequired('Unknown transaction phase')
    _finish(package,marker,record)
    return {'recovered':True,'state':record['state'],'database_restored':False}


def update(path,source=None):
    target,cfg=installation(path);source=_root(source or Path(__file__).parent);source_root=source.parent
    manifest=json.loads((source/'candidate-files.json').read_text(encoding='utf-8'))
    plan={};expected_hashes={}
    for name in FILES:
        file=_safe_path(source,name)
        if _digest(file)!=manifest.get(name):raise ValueError('Candidate hash mismatch')
        plan['ames-agent/'+name]=file;expected_hashes['ames-agent/'+name]=manifest[name]
    for rel in ROOT_FILES:
        file=_safe_path(source_root,rel)
        if not _regular(file):raise ValueError('Candidate workstation file missing')
        plan[rel]=file;expected_hashes[rel]=_digest(file)
    for rel in OPTIONAL_ROOT_FILES:
        file=_safe_path(source_root,rel)
        if _regular(file):plan[rel]=file;expected_hashes[rel]=_digest(file)
    extra_file=source_root/'LOCAL_BUNDLE_MANIFEST.json'
    extras=json.loads(extra_file.read_text())['files'] if extra_file.is_file() else {}
    for rel,expected in extras.items():
        _software(rel);file=_safe_path(source_root,rel)
        if _digest(file)!=expected:raise ValueError('Local asset hash mismatch')
        plan[rel]=file;expected_hashes[rel]=expected
    migration=source_root/'MIGRATION_MANIFEST.json'
    if migration.is_file():
        declared=json.loads(migration.read_text())['files']
        for rel,file in plan.items():
            if declared.get(rel)!=_digest(file):raise ValueError('Migration member hash mismatch')
    if extras:cfg['engine_dir']=str((target.parent/'factory-engine').resolve())
    cfg['allowed_origins']=list(dict.fromkeys([*(cfg.get('allowed_origins') or []),*ORIGINS]))
    # Config bytes are staged beside candidate input, never in the destination.
    import tempfile
    with tempfile.TemporaryDirectory(prefix='ames-updater-config-') as folder:
        config=Path(folder)/'config.json';_atomic_json(config,cfg);plan['ames-agent/config.json']=config
        expected_hashes['ames-agent/config.json']=_digest(config)
        return _transaction(target,plan,'update',expected_hashes)


def rollback(path,saved=None,*,legacy_proof=None):
    target,_=installation(path)
    if saved is None:raise LegacyBackupUnverified('Explicit verified backup required; hashless fallback is inspection-only')
    source,manifest=_load_backup(saved,legacy_proof=legacy_proof)
    if Path(manifest['target']).resolve()!=target:raise ValueError('Backup belongs to another installation')
    plan={**_restore_agent(target,source,manifest),**_restore_root(target.parent,source,manifest)}
    hashes={rel:(manifest['sha256'][('ames-agent/'+rel[len('ames-agent/'):]) if rel.startswith('ames-agent/') else 'root/'+rel] if src is not None else None) for rel,src in plan.items()}
    return _transaction(target,plan,'rollback',hashes)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('operation',choices=['update','rollback','recover','inspect-backup'])
    parser.add_argument('installation');parser.add_argument('--backup');parser.add_argument('--transaction');parser.add_argument('--legacy-proof')
    args=parser.parse_args()
    if args.operation=='update':result=update(args.installation)
    elif args.operation=='rollback':result=rollback(args.installation,args.backup,legacy_proof=args.legacy_proof)
    elif args.operation=='recover':result=recover(args.installation,transaction_id=args.transaction)
    else:result=inspect_backup(args.installation)
    print(json.dumps(result if isinstance(result,dict) else {'backup':str(result),'physical':'PENDING'}))
