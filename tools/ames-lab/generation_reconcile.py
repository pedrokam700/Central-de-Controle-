"""P08/G6 trusted closed synthetic capture decision. NEVER an operational updater.

C0/A/B are never opened by SQLite or changed. R1 is a NON-RUNNABLE proposal,
using CURRENT B data and A software-reference metadata, not an installation.
Unknown/new evidence is STOP, never a merge, deduplication or older DB restore.
"""
from __future__ import annotations
import ast
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import sqlite3
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
PROFILE=json.loads((HERE/'p08_profile.json').read_text(encoding='utf-8'))
P02=runpy.run_path(str(HERE/'synthetic_deidentify.py'))
DB=P02['DB'];ROLES=('C0','A','B')
FILES=P02['FILES']|{'generation.json','software.json','execution.json','sync.json'}
OPTIONAL=P02['OPTIONAL'];COLUMNS=P02['PROFILE']['columns']
copy_file=P02['_copy'];file_hash=P02['file_hash'];encoded=P02['encoded'];digest=P02['digest'];parse=P02['parse']


class Stop(Exception):pass


def _phase(name):pass  # Synthetic fault boundaries only; never CLI/env flags.
def _copy(src,dst):return copy_file(src,dst)
def _json(path):return parse(path.read_text(encoding='utf-8'))


def _root(value):
    root=Path(value)
    if not root.is_absolute() or '..' in root.parts or str(root).startswith(('\\\\','//')):raise Stop('SYNTHETIC_WORKSPACE_REQUIRED')
    for p in (root,*root.parents):P02['_plain'](p,True,metadata=False)
    if root.resolve()!=root or not re.fullmatch('P08-SYNTHETIC-[A-Za-z0-9_-]+',root.name):raise Stop('SYNTHETIC_WORKSPACE_REQUIRED')
    return root


def _tree(root,*,generation=False):
    P02['_plain'](root,True);out={};size=0
    allowed=FILES|OPTIONAL if generation else None
    dirs={p.as_posix() for name in FILES|OPTIONAL for p in Path(name).parents if str(p)!='.'}
    for parent,children,names in os.walk(root,followlinks=False):
        for name in children:
            p=Path(parent)/name;P02['_plain'](p,True)
            if generation and p.relative_to(root).as_posix() not in dirs:raise Stop('UNKNOWN_MEMBER')
        for name in names:
            p=Path(parent)/name;info=P02['_plain'](p);rel=p.relative_to(root).as_posix();size+=info.st_size
            if generation and rel not in allowed:raise Stop('UNKNOWN_MEMBER')
            if size>P02['MAX_BYTES']:raise Stop('CAPTURE_CAPACITY_UNVERIFIED')
            out[rel]=file_hash(p)
    if generation and (not FILES<=out.keys() or DB+'-shm' in out and DB+'-wal' not in out):raise Stop('INCOMPLETE_GENERATION')
    return out


def _write(path,value):
    with path.open('x',encoding='utf-8') as f:
        f.write(encoded(value));f.flush();os.fsync(f.fileno())
    path.chmod(0o600)


def _journal(root,record,state):
    next_record={**record,'state':state};tmp=root/'.p08-journal.pending'
    _write(tmp,next_record);os.replace(tmp,root/'.p08-journal.json');record.update(next_record)


def _receipt(decision,reason):
    return {'schema':'ames-p08-public-decision-v1','scope':'CLOSED_SYNTHETIC_CAPTURES_ONLY','decision':decision,'reason':reason,
            'start_allowed':False,'merge_performed':False,'physical':'PENDING',
            'compatibility_scope':PROFILE['compatibility_scope'] if decision=='R1' else None}


@contextmanager
def _lock(root,create=False):
    path=root/'.p08-lock'
    if create:
        with path.open('xb') as f:f.write(b'1');f.flush();os.fsync(f.fileno())
    P02['_plain'](path)
    with path.open('r+b') as f:
        if os.name=='nt':
            import msvcrt
            try:msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
            except OSError:raise Stop('ATTEMPT_ALREADY_ACTIVE') from None
            try:yield
            finally:f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
        else:
            import fcntl
            try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except OSError:raise Stop('ATTEMPT_ALREADY_ACTIVE') from None
            try:yield
            finally:fcntl.flock(f,fcntl.LOCK_UN)


