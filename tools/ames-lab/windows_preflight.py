"""P04 disposable-CI-only Windows preflight. No agent, operational DB or repairs.

A passing core probe is NEVER a complete workstation/physical qualification.
The audited GUI source-only dependencies keep the full profile BLOCKED.
"""
from __future__ import annotations
import base64
import csv
import hashlib
import importlib
import importlib.metadata
import importlib.resources
import io
import itertools
import json
import os
from pathlib import Path
import re
import sqlite3
import struct
import sys
import sysconfig
from datetime import datetime
from zoneinfo import ZoneInfo

HERE=Path(__file__).resolve().parent
PROFILE=json.loads((HERE/'p04_profile.json').read_text(encoding='utf-8'))
LOCK=json.loads((HERE/'p04_windows_wheels.json').read_text(encoding='utf-8'))
ARTIFACTS={a['name']:a for a in LOCK['artifacts']}
LIMITATIONS=['DISPOSABLE_WINDOWS_RUNNER_ONLY','FULL_WORKSTATION_BLOCKED_SOURCE_ONLY_GUI_DEPENDENCIES',
 'NO_GUI_OR_CHROME_CDP_EXERCISE','NO_OPERATIONAL_INSTALLATION_OR_DATA','NO_PHYSICAL_HOMOLOGATION',
 'PROCESS_AUDIT_NOT_KERNEL_SANDBOX','DIGEST_IS_NOT_SIGNATURE_OR_MAINTENANCE_LEASE']
IMPORTS={'pandas':'pandas','openpyxl':'openpyxl','numpy':'numpy','playwright':'playwright.sync_api',
         'greenlet':'greenlet','pyee':'pyee','typing-extensions':'typing_extensions','pyperclip':'pyperclip',
         'tzdata':'tzdata','pytz':'pytz','python-dateutil':'dateutil','six':'six','et-xmlfile':'et_xmlfile'}


class Refused(Exception):pass


