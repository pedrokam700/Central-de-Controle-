"""P02 SYNTHETIC profile rehearsal. No real-installation mode, agent or network.

A sealed private byte image is NOT a WORM volume or external maintenance lease.
Only an explicitly declared synthetic workspace and reviewed schema are accepted.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import stat
import struct
import sys
from datetime import date,datetime,timedelta

PROFILE=json.loads(Path(__file__).with_name('p02_profile.json').read_text(encoding='utf-8'))
DB='ames-agent/data/ames_local.sqlite3'
CHECKPOINT='ames-agent/data/checkpoint.json'
FILES={DB,CHECKPOINT,'ames-agent/config.json','ames-agent/data/local_agent_token',
       'ames-agent/data/at_user_profiles.json','ames-agent/data/at_admin_auth.json',
       'factory-engine/config/settings.json','factory-engine/session.json',
       'chrome/Default/Preferences','browser/storage.json','logs/agent.log'}
OPTIONAL={DB+'-wal',DB+'-shm'}
MAX_BYTES=32*1024*1024
HASH_KEYS={'content_hash','parent_hash','parent_content_hash'}
PRODUCT_KEYS={'model','product_model','product','product_candidates','Modelo','binding_product'}
SERIAL_LISTS={'PCBAs desvinculadas','PCBAs desvinculadas com mesma falha','PCBAs desvinculadas com mesma família'}
FREE_TEXT={'body','title','notes','message','error','repair_comment','Repair Comment atual'}


class Refused(Exception):pass


def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(value):return hashlib.sha256(encoded(value).encode()).hexdigest()
def file_hash(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def _phase(name):pass  # Test injection only, never a CLI/env option.


def parse(text):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result:raise Refused('DUPLICATE_JSON_KEY')
            result[key]=value
        return result
    return json.loads(text,object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(Refused('NONFINITE_JSON')))


def _write(path,value):
    with path.open('x',encoding='utf-8') as stream:
        json.dump(value,stream,ensure_ascii=False,sort_keys=True,allow_nan=False)
        stream.flush();os.fsync(stream.fileno())
    path.chmod(0o600)


def _journal(root,state,ready_sha256=None):
    temporary=root/'.p02-journal.tmp'
    _write(temporary,{'schema':'p02-private-journal-v1','state':state,'ready_sha256':ready_sha256})
    os.replace(temporary,root/'.p02-journal.json')


def _metadata(path,info):
    if hasattr(os,'listxattr') and os.listxattr(path,follow_symlinks=False):
        raise Refused('UNSUPPORTED_EXTENDED_METADATA')
    if os.name=='nt':
        # Read-only enumeration on explicit fixture paths; no PowerShell/process.
        import ctypes
        from ctypes import wintypes
        class Stream(ctypes.Structure):
            _fields_=[('size',ctypes.c_longlong),('name',wintypes.WCHAR*296)]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        first=kernel.FindFirstStreamW;first.argtypes=[wintypes.LPCWSTR,ctypes.c_int,ctypes.POINTER(Stream),wintypes.DWORD];first.restype=wintypes.HANDLE
        next_stream=kernel.FindNextStreamW;next_stream.argtypes=[wintypes.HANDLE,ctypes.POINTER(Stream)];next_stream.restype=wintypes.BOOL
        close=kernel.FindClose;close.argtypes=[wintypes.HANDLE];close.restype=wintypes.BOOL
        data=Stream();handle=first(str(path),0,ctypes.byref(data),0)
        if handle==ctypes.c_void_p(-1).value:
            if ctypes.get_last_error()==38:return
            raise Refused('FILESYSTEM_STREAMS_UNVERIFIED')
        try:
            while True:
                if data.name!='::$DATA':raise Refused('UNSUPPORTED_ALTERNATE_STREAM')
                if not next_stream(handle,ctypes.byref(data)):
                    if ctypes.get_last_error()!=38:raise Refused('FILESYSTEM_STREAMS_UNVERIFIED')
                    break
        finally:close(handle)


def _plain(path,directory=False,metadata=True):
    info=path.lstat()
    if (getattr(info,'st_file_attributes',0)&0x400 or
        not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)) or
        (not directory and info.st_nlink!=1)):
        raise Refused('UNTRUSTED_LINK_OR_MEMBER')
    if metadata:_metadata(path,info)
    return info


def _root(value):
    root=Path(value)
    if not root.is_absolute() or '..' in root.parts or str(root).startswith(('\\\\','//')):
        raise Refused('ABSOLUTE_LOCAL_WORKSPACE_REQUIRED')
    for p in (root,*root.parents):_plain(p,True,metadata=False)
    if root.resolve()!=root or not re.fullmatch(r'P02-SYNTHETIC-[A-Za-z0-9_-]+',root.name):
        raise Refused('SYNTHETIC_WORKSPACE_ONLY')
    return root


def _inventory(source):
    _plain(source,True)
    result={};total=0
    expected_dirs={str(Path(name).parent).replace('\\','/') for name in FILES}
    expected_dirs|={str(p).replace('\\','/') for name in FILES for p in Path(name).parents if str(p)!='.'}
    for parent,dirs,names in os.walk(source,followlinks=False):
        for name in dirs:
            child=Path(parent)/name;_plain(child,True)
            if child.relative_to(source).as_posix() not in expected_dirs:raise Refused('UNKNOWN_DIRECTORY')
        for name in names:
            path=Path(parent)/name;relative=path.relative_to(source).as_posix()
            info=_plain(path);total+=info.st_size
            if relative not in FILES|OPTIONAL or total>MAX_BYTES:raise Refused('UNKNOWN_FILE_OR_CAPACITY')
            result[relative]=file_hash(path)
    if not FILES<=result.keys() or (DB+'-shm' in result and DB+'-wal' not in result):
        raise Refused('INCOMPLETE_SOURCE')
    return result


def _check_wal(path):
    data=path.read_bytes()
    if len(data)<32:raise Refused('WAL_UNVERIFIED')
    magic,version,page_size=struct.unpack('>III',data[:12])
    if magic not in (0x377f0682,0x377f0683) or version!=3007000 or page_size not in {2**n for n in range(9,17)}:
        raise Refused('WAL_UNVERIFIED')
    if (len(data)-32)%(24+page_size):raise Refused('WAL_TRUNCATED')
    endian='<' if magic==0x377f0682 else '>'
    def checksum(block,state):
        first,second=state;words=struct.unpack(endian+str(len(block)//4)+'I',block)
        for i in range(0,len(words),2):
            first=(first+words[i]+second)&0xffffffff;second=(second+words[i+1]+first)&0xffffffff
        return first,second
    state=checksum(data[:24],(0,0))
    if state!=struct.unpack('>II',data[24:32]):raise Refused('WAL_HEADER_CHECKSUM')
    commits=0
    for start in range(32,len(data),24+page_size):
        header=data[start:start+24];page=data[start+24:start+24+page_size]
        if header[8:16]!=data[16:24] or struct.unpack('>I',header[:4])[0]==0:raise Refused('WAL_FRAME_IDENTITY')
        state=checksum(header[:8]+page,state)
        if state!=struct.unpack('>II',header[16:24]):raise Refused('WAL_FRAME_CHECKSUM')
        commits+=bool(struct.unpack('>I',header[4:8])[0])
    if not commits:raise Refused('WAL_COMMIT_UNVERIFIED')


def _copy(source,target):
    target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with source.open('rb') as reader,target.open('xb') as writer:
        shutil.copyfileobj(reader,writer);writer.flush();os.fsync(writer.fileno())
    target.chmod(0o600)
    if file_hash(source)!=file_hash(target):raise Refused('COPY_MISMATCH')


def _seal(master):
    for path in master.rglob('*'):
        if path.is_file():path.chmod(0o400)
    for path in sorted([p for p in master.rglob('*') if p.is_dir()],reverse=True):path.chmod(0o500)
    master.chmod(0o500)


def _logical(master,work):
    work.mkdir(mode=0o700)
    for suffix in ('','-wal','-shm'):
        source=master/(DB+suffix)
        if source.exists():_copy(source,work/('input.sqlite3'+suffix))
    src=dest=con=None
    try:
        src=sqlite3.connect(work/'input.sqlite3');dest=sqlite3.connect(work/'logical.sqlite3')
        src.backup(dest);dest.commit()
        con=sqlite3.connect(work/'logical.sqlite3');con.execute('PRAGMA trusted_schema=OFF')
        return con
    except sqlite3.Error:
        if con is not None:con.close()
        raise Refused('DATABASE_MATERIALIZATION_FAILED') from None
    finally:
        if dest is not None:dest.close()
        if src is not None:src.close()


def _schema(con):
    return [list(r) for r in con.execute('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name')]


def _read(con):
    schema=_schema(con)
    if digest(schema)!=PROFILE['ddl_sha256']:raise Refused('UNREVIEWED_SCHEMA')
    if con.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or con.execute('PRAGMA foreign_key_check').fetchall():raise Refused('DATABASE_INTEGRITY')
    rows={table:[list(r) for r in con.execute('SELECT * FROM "'+table+'" ORDER BY rowid')]
          for table in PROFILE['columns']}
    rows['sqlite_sequence']=[list(r) for r in con.execute('SELECT * FROM sqlite_sequence ORDER BY rowid')]
    return schema,rows


class Mapper:
    def __init__(self,source):
        self.source=source;self.new_source='LAB-P02-'+secrets.token_hex(16)
        self.secret=secrets.token_bytes(32);self.mapping={};self.inverse={};self.hashes={}
        self.keys=set(PROFILE['json_keys']);self.dynamic=set()
        self.public_literals={v for values in PROFILE['enums'].values() for v in values}

    def record(self,old,new):
        if old==new:return new  # Public control literals are not identities.
        if old in self.mapping and self.mapping[old]!=new:raise Refused('AMBIGUOUS_FIELD_ROLE')
        if new in self.inverse and self.inverse[new]!=old:raise Refused('PSEUDONYM_COLLISION')
        self.mapping[old]=new;self.inverse[new]=old
        return new

    def opaque(self,value):
        stripped=value.strip()
        if stripped in self.public_literals:raise Refused('IDENTITY_OVERLAPS_PUBLIC_LITERAL')
        token=hmac.new(self.secret,stripped.casefold().encode(),'sha256').hexdigest()[:24]
        prefix='BRM-LAB-V-' if stripped.upper().startswith('BRM') else 'LAB-V-'
        mapped=prefix+token
        # Preserve equality under the existing strip/upper identity convention.
        # Ambiguous mixed-case aliases are refused by record's injectivity check.
        if stripped.isupper():mapped=mapped.upper()
        elif stripped.islower():mapped=mapped.lower()
        before=value[:len(value)-len(value.lstrip())];after=value[len(value.rstrip()):]
        return self.record(value,before+mapped+after)

    def date(self,value):
        match=re.fullmatch(r'(\d{4}-\d{2}-\d{2})((?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?)',value)
        if not match:raise Refused('UNKNOWN_DATE_FORMAT')
        datetime.fromisoformat(value.replace('Z','+00:00'))
        first=date.fromisoformat(match[1])
        if first.year<2020 or first.year>2030:raise Refused('DATE_PROFILE_UNSUPPORTED')
        # Preserve lexical precision, offset, ordering and operational clock.
        return self.record(value,(first+timedelta(days=364)).isoformat()+match[2])

    def scalar(self,value,key,path,hash_pending=False):
        if not isinstance(value,str):
            if value is None or type(value) in (int,float,bool):return value
            raise Refused('UNKNOWN_VALUE_TYPE')
        if not value:return value
        if value==self.source:return self.record(value,self.new_source)
        if key=='source_id':raise Refused('CONTRADICTORY_SOURCE')
        if value in self.hashes:return self.record(value,self.hashes[value])
        if key in HASH_KEYS:
            if hash_pending:return value
            raise Refused('UNBOUND_HASH_REFERENCE')
        if key in FREE_TEXT:
            # Exact text from the reviewed public catalog carries no free-text
            # identity; any extra suffix/name/address becomes opaque as a whole.
            return value if value in self.public_literals else self.opaque(value)
        if any(field in path for field in ('source_fields','operator_fields')):
            if value not in self.keys:raise Refused('UNREVIEWED_PROVENANCE_FIELD')
            return value
        if key=='schema' and value=='central-ames-v2':return self.record(value,'central-ames-lab-only-v1')
        if re.fullmatch(r'TAN1010[123]',value):
            return self.record(value,'LAB-LINE-'+value[-1])
        if key in PRODUCT_KEYS:
            number=int(hmac.new(self.secret,value.encode(),'sha256').hexdigest()[:8],16)
            return self.record(value,'CPH9'+str(number).zfill(10))
        if key in SERIAL_LISTS:
            return self.record(value,' | '.join(self.opaque(v) for v in value.split(' | ')))
        if re.search(r'hist_seq|Hist Seq|snapshot_id|^revision$|^snapshot_revision$',key):
            if not value.isdigit():raise Refused('UNKNOWN_ORDINAL')
            return self.record(value,value)
        if key=='Ciclos de uso PCBA 3074':
            # Closed rendered timeline: no free text, names or addresses admitted.
            if not re.fullmatch(r'(?:\d+º: \d{4}-\d{2}-\d{2}T[\d:]+ UTC -> (?:\d{4}-\d{2}-\d{2}T[\d:]+ UTC|ATIVO) \[(?:DESVINCULADA|VINCULADA AGORA)\]\n?)+',value):
                raise Refused('UNREVIEWED_RENDERED_HISTORY')
            transformed=re.sub(r'\d{4}-\d{2}-\d{2}',lambda m:(date.fromisoformat(m[0])+timedelta(days=364)).isoformat(),value)
            return self.record(value,transformed)
        if re.search(r'time|_at$|date|Time',key) and re.match(r'^\d{4}-\d{2}-\d{2}(?:$|[ T])',value):return self.date(value)
        if key in PROFILE['enums']:
            if value not in PROFILE['enums'][key]:raise Refused('UNREVIEWED_ENUM_VALUE')
            return self.record(value,value)
        return self.opaque(value)

    def walk(self,value,key='',path=(),hash_pending=False):
        if isinstance(value,dict):
            result={}
            for field,child in value.items():
                if field not in self.keys:
                    if field not in self.dynamic:raise Refused('UNKNOWN_JSON_METADATA')
                    renamed=self.scalar(field,'identity',path,hash_pending)
                else:renamed=field
                if renamed in result:raise Refused('JSON_KEY_COLLISION')
                result[renamed]=self.walk(child,field,(*path,key),hash_pending)
            return result
        if isinstance(value,list):
            if key=='_failure_key':
                if len(value)!=3:raise Refused('UNKNOWN_FAILURE_TUPLE')
                return [self.walk(v,k,(*path,key),hash_pending) for v,k in zip(value,('pcba_sn','defect_time','defect_code'))]
            return [self.walk(v,key,(*path,key),hash_pending) for v in value]
        if isinstance(value,str) and (key.endswith('_json') or key=='payload'):
            child=parse(value)
            if not isinstance(child,(dict,list)):raise Refused('UNEXPECTED_JSON_VALUE')
            return encoded(self.walk(child,key.removesuffix('_json'),path,hash_pending))
        return self.scalar(value,key,path,hash_pending)


def _normalize(value,inverse=None):
    inverse=inverse or {}
    if isinstance(value,list):return [_normalize(v,inverse) for v in value]
    if isinstance(value,dict):return {inverse.get(k,k):_normalize(v,inverse) for k,v in value.items()}
    if isinstance(value,str):
        if value in inverse:return inverse[value]
        try:
            parsed=parse(value)
            if isinstance(parsed,(dict,list)):return _normalize(parsed,inverse)
        except (ValueError,Refused):pass
    return value


def _transform(rows,source):
    mapper=Mapper(source)
    for table,columns in PROFILE['columns'].items():
        for row in rows[table]:
            for key,value in zip(columns,row):
                if isinstance(value,str) and re.search(r'(?:_key$|_id$|_sn$|pcba$|^doc_id$)',key):
                    mapper.dynamic.add(value)
    mapper.dynamic.discard(source)
    # 3012 immutable row versions have their own hash domain. They are not
    # canonical snapshot parents; recompute their actual transformed row JSON.
    for row in rows['repair_row_versions_3012']:
        body=parse(row[3])
        if hashlib.sha256(row[3].encode()).hexdigest()!=row[2]:raise Refused('REPAIR_REVISION_HASH_CONFLICT')
        mapper.hashes[row[2]]=digest(mapper.walk(body,hash_pending=True))
    # Compute all LAB revision hashes before transforming references/checkpoints.
    revision_columns=PROFILE['columns']['mes_revisions']
    pending=list(rows['mes_revisions'])
    known={r[revision_columns.index('content_hash')] for r in pending}
    while pending:
        progressed=False
        for row in pending[:]:
            body=parse(row[revision_columns.index('payload')]);old_hash=body.pop('content_hash')
            if old_hash!=row[revision_columns.index('content_hash')]:raise Refused('REVISION_HASH_COLUMN_CONFLICT')
            def references(v):
                if isinstance(v,dict):
                    return {x for k,x in v.items() if k in HASH_KEYS and isinstance(x,str)}|set().union(*(references(x) for x in v.values()),set())
                if isinstance(v,list):return set().union(*(references(x) for x in v),set())
                return set()
            deps=references(body)
            if not deps<=known:raise Refused('UNBOUND_REVISION_PARENT')
            if not deps<=mapper.hashes.keys():continue
            transformed=mapper.walk(body,hash_pending=True)
            mapper.hashes[old_hash]=digest(transformed)
            pending.remove(row);progressed=True
        if not progressed:raise Refused('REVISION_REFERENCE_CYCLE')
    output={}
    for table,table_rows in rows.items():
        columns=PROFILE['columns'][table] if table!='sqlite_sequence' else ['name','seq']
        output[table]=[]
        for row in table_rows:
            transformed=[]
            for key,value in zip(columns,row):
                if table=='schema_meta' and row[0]=='schema_version':new=value
                elif table=='schema_meta' and key=='key':new=value
                elif table=='sqlite_sequence' and key=='name':new=value
                elif value is not None and (key.endswith('_json') or (table=='mes_revisions' and key=='payload')):
                    parsed=parse(value)
                    new=encoded(mapper.walk(parsed,key.removesuffix('_json')))
                else:new=mapper.walk(value,key)
                transformed.append(new)
            output[table].append(transformed)
    if _normalize(output,mapper.inverse)!=_normalize(rows):raise Refused('RELATIONAL_GRAPH_MISMATCH')
    return mapper,output


def _new_database(path,schema,rows):
    con=sqlite3.connect(path)
    try:
        con.execute('PRAGMA journal_mode=DELETE');con.execute('PRAGMA foreign_keys=OFF');con.execute('PRAGMA application_id=1347375665')
        for typ,name,table,sql in schema:
            if typ=='table' and name!='sqlite_sequence':con.execute(sql)
        for table,values in rows.items():
            if table=='sqlite_sequence':con.execute('DELETE FROM sqlite_sequence')
            if values:con.executemany('INSERT INTO "'+table+'" VALUES('+','.join('?'*len(values[0]))+')',values)
        for typ,name,table,sql in schema:
            if typ!='table':con.execute(sql)
        con.commit()
        if con.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or con.execute('PRAGMA foreign_key_check').fetchall():raise Refused('DERIVED_DATABASE_INTEGRITY')
        if digest(_schema(con))!=PROFILE['ddl_sha256']:raise Refused('DERIVED_SCHEMA_MISMATCH')
        actual={table:[list(r) for r in con.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in rows}
        if _normalize(actual)!=_normalize(rows):raise Refused('DERIVED_ROW_LOSS')
    finally:con.close()


def _prepare(root):
    if not (root/'SYNTHETIC_ONLY.json').exists():raise Refused('SYNTHETIC_PROVENANCE_REQUIRED')
    _plain(root/'SYNTHETIC_ONLY.json');marker=parse((root/'SYNTHETIC_ONLY.json').read_text(encoding='utf-8'))
    if (set(marker)!={'schema','purpose','source_id','files'} or marker['schema']!='ames-p02-synthetic-workspace-v1'
            or marker['purpose']!='synthetic_only_not_factory' or not isinstance(marker['source_id'],str)):
        raise Refused('SYNTHETIC_PROVENANCE_REQUIRED')
    initial=_inventory(root/'source')
    if initial!=marker['files']:raise Refused('SOURCE_MANIFEST_MISMATCH')
    if {p.name for p in root.iterdir()}!={'source','SYNTHETIC_ONLY.json'}:raise Refused('EXISTING_OR_INTERRUPTED_WORKSPACE')
    provenance=PROFILE['synthetic_provenance']
    if marker['source_id']!=provenance['source_id'] or any(initial.get(name)!=sha for name,sha in provenance['fixed_files'].items()):
        raise Refused('FIXTURE_PROVENANCE_REQUIRED')
    # O_EXCL claim precedes every journal/destination write. Never removed or
    # auto-resumed: an interruption requires a separate supervised workspace.
    try:_write(root/'.p02-claim.json',{'schema':'p02-exclusive-claim-v1'})
    except FileExistsError:raise Refused('EXISTING_OR_INTERRUPTED_WORKSPACE') from None
    _journal(root,'PREPARING')
    private=root/'private';private.mkdir(mode=0o700);master=private/'master';master.mkdir(mode=0o700)
    for name in initial:_copy(root/'source'/name,master/name)
    if _inventory(root/'source')!=initial or _inventory(master)!=initial:raise Refused('SOURCE_CHANGED_DURING_COPY')
    _write(private/'master-manifest.json',{'schema':'p02-private-byte-seal-v1','files':initial,'immutable_storage_attested':False})
    _seal(master);_phase('after_backup')
    # Everything below reads a WORKING copy, never original/master via SQLite.
    if DB+'-wal' in initial:_check_wal(master/(DB+'-wal'))
    browser=parse((master/'browser/storage.json').read_text(encoding='utf-8'))
    if set(browser)!={'auth','outbox'} or not isinstance(browser['outbox'],list) or browser['outbox']:
        raise Refused('OUTBOX_NOT_PROVEN_EMPTY')
    if browser['auth']!=provenance['browser_auth']:raise Refused('FIXTURE_PROVENANCE_REQUIRED')
    checkpoint=parse((master/CHECKPOINT).read_text(encoding='utf-8'))
    con=_logical(master,private/'work')
    try:
        schema,rows=_read(con)
        meta=dict(rows['schema_meta'])
        if set(meta)!={'schema_version','ames_source_id'} or meta['ames_source_id']!=marker['source_id']:raise Refused('DATABASE_SOURCE_CONFLICT')
        if (any(r[1] for r in rows['monitor_profiles']) or any(r[3] in {'queued','running'} for r in rows['jobs'])
            or any(r[8]=='running' for r in rows['repair_query_runs_3012'])):raise Refused('ACTIVE_WORK_UNVERIFIED')
        if (set(checkpoint)!={'source_id','snapshot_id','line','revision','content_hash','query_sn','status'}
            or checkpoint['source_id']!=meta['ames_source_id'] or checkpoint['status']!='COMPLETE'):
            raise Refused('CHECKPOINT_SOURCE_CONFLICT')
        found=con.execute('SELECT content_hash FROM mes_revisions WHERE snapshot_id=? AND line=? AND revision=?',
            (checkpoint['snapshot_id'],checkpoint['line'],checkpoint['revision'])).fetchone()
        if found!=(checkpoint['content_hash'],):raise Refused('CHECKPOINT_SCOPE_CONFLICT')
    finally:con.close()
    mapper,transformed=_transform(rows,marker['source_id'])
    stage=root/'.p02-stage';stage.mkdir(mode=0o700);lab=stage/'lab';lab.mkdir(mode=0o700)
    _new_database(lab/'ames_local.sqlite3',schema,transformed)
    _write(lab/'checkpoint.json',{'schema':'ames-p02-passive-checkpoint-v1','sync_allowed':False,'checkpoint':mapper.walk(checkpoint)})
    _phase('after_db')
    _write(private/'transform-ledger.json',{'schema':'p02-private-reversible-map-v1','mapping':mapper.mapping,'date_shift_days':364})
    # No old pages/freelist/WAL copied into the fresh LAB database.
    for path in lab.iterdir():
        blob=path.read_bytes()
        for old,new in mapper.mapping.items():
            if old!=new and len(old)>=8 and old.encode() in blob:raise Refused('OPAQUE_IDENTITY_REMAINS')
    lab_files={p.name:file_hash(p) for p in lab.iterdir()}
    _write(lab/'LAB_ONLY.json',{'schema':'ames-p02-passive-data-v1','runtime_allowed':False,'sync_allowed':False,'files':lab_files})
    public=stage/'public';public.mkdir(mode=0o700)
    receipt={'schema':'ames-p02-public-proof-v1','profile':PROFILE['schema'],'relations_verified':True,
             'source_unchanged':True,'private_backup_sealed':True,'real_data_authorized':False,'physical':'PENDING'}
    _write(public/'receipt.json',receipt)
    ready={p.relative_to(stage).as_posix():file_hash(p) for p in stage.rglob('*') if p.is_file()}
    _write(stage/'READY.json',{'schema':'p02-publication-v1','files':ready})
    if _inventory(root/'source')!=initial or {p.relative_to(master).as_posix():file_hash(p) for p in master.rglob('*') if p.is_file()}!=initial:
        raise Refused('SOURCE_OR_MASTER_CHANGED')
    _phase('before_publish')
    # Exclusive destination reservation plus xb copies, never replacing even an
    # empty existing directory. Multi-file publication is NOT an atomic rename.
    published=root/'published'
    try:published.mkdir(mode=0o700)
    except FileExistsError:raise Refused('DESTINATION_EXISTS') from None
    for name in ready:_copy(stage/name,published/name)
    _copy(stage/'READY.json',published/'READY.json');_phase('after_publish')
    _journal(root,'COMPLETE',file_hash(stage/'READY.json'))
    if not verify_publication(root):raise Refused('PUBLICATION_NOT_VERIFIED')
    return receipt


def prepare_synthetic(workspace):
    try:return _prepare(_root(workspace))
    except Refused:raise
    except (OSError,ValueError,TypeError,KeyError,sqlite3.Error,RuntimeError):
        raise Refused('UNVERIFIED_STATE_PRESERVE_EVIDENCE') from None


def _published_files(published):
    expected={'lab/ames_local.sqlite3','lab/checkpoint.json','lab/LAB_ONLY.json','public/receipt.json','READY.json'}
    actual={}
    _plain(published,True)
    for parent,dirs,names in os.walk(published,followlinks=False):
        for name in dirs:
            path=Path(parent)/name;_plain(path,True)
            if path.relative_to(published).as_posix() not in {'lab','public'}:raise Refused('UNKNOWN_PUBLICATION_MEMBER')
        for name in names:
            path=Path(parent)/name;relative=path.relative_to(published).as_posix();_plain(path)
            if relative not in expected:raise Refused('UNKNOWN_PUBLICATION_MEMBER')
            actual[relative]=file_hash(path)
    if set(actual)!=expected:raise Refused('INCOMPLETE_PUBLICATION')
    return actual


def verify_publication(workspace):
    try:
        root=_root(workspace)
        for name in ('.p02-claim.json','.p02-journal.json'):_plain(root/name)
        if parse((root/'.p02-claim.json').read_text(encoding='utf-8'))!={'schema':'p02-exclusive-claim-v1'}:return False
        state=parse((root/'.p02-journal.json').read_text(encoding='utf-8'))
        if (set(state)!={'schema','state','ready_sha256'} or state['schema']!='p02-private-journal-v1'
            or state['state']!='COMPLETE'):return False
        published=root/'published';actual=_published_files(published)
        if state['ready_sha256']!=actual.pop('READY.json'):return False
        ready=parse((published/'READY.json').read_text(encoding='utf-8'))
        if ready!={'schema':'p02-publication-v1','files':actual}:return False
        lab=parse((published/'lab/LAB_ONLY.json').read_text(encoding='utf-8'))
        if lab!={'schema':'ames-p02-passive-data-v1','runtime_allowed':False,'sync_allowed':False,
                 'files':{name:actual['lab/'+name] for name in ('ames_local.sqlite3','checkpoint.json')}}:return False
        receipt=parse((published/'public/receipt.json').read_text(encoding='utf-8'))
        if receipt!={'schema':'ames-p02-public-proof-v1','profile':PROFILE['schema'],'relations_verified':True,
             'source_unchanged':True,'private_backup_sealed':True,'real_data_authorized':False,'physical':'PENDING'}:return False
        _plain(root/'private',True);_plain(root/'private/master-manifest.json')
        sealed=parse((root/'private/master-manifest.json').read_text(encoding='utf-8'))
        if set(sealed)!={'schema','files','immutable_storage_attested'} or sealed['schema']!='p02-private-byte-seal-v1' or sealed['immutable_storage_attested'] is not False:return False
        if _inventory(root/'private/master')!=sealed['files']:return False
        return True
    except (OSError,ValueError,TypeError,KeyError,Refused):return False


def main():
    if len(sys.argv)!=3 or sys.argv[1]!='--synthetic-workspace':return 2
    try:print(encoded(prepare_synthetic(Path(sys.argv[2]))));return 0
    except Refused as exc:print(encoded({'ok':False,'reason':str(exc),'real_data_authorized':False}));return 2


if __name__=='__main__':raise SystemExit(main())