def _input(root):
    P02['_plain'](root/'SYNTHETIC_ONLY.json');marker=_json(root/'SYNTHETIC_ONLY.json')
    if (set(marker)!={'schema','base_sha','scope','generations'} or marker['schema']!='ames-p08-synthetic-workspace-v1'
        or marker['base_sha']!=PROFILE['base_sha'] or marker['scope']!='SYNTHETIC_ONLY'
        or not isinstance(marker['generations'],dict) or set(marker['generations'])!=set(ROLES)):
        raise Stop('SYNTHETIC_PROVENANCE_REQUIRED')
    source=P02['PROFILE']['synthetic_provenance']['source_id'];trees={}
    for role in ROLES:
        folder=root/role;tree=_tree(folder,generation=True);g=_json(folder/'generation.json')
        if (set(g)!={'schema','role','generation_id','parent_generation','source_id','files'}
            or g['schema']!='ames-p08-synthetic-generation-v1' or g['role']!=role or g['generation_id']!='SYNTHETIC-'+role
            or g['parent_generation']!={'C0':None,'A':'SYNTHETIC-C0','B':'SYNTHETIC-A'}[role]):raise Stop('GENERATION_IDENTITY_CONFLICT')
        if g['source_id']!=source:raise Stop('SOURCE_CONFLICT')
        if tree['generation.json']!=marker['generations'][role] or g['files']!={k:v for k,v in tree.items() if k!='generation.json'}:
            raise Stop('GENERATION_HASH_MISMATCH')
        # These fake private identities are a deliberate synthetic provenance gate.
        fixed=P02['PROFILE']['synthetic_provenance']['fixed_files']
        for name,sha in fixed.items():
            if role=='B' and name in {'ames-agent/config.json','logs/agent.log','factory-engine/config/settings.json'}:continue
            if tree.get(name)!=sha:raise Stop('SYNTHETIC_PROVENANCE_REQUIRED')
        trees[role]=tree
    return {'marker_sha256':file_hash(root/'SYNTHETIC_ONLY.json'),'trees':trees}


def _software(folder,role):
    actual=_json(folder/'software.json')
    expected={'schema':'ames-p08-passive-software-v1','reference_sha':PROFILE['base_sha'] if role=='B' else PROFILE['a_reference_sha'],
              'canonical_reader_sha256':PROFILE['canonical_reader_sha256'],'runnable':False}
    if actual!=expected or actual.get('runnable') is not False:raise Stop('SOFTWARE_INCOMPATIBLE')