def normalized_name(name):return re.sub(r'[-_.]+','-',name).lower()
def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(value):return hashlib.sha256(encoded(value).encode()).hexdigest()
def file_hash(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()


def parse(value):
    def pairs(items):
        result={}
        for k,v in items:
            if k in result:raise Refused('DUPLICATE_JSON_FIELD')
            result[k]=v
        return result
    return json.loads(value,object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(Refused('INVALID_JSON_NUMBER')))


def assess(facts):
    """Pure policy evaluation for explicitly synthetic counterfactual fixtures.

    This function does NOT attest a measured host. CLI never accepts facts JSON.
    """
    reasons=[]
    if not isinstance(facts,dict) or set(facts)!={'runtime','sqlite','timezone','packages','imports','guard'}:
        reasons.append('UNREVIEWED_FACTS');facts=facts if isinstance(facts,dict) else {}
    def section(name,required,optional=()):
        value=facts.get(name)
        if not isinstance(value,dict):reasons.append('UNREVIEWED_FACTS');return {}
        if not set(required)<=set(value) or not set(value)<=set(required)|set(optional):reasons.append('UNREVIEWED_FACTS')
        return value
    r=section('runtime',{'version','implementation','bits','platform','native_machine','isolated','bytecode_disabled','extension_suffix'})
    s=section('sqlite',{'version','json1','upsert','foreign_keys','backup','integrity'},{'source_id','compile_options'})
    z=section('timezone',{'tzdata_version','iana_version','resource_verified','vectors_verified'},{'resource_sha256','vectors','source'})
    if r.get('version')!=PROFILE['python'] or any(type(x)!=int for x in r.get('version',[])):reasons.append('PYTHON_VERSION')
    if r.get('implementation')!='cpython':reasons.append('PYTHON_IMPLEMENTATION')
    if type(r.get('bits'))!=int or r.get('bits')!=64:reasons.append('PROCESS_ARCHITECTURE')
    if r.get('platform')!='win-amd64':reasons.append('WINDOWS_REQUIRED')
    if r.get('extension_suffix')!=PROFILE['extension_suffix']:reasons.append('CPYTHON_EXTENSION_ABI')
    if r.get('native_machine')!='AMD64':reasons.append('NATIVE_ARCHITECTURE')
    if r.get('isolated') is not True or r.get('bytecode_disabled') is not True:reasons.append('ISOLATION_REQUIRED')
    version=s.get('version')
    if not isinstance(version,list) or len(version)!=3 or any(type(x)!=int for x in version) or version<PROFILE['sqlite_min']:reasons.append('SQLITE_VERSION')
    for key in ('json1','upsert','foreign_keys','backup','integrity'):
        if s.get(key) is not True:reasons.append('SQLITE_'+key.upper())
    if z.get('tzdata_version')!=PROFILE['tzdata_version'] or z.get('iana_version')!=PROFILE['iana_version']:reasons.append('TZDATA_VERSION')
    if z.get('resource_verified') is not True:reasons.append('TZDATA_RESOURCE')
    if z.get('vectors_verified') is not True:reasons.append('TIMEZONE_VECTORS')
    packages=section('packages',set(ARTIFACTS));imports=section('imports',set(ARTIFACTS))
    if set(packages)!=set(ARTIFACTS):reasons.append('UNREVIEWED_PACKAGE_SET')
    if set(imports)!=set(ARTIFACTS):reasons.append('UNREVIEWED_IMPORT_SET')
    for name,a in ARTIFACTS.items():
        p=packages.get(name)
        if not isinstance(p,dict):reasons.append('PACKAGE_MISSING:'+name);continue
        if set(p)!={'version','filename','sha256','origin_verified','records_verified','metadata_verified'}:reasons.append('UNREVIEWED_FACTS')
        if p.get('version')!=a['version']:reasons.append('PACKAGE_VERSION:'+name)
        if p.get('filename')!=a['filename'] or p.get('sha256')!=a['sha256']:reasons.append('WHEEL_IDENTITY:'+name)
        for field,code in [('origin_verified','WHEEL_ORIGIN'),('records_verified','PACKAGE_RECORD'),('metadata_verified','PACKAGE_METADATA')]:
            if p.get(field) is not True:reasons.append(code+':'+name)
        if imports.get(name) is not True:reasons.append('IMPORT_FAILED:'+name)
    if facts.get('guard') is not True:reasons.append('GUARD_UNVERIFIED')
    return {'scope':'SYNTHETIC_POLICY_ONLY','core_status':'FAIL' if reasons else 'PASS',
            'workstation_status':'BLOCKED','physical':'PENDING','reasons':sorted(set(reasons)),
            'missing_verified_wheels':sorted(normalized_name(x['name']) for x in LOCK['source_only_blockers'])}


def sqlite_probe(connect=sqlite3.connect):
    """Actual SQLite semantics, only two memory connections, no caller DB path."""
    result={'version':list(sqlite3.sqlite_version_info),'json1':False,'upsert':False,'foreign_keys':False,'backup':False,'integrity':False}
    con=connect(':memory:');other=None
    try:
        result['source_id']=con.execute('SELECT sqlite_source_id()').fetchone()[0]
        result['compile_options']=[r[0] for r in con.execute('PRAGMA compile_options')]
        try:
            scalar=con.execute("SELECT json_valid(?),json_extract(?,'$.x[0]'),json_remove(?,'$.x')",('{"x":[1,2]}','{"x":[1,2]}','{"x":1,"y":2}')).fetchone()
            group=con.execute("SELECT json_group_array(json_extract(value,'$.product')) FROM json_each(?,'$.datasets.defects')",('{"datasets":{"defects":[{"product":"LAB-A"},{"product":"LAB-B"}]}}',)).fetchone()[0]
            nested=con.execute("SELECT json_extract(?, '$.content_hash', '$.summary.period')",('{"content_hash":"LAB-H","summary":{"period":{"mode":"LAB"}}}',)).fetchone()[0]
            result['json1']=scalar==(1,1,'{"y":2}') and json.loads(group)==['LAB-A','LAB-B'] and json.loads(nested)==['LAB-H',{'mode':'LAB'}]
        except sqlite3.Error:pass
        con.execute('PRAGMA foreign_keys=ON');con.execute('CREATE TABLE parent(id INTEGER PRIMARY KEY, n INTEGER NOT NULL)')
        con.execute('CREATE TABLE child(parent INTEGER REFERENCES parent(id))');con.execute('INSERT INTO parent VALUES(1,1)')
        try:con.execute('INSERT INTO child VALUES(999)')
        except sqlite3.IntegrityError:result['foreign_keys']=con.execute('PRAGMA foreign_keys').fetchone()==(1,)
        con.execute('CREATE TABLE changes(n INTEGER)')
        con.execute('CREATE TRIGGER changed AFTER UPDATE ON parent BEGIN INSERT INTO changes VALUES(new.n); END')
        con.execute('INSERT INTO parent VALUES(1,2) ON CONFLICT(id) DO UPDATE SET n=excluded.n')
        result['upsert']=con.execute('SELECT n FROM parent').fetchall()==[(2,)] and con.execute('SELECT n FROM changes').fetchall()==[(2,)]
        con.commit();other=connect(':memory:');con.backup(other)
        result['backup']=other.execute('SELECT * FROM parent').fetchall()==[(1,2)]
        result['integrity']=(con.execute('PRAGMA integrity_check').fetchall()==[('ok',)] and con.execute('PRAGMA foreign_key_check').fetchall()==[] and other.execute('PRAGMA integrity_check').fetchall()==[('ok',)])
    except sqlite3.Error:pass
    finally:
        if other is not None:other.close()
        con.close()
    return result


def timezone_probe():
    result={'tzdata_version':None,'iana_version':None,'resource_verified':False,'vectors_verified':False}
    try:
        tzdata=importlib.import_module('tzdata')
        blob=importlib.resources.files('tzdata.zoneinfo').joinpath('America/Sao_Paulo').read_bytes()
        if not blob.startswith(b'TZif'):return result
        zone=ZoneInfo.from_file(io.BytesIO(blob),key=PROFILE['timezone'])
        actual=[[utc,datetime.fromisoformat(utc).astimezone(zone).isoformat(),label] for utc,local,label in PROFILE['clock_vectors']]
        result.update(tzdata_version=tzdata.__version__,iana_version=tzdata.IANA_VERSION,resource_verified=True,
                      resource_sha256=hashlib.sha256(blob).hexdigest(),vectors_verified=actual==PROFILE['clock_vectors'],vectors=actual,
                      source='explicit_verified_tzdata_resource_not_host_TZPATH')
    except (ImportError,OSError,ValueError,AttributeError):pass
    return result


def _regular(path,directory=False):
    try:info=path.lstat()
    except FileNotFoundError:raise Refused('INSTALLED_MEMBER_MISSING') from None
    if (getattr(info,'st_file_attributes',0)&0x400 or path.is_symlink() or
        (not path.is_dir() if directory else not path.is_file() or info.st_nlink!=1)):
        raise Refused('UNTRUSTED_PATH')


def _inside(path,prefix):
    path=Path(path)
    # Resolve only after rejecting reparse/symlink ancestors.
    for p in (path,*path.parents):_regular(p,p.is_dir())
    if not path.resolve().is_relative_to(prefix):raise Refused('PACKAGE_OUTSIDE_LAB')
    return path


def _tags(filename):
    python,abi,platform=filename[:-4].rsplit('-',3)[-3:]
    return {'-'.join(parts) for parts in itertools.product(python.split('.'),abi.split('.'),platform.split('.'))}


def normalized_python_spec(value):
    # PyPI canonicalizes Requires-Python clause order, unlike wheel METADATA.
    # Only conjunctions of reviewed version specifiers, never expressions/eval.
    if not isinstance(value,str):raise Refused('UNREVIEWED_PYTHON_SPECIFIER')
    if not value:return ()
    clauses=[re.sub(r'\s+','',v) for v in value.split(',')]
    if any(not re.fullmatch(r'(?:===|~=|==|!=|<=|>=|<|>)(?:[0-9]+!)?[0-9]+(?:\.[0-9]+)*(?:\.\*)?(?:(?:a|b|rc)[0-9]+|\.post[0-9]+|\.dev[0-9]+)?',v) for v in clauses):
        raise Refused('UNREVIEWED_PYTHON_SPECIFIER')
    return tuple(sorted(clauses))


def verify_packages(report_path,prefix):
    """Hash-pinned pip report + installed wheel metadata, RECORD and closure.

    Does not install/download anything. Custody of CI interpreter/report is trusted;
    hashes are not a signature against a hostile administrator replacing both.
    """
    report=parse(report_path.read_text(encoding='utf-8'));entries=report.get('install')
    if report.get('version')!='1' or not isinstance(entries,list):raise Refused('PIP_REPORT_SCHEMA')
    indexed={}
    for item in entries:
        name=normalized_name(item['metadata']['name'])
        if name in indexed or name not in ARTIFACTS:raise Refused('UNREVIEWED_PROVISIONING')
        indexed[name]=item
    if set(indexed)!=set(ARTIFACTS):raise Refused('INCOMPLETE_PROVISIONING')
    result={}
    available={}
    for d in importlib.metadata.distributions():
        name=normalized_name(d.metadata['Name'])
        if name in available:raise Refused('DUPLICATE_DISTRIBUTION')
        available[name]=d
    if set(available)!=set(ARTIFACTS):raise Refused('UNREVIEWED_INSTALLED_SET')
    for name,a in ARTIFACTS.items():
        item=indexed[name];info=item['download_info']
        if (info['url']!=a['url'] or info['archive_info']['hashes']!={'sha256':a['sha256']} or item['metadata']['version']!=a['version']):raise Refused('WHEEL_ORIGIN_MISMATCH:'+name)
        d=available[name]
        if d.version!=a['version']:raise Refused('INSTALLED_VERSION_MISMATCH:'+name)
        if sorted(d.requires or [])!=sorted(a['requires_dist']) or normalized_python_spec(d.metadata.get('Requires-Python') or '')!=normalized_python_spec(a['requires_python'] or ''):
            raise Refused('DEPENDENCY_METADATA_MISMATCH:'+name)
        wheel=d.read_text('WHEEL') or '';tags={line[5:].strip() for line in wheel.splitlines() if line.startswith('Tag: ')}
        if tags!=set(a.get('installed_tags',_tags(a['filename']))):raise Refused('WHEEL_TAG_MISMATCH:'+name)
        # Distribution.files() in CPython3.12 SILENTLY filters missing files.
        # Validate the authoritative raw RECORD, never that filtered view.
        record_path=_inside(Path(d._path)/'RECORD',prefix)
        verify_record(record_path.read_text(encoding='utf-8'),d.locate_file,prefix,name)
        result[name]={'version':d.version,'filename':a['filename'],'sha256':a['sha256'],
                      'origin_verified':True,'records_verified':True,'metadata_verified':True}
    return result


REGISTRY_ROOTS={r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Time Zones',r'SOFTWARE\Microsoft\Windows\CurrentVersion\Time Zones'}
REGISTRY_UTC={p+r'\UTC' for p in REGISTRY_ROOTS}
REGISTRY_PATHS=REGISTRY_ROOTS|REGISTRY_UTC


def registry_event_allowed(event,args):
    # dateutil.tz.win checks the existence of a PUBLIC timezone key at import.
    # UTC values are permitted ONLY for handles opened by this guard below.
    # No remote registry, other keys, writes, user identities or repair.
    if event=='winreg.ConnectRegistry':
        return len(args)==2 and args[0] is None and type(args[1]) is int and args[1] in (0x80000002,-2147483646)
    if event=='winreg.OpenKey':
        return (len(args)==3 and type(args[0]) is int and args[1] in REGISTRY_PATHS
                and type(args[2]) is int and args[2]==0x20019)
    return False


def verify_record(raw,locate,prefix,name):
    if not isinstance(raw,str) or not raw:raise Refused('INSTALLED_RECORD_MISSING:'+name)
    seen=set()
    for row in csv.reader(io.StringIO(raw,newline='')):
        if len(row)!=3:raise Refused('INVALID_INSTALLED_RECORD:'+name)
        relative,sha,size=row
        if not relative or ':' in relative or '\\' in relative or '\x00' in relative:raise Refused('INVALID_INSTALLED_RECORD:'+name)
        folded=relative.casefold()
        if folded in seen:raise Refused('DUPLICATE_INSTALLED_RECORD:'+name)
        seen.add(folded)
        path=_inside(locate(relative),prefix)
        if not path.is_file():raise Refused('INSTALLED_MEMBER_MISSING')
        if not sha:
            if not relative.endswith('.dist-info/RECORD') or size:raise Refused('UNHASHED_INSTALLED_MEMBER:'+name)
            continue
        if not re.fullmatch(r'sha256=[A-Za-z0-9_-]{43}',sha) or not size.isdigit():raise Refused('INVALID_INSTALLED_RECORD:'+name)
        if int(size)!=path.stat().st_size:raise Refused('INSTALLED_RECORD_MISMATCH:'+name)
        expected=base64.urlsafe_b64encode(bytes.fromhex(file_hash(path))).decode().rstrip('=')
        if expected!=sha[7:]:raise Refused('INSTALLED_RECORD_MISMATCH:'+name)
    if not seen:raise Refused('INSTALLED_RECORD_MISSING:'+name)


def install_guard():
    """Process-level fail-closed policy, not a kernel sandbox or maintenance lease."""
    denied_modules={'agent','agent_entry','agent_hardened_entry','store','engine_bridge','network_watch','ames','pyautogui','pyscreeze','pygetwindow','mouseinfo','pymsgbox'}
    mutations={'os.remove','os.rmdir','os.rename','os.mkdir','os.chmod','os.utime','os.link','os.symlink','os.truncate','os.putenv','os.unsetenv'}
    pending_registry_result=[];registry_handles={}
    def audit(event,args):
        if event.startswith('winreg.'):
            if event=='winreg.OpenKey/result' and pending_registry_result and len(args)==1 and type(args[0]) is int:
                registry_handles[args[0]]=pending_registry_result.pop();return
            if registry_event_allowed(event,args):
                if event=='winreg.ConnectRegistry':registry_handles.clear()
                if event=='winreg.OpenKey':pending_registry_result.append(args[1])
                return
            if args and registry_handles.get(args[0]) in REGISTRY_UTC:
                if event=='winreg.QueryInfoKey' and len(args)==1:return
                if event=='winreg.EnumValue' and len(args)==2 and type(args[1]) is int and 0<=args[1]<64:return
            detail=''
            if event=='winreg.OpenKey':
                known={p.casefold():'PUBLIC_TZ_KEY' for p in REGISTRY_PATHS}
                known.update({r'SOFTWARE\Microsoft\Windows NT\CurrentVersion'.casefold():'PUBLIC_OS_VERSION','':'MIME_CLASSES_ROOT',
                              r'SYSTEM\CurrentControlSet\Control\TimeZoneInformation'.casefold():'PUBLIC_LOCAL_TIMEZONE'})
                label=known.get(str(args[1]).casefold(),'OTHER_KEY') if len(args)>1 else 'MISSING_KEY'
                access=str(args[2]) if len(args)>2 and type(args[2]) is int else 'NONINT'
                callers=[];frame=sys._getframe(1)
                while frame is not None and len(callers)<6:
                    callers.append(Path(frame.f_code.co_filename).name+'.'+frame.f_code.co_name);frame=frame.f_back
                detail=':shape='+str(len(args))+':key='+label+':access='+access+':callers='+','.join(callers)
            raise Refused('P04_SIDE_EFFECT_REFUSED:'+event+detail)
        if (event.startswith(('socket.','subprocess.')) or event in mutations
            or event in {'os.system','os.posix_spawn','os.exec','os.spawn','os.startfile'}):raise Refused('P04_SIDE_EFFECT_REFUSED:'+event)
        if event=='import' and str(args[0]).split('.')[0] in denied_modules:raise Refused('P04_OPERATIONAL_IMPORT_REFUSED')
        if event=='sqlite3.connect' and args[0]!=':memory:':raise Refused('P04_EXTERNAL_SQLITE_REFUSED')
        if event=='open':
            mode=args[1];flags=args[2]
            if isinstance(mode,str) and any(x in mode for x in 'wax+') or isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND):raise Refused('P04_WRITE_REFUSED')
    sys.addaudithook(audit)
    return True


def prove_guard():
    import socket
    import subprocess
    attempts=[lambda:socket.socket(),lambda:subprocess.Popen(['P04-SENTINEL-NEVER-EXECUTE']),
              lambda:open('P04-SENTINEL-NEVER-WRITE','wb'),lambda:sqlite3.connect('P04-SENTINEL-NEVER-DB'),
              lambda:__import__('agent'),
              lambda:sys.audit('winreg.ConnectRegistry','P04-SYNTHETIC-REMOTE',0x80000002),
              lambda:sys.audit('winreg.CreateKey',0x80000001,r'SOFTWARE\P04-SYNTHETIC-NEVER-CREATE'),
              lambda:sys.audit('winreg.OpenKey',0x80000002,next(iter(REGISTRY_PATHS)),0xF003F),
              lambda:sys.audit('winreg.QueryInfoKey',0x80000002),lambda:sys.audit('winreg.EnumValue',0x80000002,0)]
    for probe in attempts:
        try:probe()
        except Refused:continue
        raise Refused('P04_GUARD_NOT_ACTIVE')
    return True


def _native_inventory():
    import ctypes
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    info=ctypes.create_string_buffer(64);native=kernel.GetNativeSystemInfo;native.argtypes=[ctypes.c_void_p];native.restype=None;native(info)
    architecture=int.from_bytes(info.raw[:2],'little')
    handle=kernel.GetModuleHandleW;handle.argtypes=[wintypes.LPCWSTR];handle.restype=wintypes.HMODULE
    getfile=kernel.GetModuleFileNameW;getfile.argtypes=[wintypes.HMODULE,wintypes.LPWSTR,wintypes.DWORD];getfile.restype=wintypes.DWORD
    module=handle('sqlite3.dll')
    if not module:raise Refused('SQLITE_DLL_UNVERIFIED')
    buffer=ctypes.create_unicode_buffer(32768);length=getfile(module,buffer,len(buffer))
    if not length or length>=len(buffer):raise Refused('SQLITE_DLL_UNVERIFIED')
    import _sqlite3
    return {'native_machine':{9:'AMD64',12:'ARM64',0:'x86'}.get(architecture,'UNKNOWN'),
            'binaries':{'python_executable':file_hash(sys.executable),'python_base':file_hash(sys._base_executable),
                        'sqlite_extension':file_hash(_sqlite3.__file__),'loaded_sqlite_dll':file_hash(buffer.value)}}


def _context(root):
    if (os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows'
        or os.environ.get('GITHUB_REPOSITORY')!='pedrokam700/Central-de-Controle-'):raise Refused('DISPOSABLE_WINDOWS_CI_ONLY')
    if not root.is_absolute() or '..' in root.parts or str(root).startswith(('\\\\','//')):raise Refused('EXPLICIT_LOCAL_LAB_REQUIRED')
    for p in (root,*root.parents):_regular(p,True)
    scratch=Path(os.environ['RUNNER_TEMP']).resolve()
    if root.resolve()!=root or root.parent!=scratch or not re.fullmatch('P04-SYNTHETIC-[A-Za-z0-9_-]+',root.name):raise Refused('EXPLICIT_LOCAL_LAB_REQUIRED')
    if Path(sys.prefix).resolve()!=root/'venv' or sys.prefix==sys.base_prefix:raise Refused('LAB_INTERPRETER_REQUIRED')
    if not sys.flags.isolated or not sys.dont_write_bytecode:raise Refused('ISOLATED_INTERPRETER_REQUIRED')
    if list(sys.version_info[:3])!=PROFILE['python'] or sys.implementation.name!='cpython':raise Refused('UNSUPPORTED_CI_PYTHON')
    if struct.calcsize('P')*8!=64 or sysconfig.get_platform()!='win-amd64':raise Refused('UNSUPPORTED_CI_ARCHITECTURE')
    if sysconfig.get_config_var('EXT_SUFFIX')!=PROFILE['extension_suffix']:raise Refused('UNSUPPORTED_CPYTHON_EXTENSION_ABI')
    for name in ('context.json','pip-report.json'):_regular(root/name)
    context=parse((root/'context.json').read_text(encoding='utf-8'))
    if (set(context)!={'schema','scope','base_sha','code_sha','run_id'} or context['schema']!='ames-p04-ci-context-v1'
        or context['scope']!='SYNTHETIC_ONLY' or context['base_sha']!=PROFILE['base_sha']
        or context['code_sha']!=os.environ.get('GITHUB_SHA') or not re.fullmatch('[0-9a-f]{40}',context['code_sha'])
        or context['run_id']!=os.environ.get('GITHUB_RUN_ID')):raise Refused('CI_CONTEXT_UNVERIFIED')
    if any(os.environ.get(k)!='1' for k in ('OPENBLAS_MAIN_FREE','GOTOBLAS_MAIN_FREE')):raise Refused('REVIEWED_IMPORT_DEFAULTS_REQUIRED')
    return context


def _imports():
    result={}
    for name,module in IMPORTS.items():
        try:importlib.import_module(module);result[name]=True
        except (ImportError,OSError,RuntimeError):result[name]=False
    if all(result.values()):
        numpy=importlib.import_module('numpy');pandas=importlib.import_module('pandas');openpyxl=importlib.import_module('openpyxl')
        if numpy.array([1,2,3],dtype='int64').sum()!=6:raise Refused('NUMPY_FUNCTIONAL_PROBE')
        frame=pandas.DataFrame({'pcba':['LAB-A','LAB-B','LAB-A'],'n':[1,2,3]})
        if frame.groupby('pcba')['n'].sum().to_dict()!={'LAB-A':4,'LAB-B':2}:raise Refused('PANDAS_FUNCTIONAL_PROBE')
        workbook=openpyxl.Workbook();sheet=workbook.active;sheet['A1']='SYNTHETIC';sheet['B1']=datetime(2026,11,3,7)
        if sheet['A1'].value!='SYNTHETIC' or sheet['B1'].value.hour!=7:raise Refused('OPENPYXL_FUNCTIONAL_PROBE')
        workbook.close()  # No save, XLSX/ZIP generation or file output.
        greenlet=importlib.import_module('greenlet')
        if greenlet.greenlet(lambda:37).switch()!=37:raise Refused('GREENLET_FUNCTIONAL_PROBE')
        pyee=importlib.import_module('pyee');events=[];emitter=pyee.EventEmitter();emitter.on('synthetic',events.append);emitter.emit('synthetic',1)
        if events!=[1]:raise Refused('PYEE_FUNCTIONAL_PROBE')
    return result


def collect(root):
    context=_context(root);install_guard();guard=prove_guard()
    packages=verify_packages(root/'pip-report.json',root/'venv')
    sql=sqlite_probe();native=_native_inventory()
    if native['native_machine']!='AMD64':raise Refused('UNSUPPORTED_NATIVE_ARCHITECTURE')
    zone=timezone_probe();imports=_imports()
    runtime={'version':list(sys.version_info[:3]),'implementation':sys.implementation.name,'bits':struct.calcsize('P')*8,
             'platform':sysconfig.get_platform(),'native_machine':native['native_machine'],'extension_suffix':sysconfig.get_config_var('EXT_SUFFIX'),
             'isolated':bool(sys.flags.isolated),'bytecode_disabled':bool(sys.dont_write_bytecode)}
    facts={'runtime':runtime,'sqlite':sql,'timezone':zone,'packages':packages,'imports':imports,'guard':guard}
    assessment=assess(facts)
    receipt={'schema':'ames-p04-runner-receipt-v1','scope':'DISPOSABLE_WINDOWS_RUNNER_ONLY','code_sha':context['code_sha'],
             'base_sha':PROFILE['base_sha'],'run_id':context['run_id'],'profile_sha256':file_hash(HERE/'p04_profile.json'),
             'wheel_lock_sha256':file_hash(HERE/'p04_windows_wheels.json'),'tool_sha256':file_hash(Path(__file__)),
             'facts':facts,'assessment':assessment,'native_binaries':native['binaries'],
             'python_build':sys.version,'cache_tag':sys.implementation.cache_tag,'SOABI':sysconfig.get_config_var('SOABI'),
             'windows_version':list(sys.getwindowsversion()),
             'process_import_defaults':{k:os.environ[k] for k in ('OPENBLAS_MAIN_FREE','GOTOBLAS_MAIN_FREE')},
             'readonly_registry_contract':{'scope':'local_HKLM_timezone_roots_and_guard_owned_UTC_values_only','paths':sorted(REGISTRY_PATHS),
                                           'access':'KEY_READ','remote_allowed':False,'writes_allowed':False},
             'runner_image':{k:os.environ.get(k) for k in ('ImageOS','ImageVersion','RUNNER_OS','RUNNER_ARCH')},
             'operational_installation_tested':False,'homologation_authorized':False,'physical':'PENDING','limitations':LIMITATIONS}
    receipt['receipt_sha256']=digest(receipt)
    return receipt


def verify_receipt(receipt,code_sha):
    try:
        required={'schema','scope','code_sha','base_sha','run_id','profile_sha256','wheel_lock_sha256','tool_sha256',
                  'facts','assessment','native_binaries','python_build','cache_tag','SOABI','windows_version','runner_image',
                  'operational_installation_tested','homologation_authorized','physical','receipt_sha256','process_import_defaults','readonly_registry_contract','limitations'}
        if not isinstance(receipt,dict) or set(receipt)!=required:return False
        copy=dict(receipt);sha=copy.pop('receipt_sha256')
        if (sha!=digest(copy) or copy['schema']!='ames-p04-runner-receipt-v1' or copy['code_sha']!=code_sha
            or not re.fullmatch('[0-9a-f]{40}',code_sha) or copy['base_sha']!=PROFILE['base_sha']
            or copy['scope']!='DISPOSABLE_WINDOWS_RUNNER_ONLY' or not re.fullmatch('[0-9]+',copy['run_id'])
            or copy['operational_installation_tested'] is not False or copy['homologation_authorized'] is not False
            or copy['physical']!='PENDING' or copy['assessment']!=assess(copy['facts'])
            or 'UNREVIEWED_FACTS' in copy['assessment']['reasons']):return False
        for field,name in [('profile_sha256','p04_profile.json'),('wheel_lock_sha256','p04_windows_wheels.json')]:
            if copy[field]!=file_hash(HERE/name):return False
        if copy['tool_sha256']!=file_hash(Path(__file__)):return False
        binary=copy['native_binaries']
        if set(binary)!={'python_executable','python_base','sqlite_extension','loaded_sqlite_dll'}:return False
        if any(not re.fullmatch('[0-9a-f]{64}',h) for h in binary.values()):return False
        if copy['process_import_defaults']!={'OPENBLAS_MAIN_FREE':'1','GOTOBLAS_MAIN_FREE':'1'}:return False
        if copy['readonly_registry_contract']!={'scope':'local_HKLM_timezone_roots_and_guard_owned_UTC_values_only','paths':sorted(REGISTRY_PATHS),'access':'KEY_READ','remote_allowed':False,'writes_allowed':False}:return False
        image=copy['runner_image']
        if set(image)!={'ImageOS','ImageVersion','RUNNER_OS','RUNNER_ARCH'} or image['RUNNER_OS']!='Windows' or image['RUNNER_ARCH']!='X64':return False
        if any(not isinstance(value,str) or not value for value in image.values()):return False
        if copy['cache_tag']!='cpython-312' or copy['SOABI'] not in (None,'cp312-win_amd64'):return False
        if copy['facts']['runtime']['extension_suffix']!=PROFILE['extension_suffix']:return False
        if copy['limitations']!=LIMITATIONS:return False
        if not str(copy['python_build']).startswith('3.12.10 '):return False
        if not isinstance(copy['windows_version'],list) or len(copy['windows_version'])!=5:return False
        return True
    except (OSError,ValueError,TypeError,KeyError,AttributeError):return False


def main():
    try:
        if len(sys.argv)!=3 or sys.argv[1]!='--ci-lab-root':raise Refused('EXPLICIT_CI_LAB_MODE_REQUIRED')
        receipt=collect(Path(sys.argv[2]));print(encoded(receipt))
        return 3 if receipt['assessment']['core_status']=='PASS' else 2
    except (Refused,OSError,ValueError,KeyError,TypeError,sqlite3.Error) as exc:
        reason=str(exc) if isinstance(exc,Refused) else 'UNVERIFIED_ENVIRONMENT'
        print(encoded({'schema':'ames-p04-refusal-v1','status':'REFUSED','reason':reason,'physical':'PENDING'}));return 2


if __name__=='__main__':raise SystemExit(main())