def _logical(folder,work):
    if (folder/(DB+'-wal')).exists():
        try:P02['_check_wal'](folder/(DB+'-wal'))
        except (P02['Refused'],ValueError):raise Stop('WAL_UNVERIFIED') from None
    try:con=P02['_logical'](folder,work)
    except (P02['Refused'],sqlite3.Error):raise Stop('DATABASE_UNVERIFIED') from None
    try:
        schema=P02['_schema'](con)
        base=[r for r in schema if r[1]!=PROFILE['index_name']]
        approved=[r for r in schema if r[1]==PROFILE['index_name']]
        if digest(base)!=P02['PROFILE']['ddl_sha256'] or approved not in ([],[['index',PROFILE['index_name'],'pcba_history',PROFILE['index_sql']]]):raise Stop('SCHEMA_INCOMPATIBLE')
        if con.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or con.execute('PRAGMA foreign_key_check').fetchall():raise Stop('DATABASE_UNVERIFIED')
        rows={table:[list(r) for r in con.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in COLUMNS}
        rows['sqlite_sequence']=[list(r) for r in con.execute('SELECT * FROM sqlite_sequence ORDER BY rowid')]
        meta=dict(rows['schema_meta'])
        if meta!={'schema_version':'0.5','ames_source_id':P02['PROFILE']['synthetic_provenance']['source_id']}:raise Stop('SOURCE_CONFLICT')
        _revisions(rows,folder)
        return {'schema':schema,'rows':rows}
    except sqlite3.Error:raise Stop('DATABASE_UNVERIFIED') from None
    finally:con.close()


def _revisions(rows,folder):
    source=dict(rows['schema_meta'])['ames_source_id'];refs=set()
    for sid,line,revision,epoch,sha,text in rows['mes_revisions']:
        body=parse(text)
        if (body.get('schema')!='central-ames-v2' or body.get('source_id')!=source or body.get('line_id')!=line
            or str(body.get('snapshot_id'))!=str(sid) or body.get('snapshot_revision')!=revision or body.get('content_hash')!=sha):
            raise Stop('REVISION_CONFLICT')
        if not isinstance(body.get('datasets'),dict):raise Stop('REVISION_CONFLICT')
        for name in ('defects','pcba_history','material_reuse','history_contexts','process_timeline'):
            if not isinstance(body['datasets'].get(name),list):raise Stop('REVISION_CONFLICT')
            for item in body['datasets'][name]:
                if item.get('line_id')!=line or str(item.get('snapshot_id'))!=str(sid) or item.get('snapshot_revision')!=revision:raise Stop('REVISION_CONFLICT')
        refs.add((sid,line,revision,sha))
    for row in rows['repair_row_versions_3012']:
        if hashlib.sha256(row[3].encode()).hexdigest()!=row[2]:raise Stop('REVISION_CONFLICT')
    checkpoint=_json(folder/P02['CHECKPOINT'])
    if (checkpoint.get('source_id')!=source or checkpoint.get('status')!='COMPLETE'
        or (checkpoint.get('snapshot_id'),checkpoint.get('line'),checkpoint.get('revision'),checkpoint.get('content_hash')) not in refs):
        raise Stop('CHECKPOINT_CONFLICT')


def _pending(folder,rows):
    browser=_json(folder/'browser/storage.json')
    if (set(browser)!={'auth','outbox'} or browser['auth']!='SYNTHETIC-FIREBASE-AUTH'
        or type(browser['outbox']) is not list or browser['outbox']):raise Stop('OUTBOX_UNVERIFIED')
    sync=_json(folder/'sync.json')
    if (set(sync)!={'schema','source_id','checked','complete','pending'} or sync['schema']!='ames-p08-synthetic-sync-v1'
        or sync['source_id']!=dict(rows['schema_meta'])['ames_source_id'] or sync['checked'] is not True
        or sync['complete'] is not True or sync['pending'] is not False):raise Stop('SYNC_UNVERIFIED')
    if (any(r[1] for r in rows['monitor_profiles']) or any(r[3] in ('queued','running') for r in rows['jobs'])
        or any(r[8]=='running' for r in rows['repair_query_runs_3012'])):raise Stop('WORK_PENDING')


def _execution(folder):
    execution=_json(folder/'execution.json')
    if (set(execution)!={'schema','entered','completed','steps'} or execution['schema']!='ames-p08-synthetic-execution-v1'
        or type(execution['entered']) is not bool or execution['completed'] is not True
        or not isinstance(execution['steps'],list)):raise Stop('EXECUTION_UNVERIFIED')
    return execution


def _external_equal(trees,left,right,*,ignore=()):
    drop={'generation.json','software.json',DB,DB+'-wal',DB+'-shm',*ignore}
    return {k:v for k,v in trees[left].items() if k not in drop}=={k:v for k,v in trees[right].items() if k not in drop}


def _replay(vault,private):
    expected=private/'expected.sqlite3';_copy(vault/'A'/DB,expected)
    con=sqlite3.connect(expected)
    try:
        con.execute('PRAGMA trusted_schema=OFF');con.execute(PROFILE['index_sql'])
        con.execute('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',PROFILE['audit_row']);con.commit()
    finally:con.close()
    if file_hash(expected)!=file_hash(vault/'B'/DB):raise Stop('TECHNICAL_REPLAY_MISMATCH')


def _reader_probe(path,rows):
    # Exact approved read-only FUNCTION, no module/bootstrap import. Whole old
    # runtime/GUI/startup compatibility is explicitly NOT inferred from this.
    source=ROOT/'ames/agent/canonical.py'
    if file_hash(source)!=PROFILE['canonical_reader_sha256']:raise Stop('SOFTWARE_INCOMPATIBLE')
    tree=ast.parse(source.read_text(encoding='utf-8'))
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='read_revision']
    if len(nodes)!=1:raise Stop('SOFTWARE_INCOMPATIBLE')
    namespace={'json':json,'LINES':('TAN10101','TAN10102','TAN10103')}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<frozen-approved-read_revision>','exec'),namespace)
    class ReadOnlyCapture:
        @contextmanager
        def connect(self):
            con=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True);con.row_factory=sqlite3.Row
            try:con.execute('PRAGMA query_only=ON');yield con
            finally:con.close()
    reader=namespace['read_revision'];store=ReadOnlyCapture()
    for sid,line,revision,epoch,sha,text in rows['mes_revisions']:
        if reader(store,sid,line,revision)!=parse(text):raise Stop('OLD_READER_INCOMPATIBLE')
    return {'schema':'ames-p08-restricted-reader-proof-v1','reader_sha256':PROFILE['canonical_reader_sha256'],
            'revisions_read':len(rows['mes_revisions']),'scope':PROFILE['compatibility_scope'],'startup_proven':False}


def _decision(root,vault,private,inputs,data):
    trees=inputs['trees']
    if data['C0']!=data['A'] or trees['C0']!={**trees['A'],'generation.json':trees['C0']['generation.json']}:
        raise Stop('C0_A_DIVERGENCE')
    execution=_execution(vault/'B')
    if not execution['entered']:
        if execution['steps'] or data['B']!=data['A'] or not _external_equal(trees,'A','B') or trees['A'].get(DB)!=trees['B'].get(DB) or any(name in trees['B'] for name in OPTIONAL):
            raise Stop('UNEXECUTED_STATE_CHANGED')
        return _receipt('R0','NO_CANDIDATE_EXECUTION')
    if any(name in trees[role] for name in OPTIONAL for role in ROLES):raise Stop('WAL_REQUIRES_SUPERVISED_REVIEW')
    if not _external_equal(trees,'A','B',ignore={'execution.json'}):raise Stop('EXTERNAL_STATE_CHANGED')
    if execution['steps']!=[PROFILE['technical_step']]:raise Stop('EXECUTION_UNVERIFIED')
    expected_rows={table:[list(r) for r in values] for table,values in data['A']['rows'].items()}
    expected_rows['audit_events'].append(PROFILE['audit_row'])
    for row in expected_rows['sqlite_sequence']:
        if row[0]=='audit_events':row[1]=2
    if data['B']['rows']!=expected_rows:
        # A declared step with NO effects is an unsupported technical claim,
        # while any extra/mutated business evidence is R2 regardless of counts.
        if data['B']==data['A']:raise Stop('TECHNICAL_REPLAY_MISMATCH')
        raise Stop('NEW_OR_CHANGED_DATABASE')
    _replay(vault,private)
    proof=_reader_probe(private/'work/B/logical.sqlite3',data['B']['rows']);_write(private/'reader-proof.json',proof)
    return _receipt('R1','TECHNICAL_ONLY_PASSIVE_PREPARATION')


def _unchanged(root,inputs):
    if _input(root)!=inputs:raise Stop('SOURCE_CHANGED')
    vault=root/'.p08-private/vault'
    if {role:_tree(vault/role,generation=True) for role in ROLES}!=inputs['trees']:raise Stop('CAPTURE_CORRUPT')


def _prepare_target(root,private,inputs,record):
    stage=private/'target-stage';stage.mkdir(mode=0o700)
    vault=private/'vault'
    names={}
    for name in inputs['trees']['B']:
        if name=='generation.json':continue
        source=vault/('A' if name=='software.json' else 'B')/name
        _copy(source,stage/name);names[name]=file_hash(stage/name)
    _copy(vault/'B/generation.json',stage/'input-B-generation.json');names['input-B-generation.json']=file_hash(stage/'input-B-generation.json')
    _write(stage/'LAB_ONLY.json',{'schema':'ames-p08-passive-return-v1','data_generation':'SYNTHETIC-B','software_generation':'SYNTHETIC-A',
           'start_allowed':False,'deployable_installation':False,'compatibility_scope':PROFILE['compatibility_scope']})
    names['LAB_ONLY.json']=file_hash(stage/'LAB_ONLY.json')
    _write(stage/'target-manifest.json',{'schema':'ames-p08-passive-target-v1','files':names})
    record['target_manifest_sha256']=file_hash(stage/'target-manifest.json')
    record['reader_proof_sha256']=file_hash(private/'reader-proof.json')
    _unchanged(root,inputs);_journal(root,record,'PREPARED');_phase('before_target')
    try:(root/'return-target').mkdir(mode=0o700)
    except FileExistsError:raise Stop('DESTINATION_EXISTS') from None
    for name in (*names,'target-manifest.json'):
        _copy(stage/name,root/'return-target'/name);_phase('target_member')
    _phase('after_target')


def _check_target(root,record,inputs):
    _unchanged(root,inputs);target=root/'return-target';manifest=target/'target-manifest.json'
    P02['_plain'](manifest)
    if file_hash(manifest)!=record['target_manifest_sha256']:raise Stop('TARGET_UNVERIFIED')
    m=_json(manifest)
    expected={k:v for k,v in _tree(target).items() if k!='target-manifest.json'}
    if m!={'schema':'ames-p08-passive-target-v1','files':expected}:raise Stop('TARGET_UNVERIFIED')
    meta=_json(target/'LAB_ONLY.json')
    if (meta!={'schema':'ames-p08-passive-return-v1','data_generation':'SYNTHETIC-B','software_generation':'SYNTHETIC-A',
              'start_allowed':False,'deployable_installation':False,'compatibility_scope':PROFILE['compatibility_scope']}
        or meta['start_allowed'] is not False or meta['deployable_installation'] is not False):raise Stop('TARGET_UNVERIFIED')
    proof=root/'.p08-private/reader-proof.json'
    if file_hash(proof)!=record['reader_proof_sha256']:raise Stop('READER_PROOF_UNVERIFIED')
    # Exact CURRENT B bytes, except software-reference metadata from A.
    for name,sha in inputs['trees']['B'].items():
        if name=='generation.json':continue
        wanted=inputs['trees']['A'][name] if name=='software.json' else sha
        if expected.get(name)!=wanted:raise Stop('TARGET_UNVERIFIED')


def _finish(root,record,receipt):
    path=root/'decision.json'
    if path.exists():
        P02['_plain'](path)
        if _json(path)!=receipt:raise Stop('DECISION_CONFLICT')
    else:_write(path,receipt)
    record['receipt_sha256']=file_hash(path);_journal(root,record,'COMPLETE')
    return receipt


def _attempt(root):
    names={p.name for p in root.iterdir()}
    if '.p08-claim.json' in names:raise Stop('PENDING_OR_EXISTING_ATTEMPT')
    if 'return-target' in names:raise Stop('DESTINATION_EXISTS')
    if names!={'C0','A','B','SYNTHETIC_ONLY.json'}:raise Stop('UNKNOWN_MEMBER')
    inputs=_input(root)
    if file_hash(HERE/'synthetic_deidentify.py')!=PROFILE['p02_helper_sha256']:raise Stop('HELPER_INCOMPATIBLE')
    record={'schema':'ames-p08-private-journal-v1','operation_id':secrets.token_hex(16),'inputs':inputs,
            'profile_sha256':file_hash(HERE/'p08_profile.json'),'tool_sha256':file_hash(Path(__file__))}
    try:_write(root/'.p08-claim.json',{'schema':'ames-p08-exclusive-claim-v1','operation_id':record['operation_id']})
    except FileExistsError:raise Stop('PENDING_OR_EXISTING_ATTEMPT') from None
    with _lock(root,True):
        _journal(root,record,'PREPARING')
        private=root/'.p08-private';private.mkdir(mode=0o700);vault=private/'vault';vault.mkdir(mode=0o700)
        for role in ROLES:
            (vault/role).mkdir(mode=0o700)
            for name in inputs['trees'][role]:_copy(root/role/name,vault/role/name)
        _unchanged(root,inputs);_write(private/'captures.json',inputs);P02['_seal'](vault)
        record['captures_sha256']=file_hash(private/'captures.json');_journal(root,record,'CAPTURED');_phase('after_capture')
        (private/'work').mkdir(mode=0o700);data={}
        try:
            for role in ROLES:
                _software(vault/role,role);data[role]=_logical(vault/role,private/'work'/role);_pending(vault/role,data[role]['rows'])
            receipt=_decision(root,vault,private,inputs,data)
        except Stop as exc:
            record['reason']=str(exc);_unchanged(root,inputs);return _finish(root,record,_receipt('R2',str(exc)))
        _unchanged(root,inputs)
        if receipt['decision']=='R1':_prepare_target(root,private,inputs,record);_check_target(root,record,inputs)
        return _finish(root,record,receipt)


def reconcile(workspace):
    try:return _attempt(_root(workspace))
    except Stop as exc:return _receipt('R2',str(exc))
    except P02['Refused'] as exc:return _receipt('R2',str(exc))
    except (OSError,ValueError,TypeError,KeyError,sqlite3.Error,RuntimeError):return _receipt('R2','IO_OR_UNVERIFIED_STATE')


def _owned(root):
    for name in ('.p08-claim.json','.p08-journal.json'):P02['_plain'](root/name)
    claim=_json(root/'.p08-claim.json');record=_json(root/'.p08-journal.json')
    if (claim!={'schema':'ames-p08-exclusive-claim-v1','operation_id':record.get('operation_id')}
        or not re.fullmatch('[0-9a-f]{32}',record.get('operation_id','')) or record.get('schema')!='ames-p08-private-journal-v1'
        or record.get('profile_sha256')!=file_hash(HERE/'p08_profile.json') or record.get('tool_sha256')!=file_hash(Path(__file__))):raise Stop('JOURNAL_UNVERIFIED')
    captures=root/'.p08-private/captures.json'
    if file_hash(captures)!=record['captures_sha256'] or _json(captures)!=record['inputs']:raise Stop('CAPTURE_CORRUPT')
    return record


def verify_target(workspace):
    try:
        root=_root(workspace);record=_owned(root)
        if record.get('state')!='COMPLETE':return False
        decision=root/'decision.json';P02['_plain'](decision)
        if file_hash(decision)!=record['receipt_sha256'] or _json(decision)!=_receipt('R1','TECHNICAL_ONLY_PASSIVE_PREPARATION'):return False
        _check_target(root,record,record['inputs']);return True
    except (Stop,P02['Refused'],OSError,ValueError,KeyError,TypeError,sqlite3.Error):return False


def recover(workspace):
    try:
        root=_root(workspace)
        with _lock(root):
            record=_owned(root);_unchanged(root,record['inputs'])
            if record['state']=='COMPLETE':
                if verify_target(root):return _receipt('R1','TECHNICAL_ONLY_PASSIVE_PREPARATION')
                raise Stop('SUPERVISED_RECOVERY_REQUIRED')
            if record['state']!='PREPARED':raise Stop('SUPERVISED_RECOVERY_REQUIRED')
            _check_target(root,record,record['inputs'])
            # Explicit finalization only: NEVER copy data/code, restore or retry.
            return _finish(root,record,_receipt('R1','TECHNICAL_ONLY_PASSIVE_PREPARATION'))
    except Stop as exc:return _receipt('R2',str(exc))
    except (P02['Refused'],OSError,ValueError,KeyError,TypeError,sqlite3.Error):return _receipt('R2','SUPERVISED_RECOVERY_REQUIRED')


def main():
    if len(sys.argv)!=4 or sys.argv[1] not in ('decide','recover') or sys.argv[2]!='--synthetic-workspace':return 2
    result=(reconcile if sys.argv[1]=='decide' else recover)(sys.argv[3]);print(encoded(result))
    return 3 if result['decision']=='R2' else 0


if __name__=='__main__':raise SystemExit(main())
