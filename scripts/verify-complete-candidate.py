"""Independent passive verification of the real ZIP. Never import packaged code.

Git/AST source selection is read-only; exact transformed bytes are checked here,
independently of the builder. Extract only to a new scratch directory.
"""
from __future__ import annotations
import argparse
import ast
import contextlib
import email
import hashlib
import functools
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import runpy
import stat
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
BASE='3a9e22f57d4cc8c6ee2336685273a0e4a9f628f3'
EED='eedacc65445dea9967a92085777b878c1ee9c123'
def sha(data):return hashlib.sha256(data).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def pairs(values):
    result={}
    for key,value in values:
        if key in result:raise ValueError('Duplicate JSON key')
        result[key]=value
    return result
def obj(raw):return json.loads(raw,object_pairs_hook=pairs)
def require(condition,message):
    if not condition:raise ValueError(message)

def verify_runtime_wheels(data,receipt,expected_sha):
    """Independent receipt/source/metadata comparison; never execute a wheel."""
    lock=obj((ROOT/'scripts/install98/dependencies.json').read_bytes())
    expected={re.sub('[-_.]+','-',x['name']).lower():x for x in lock['artifacts'] if x['scope']=='runtime'}
    require(receipt['sources']==[{k:x[k] for k in ('name','version','url','sha256')} for x in lock['artifacts']],'Wheel source provenance mismatch')
    provenance=obj(data['vendor/RUNTIME_DEPENDENCIES.json'])
    require(set(provenance)=={'schema','sha','python','platform','sources_lock_sha256','packages','requirements_sha256','prerequisites','includes_emulators','physical'},'Unexpected runtime provenance metadata')
    require(provenance['schema']=='central98-offline-runtime-v1' and provenance['sha']==expected_sha and provenance['python']=='3.12.10' and provenance['platform']=='Windows x86_64' and provenance['includes_emulators'] is False and provenance['physical']=='PENDING','Runtime compatibility metadata mismatch')
    require(provenance['prerequisites']==['Genuine Python 3.12 x64 with venv/pip','Genuine Google Chrome x64'],'Runtime prerequisites mismatch')
    require(provenance['sources_lock_sha256']==sha((ROOT/'scripts/install98/dependencies.json').read_bytes()) and provenance['requirements_sha256']==sha(data['ames-agent/requirements.txt']),'Runtime lock mismatch')
    require(len(provenance['packages'])==len(expected)==len(receipt['built_and_official_wheels'])==21,'Runtime dependency count mismatch')
    seen=set()
    for row in provenance['packages']:
        require(set(row)=={'name','version','wheel','wheel_sha256','source_url','source_sha256','method'},'Unexpected wheel provenance')
        name=re.sub('[-_.]+','-',row['name']).lower();source=expected.get(name)
        require(source is not None and name not in seen,'Unexpected/duplicate runtime package');seen.add(name)
        require(row['name']==source['name'] and row['version']==source['version'] and row['source_url']==source['url'] and row['source_sha256']==source['sha256'],'Wheel source identity mismatch')
        content=data['vendor/wheels/'+row['wheel']]
        require(row['wheel_sha256']==sha(content)==receipt['built_and_official_wheels'].get(row['wheel']),'Independent runtime wheel hash mismatch')
        require(row['wheel'].endswith(('-py3-none-any.whl','-py2.py3-none-any.whl','-cp312-cp312-win_amd64.whl')) or source['kind']=='bdist_wheel' and row['wheel'].endswith('-py3-none-win_amd64.whl'),'Unreviewed runtime architecture')
        method='OFFICIAL_WHEEL' if source['kind']=='bdist_wheel' else 'GENUINE_SOURCE_BUILT_OFFLINE_UNDER_WFP'
        require(row['method']==method,'Wheel build method mismatch')
        if source['kind']=='bdist_wheel':require(row['wheel']==source['filename'] and sha(content)==source['sha256'],'Official wheel bytes mismatch')
        with zipfile.ZipFile(io.BytesIO(content)) as wheel:
            metadata=[n for n in wheel.namelist() if n.endswith('.dist-info/METADATA')]
            require(len(metadata)==1 and wheel.testzip() is None,'Wheel metadata/CRC mismatch')
            header=email.message_from_bytes(wheel.read(metadata[0]))
            require(re.sub('[-_.]+','-',header['Name']).lower()==name and header['Version']==source['version'],'Wheel internal identity mismatch')
def safe_name(name):
    p=PurePosixPath(name)
    require(bool(name) and not name.startswith('/') and '\\' not in name and ':' not in name and '/'.join(p.parts)==name,'Unsafe path')
    for part in p.parts:
        require(part not in ('.','..') and not part.endswith(('.',' ')) and all(ord(c)>=32 for c in part),'Aliased path')
        require(not re.fullmatch(r'(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part),'Windows device')
    low=name.casefold();leaf=p.name.casefold()
    require(not low.startswith('ames-agent/data/') and '__pycache__' not in low.split('/'),'Operational data')
    require(leaf not in {'config.json','local_agent_token','cookies.json','session.json','.env','network_health.jsonl'} and not leaf.startswith('.env.'),'Private member')
    require(not leaf.endswith(('.db','.sqlite','.sqlite3','.pyc','.log','.zip','.pem','.key','-wal','-shm','-journal')),'Runtime member')

@functools.lru_cache(maxsize=1)
def source_model():
    with contextlib.redirect_stdout(io.StringIO()):model=runpy.run_path(str(ROOT/'scripts/audit/package-source-inventory.py'))
    model['read_git']=functools.lru_cache(maxsize=None)(model['read_git'])
    return model

def verify(archive,expected_sha,extract_to=None):
    require(bool(re.fullmatch('[a-f0-9]{40}',expected_sha)),'Exact SHA required')
    current=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    require(current==expected_sha,'Verifier checkout SHA mismatch')
    model=source_model();require(model['new']==expected_sha,'Source model mismatch')
    with zipfile.ZipFile(archive) as z:
        infos=z.infolist();names=[i.filename for i in infos]
        require(len(names)==len(set(n.casefold() for n in names)),'Duplicate/case-aliased member')
        for info in infos:
            safe_name(info.filename)
            require(stat.S_IFMT(info.external_attr>>16) in (0,stat.S_IFREG) and not info.flag_bits&1,'Special/encrypted member')
            require(info.file_size<=64*1024*1024,'Member capacity')
        require(sum(i.file_size for i in infos)<=256*1024*1024,'Archive capacity')
        expected_members=set(model['current']);wheel_receipt=None
        if 'vendor/RUNTIME_DEPENDENCIES.json' in names:
            receipt_path=os.environ.get('INSTALL98_DEPENDENCY_RECEIPT')
            require(receipt_path is not None,'Independent wheel provenance receipt required')
            wheel_receipt=obj(Path(receipt_path).read_bytes())
            expected_members|={'vendor/wheels/'+n for n in wheel_receipt['built_and_official_wheels']}
            expected_members|={'vendor/RUNTIME_DEPENDENCIES.json','evidence/current/PR98_INSTALACAO_WINDOWS_20261118.md'}
        require(set(names)==expected_members,'Actual members differ from independently selected sources')
        require(z.testzip() is None,'CRC mismatch')
        data={n:z.read(n) for n in names}
    hashes={n:sha(v) for n,v in data.items()}
    manifest=obj(data['CANDIDATE_MANIFEST.json']);local=obj(data['LOCAL_BUNDLE_MANIFEST.json']);identity=obj(data['PACKAGE_IDENTITY.json'])
    require(manifest['files']=={n:h for n,h in hashes.items() if n!='CANDIDATE_MANIFEST.json'},'Manifest inventory/hash mismatch')
    version='AMES-CANDIDATA-'+expected_sha[:12]
    for m in (manifest,local,identity):require(m['sha']==expected_sha,'Package identity SHA mismatch')
    require(manifest['development'] is False and local['development'] is False,'Development build')
    require(manifest['physical_gate']=='PENDING' and manifest['installation_authorized'] is False,'Physical/install claim')
    require(manifest['candidate_version']==version and manifest['delivery']=='INTEGRATED_CLEAN_COMPLETE','Manifest delivery mismatch')
    for n,h in local['files'].items():require(hashes.get(n)==h and manifest['files'].get(n)==h,'Local manifest mismatch')
    components={}
    for label,prefix in [('frontend','frontend/'),('agent','ames-agent/'),('engine','factory-engine/')]:
        members={n:h for n,h in sorted(hashes.items()) if n.startswith(prefix)}
        components[label]={'code_sha':expected_sha,'files':len(members),'members_sha256':sha(canonical(members))}
    expected_identity={'schema':'central-complete-candidate-v1','sha':expected_sha,'candidate_version':version,
        'delivery':'INTEGRATED_CLEAN_COMPLETE','reference_test_sha':EED,'installation_authorized':False,
        'physical':'PENDING','legacy_updater_compatible':False,'future_supervised_entry':'01_TROCAR.bat','components':components,
        'limits':['P02_REAL_PENDING','P04_FULL_GUI_BLOCKED','P05_PENDING','P07_PENDING','P08_REAL_PENDING','G0_G7_PENDING','EEDACC65_ZIP_BYTES_UNAVAILABLE']}
    if wheel_receipt is not None:
        expected_identity['limits'][1]='P04_ORIGINAL_WINDOWS_PENDING'
        expected_identity['offline_runtime']={'packages':21,'manifest':'vendor/RUNTIME_DEPENDENCIES.json','platform':'Windows x86_64','python':'3.12.10'}
        verify_runtime_wheels(data,wheel_receipt,expected_sha)
        require(data['evidence/current/PR98_INSTALACAO_WINDOWS_20261118.md']==model['read_git'](expected_sha,'docs/ames/handoffs/PR98_INSTALACAO_WINDOWS_20261118.md'),'Current handoff mismatch')
    require(identity==expected_identity,'Unreviewed identity metadata')
    require(identity['installation_authorized'] is False and identity['legacy_updater_compatible'] is False,'Typed safety metadata required')
    # Every direct source, including each collector and dependency, is checked.
    for name,source in model['current'].items():
        if source is not None and name not in model['cd']:
            require(data[name]==model['read_git'](expected_sha,source),'Source bytes mismatch: '+name)
    def source(path):return model['read_git'](expected_sha,path)
    def local_dependencies(raw):
        return raw.replace(b'https://www.gstatic.com/firebasejs/10.8.0/',b'/Central-de-Controle-/vendor/browser/firebase/10.8.0/').replace(b'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',b'/Central-de-Controle-/vendor/browser/sheetjs/0.20.3/xlsx.full.min.js')
    static=source('scripts/build-static.mjs').decode()
    def literal(key):
        found=re.search(r'const '+key+r"='([^']*)';",static);require(found is not None,'Static transform contract absent');return found[1]
    guard=re.search(r'const bootGuard=`([^`]+)`;',static)[1].replace('\\n','\n')
    front='frontend/Central-de-Controle-/'
    expected_index=source('index.html').decode().replace(literal('appTag'),guard+'\n'+literal('bootstrapTag'))
    require(data[front+'index.html']==local_dependencies(expected_index.encode()),'Transformed integrated index mismatch')
    expected_app=source('app.js').decode().replace(literal('oldImport'),literal('newImport')).replace(literal('oldInit'),literal('newInit'))
    require(data[front+'app.js']==local_dependencies(expected_app.encode()),'Transformed app mismatch')
    expected_sw=re.sub(r'^const CACHE_REVISION=[^;]+;','const CACHE_REVISION='+json.dumps(expected_sha)+';',source('sw.js').decode(),flags=re.M)
    expected_sw=local_dependencies(expected_sw.encode()).decode().replace('\n]);\n\nasync function precache','\n].map(url=>new URL(url,self.location.origin).href));\n\nasync function precache').replace('const FIREBASE_SDK=Object.freeze([',"ASSETS.push(BASE+'vendor/browser/sheetjs/0.20.3/xlsx.full.min.js');\nconst FIREBASE_SDK=Object.freeze([")
    require(data[front+'sw.js']==expected_sw.encode(),'Transformed SW mismatch')
    inputs=obj(source('vendor/browser/manifest.json'));expected_browser=[]
    for entry in inputs['files']:
        raw=source('vendor/browser/'+entry['path']);require(len(raw)==entry['size'] and sha(raw)==entry['sha256'],'Official browser input mismatch')
        packaged=local_dependencies(raw) if entry['kind']=='javascript' else raw
        require(data[front+'vendor/browser/'+entry['path']]==packaged,'Browser dependency transform mismatch')
        expected_browser.append({**entry,'source_sha256':entry['sha256'],'packaged_sha256':sha(packaged),'transform':'SAME_ORIGIN_IMPORT_LOCATIONS_ONLY' if entry['kind']=='javascript' else 'NONE'})
    require(obj(data[front+'vendor/browser/manifest.json'])=={**inputs,'files':expected_browser},'Browser manifest provenance mismatch')
    for name,origin in model['current'].items():
        if origin and name in model['cd'] and name.endswith(('.js','.mjs')) and name not in (front+'app.js',front+'sw.js'):
            require(data[name]==local_dependencies(source(origin)),'Transformed module mismatch: '+name)
    root_entry=re.search(r'function rootEntry\(\)\{\s*return `([^`]+)`;',static)[1].replace('\\n','\n')
    require(data['frontend/index.html']==root_entry.encode(),'Root entry mismatch')
    release=obj(data['frontend/release-build.json'])
    require(release=={'sha':expected_sha,'branch':os.environ.get('GITHUB_REF_NAME'),'provider':'github-actions','build':'15.1.13.54','project':'central-cora-v2'},'Release identity mismatch')
    require('offline-bootstrap.mjs' in expected_index and 'src="/Central-de-Controle-/local-entry.mjs"' not in expected_index,'Standalone Console regression')
    require(data['TROCAR_PARA_PR69_NOVA.ps1']==source('tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1').replace(b'__BUNDLE_SHA__',expected_sha.encode()),'Switch SHA transform mismatch')
    instruction=source('docs/ames/packaging/CANDIDATA_INSTALACAO_FUTURA_20261118.md').decode().replace('__CANDIDATE_SHA__',expected_sha).replace('__CANDIDATE_VERSION__',version).encode()
    for n in ('LEIA_PRIMEIRO.txt','INSTRUCOES_INSTALACAO_LIMPA.txt'):require(data[n]==instruction,'Current instructions mismatch')
    for n in ('INSTRUCOES_INSTALACAO_LIMPA.txt','MANUAL_LOGICA_CAPTURA_E_CRUZAMENTO.md','NOTAS_ALERTAS_SN_PR69.md','NOTAS_CORRECOES_28OUT_RESTAURACAO.md','NOTAS_VALIDACAO_FPY_TOP3_RASTREABILIDADE.md'):
        if n=='INSTRUCOES_INSTALACAO_LIMPA.txt':continue
        expected=b'HISTORICO: consulte LEIA_PRIMEIRO.txt desta candidata antes de qualquer procedimento.\n\n'+source('tools/ames-workstation/package-docs/'+n).replace(b'__BUNDLE_SHA__',expected_sha.encode())
        require(data[n]==expected,'Historical document transform mismatch')
    launcher=b'@echo off\r\ncd /d "%~dp0"\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_LOCAL_CANDIDATE.ps1"\r\nif errorlevel 1 pause\r\n'
    for n in ('00_INICIAR_AQUI.bat','INICIAR_POSTO_CENTRAL_V2.bat','INICIAR_CENTRAL_AMES.cmd'):require(data[n]==launcher,'Launcher wrapper mismatch')
    # Required local Python imports: parse source only, never import package.
    agent={PurePosixPath(n).stem for n in names if n.startswith('ames-agent/') and n.endswith('.py')}
    for n,raw in data.items():
        if not n.endswith('.py'):continue
        tree=ast.parse(raw,filename=n)
        if n.startswith('ames-agent/'):
            for node in ast.walk(tree):
                deps=[a.name.split('.')[0] for a in node.names] if isinstance(node,ast.Import) else [(node.module or '').split('.')[0]] if isinstance(node,ast.ImportFrom) else []
                for dep in deps:
                    if (ROOT/'ames/agent'/f'{dep}.py').is_file():require(dep in agent,'Missing Python local dependency')
    # Static relative imports over ALL JS modules; no SDK/network request.
    for n,raw in data.items():
        if n.startswith(front) and n.endswith(('.mjs','.js')):
            for dep in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]',raw.decode()):
                if not dep.startswith('.'):continue
                normalized=os.path.normpath(str(PurePosixPath(n).parent/dep.split('?')[0])).replace('\\','/')
                require(normalized in data,'Missing JS dependency: '+normalized)
    critical=['START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','09_REPARAR_DEPENDENCIAS.bat',
        '08_PREPARAR_REDE_AMES.bat','05_ABRIR_CHROME_AMES.bat','01_TROCAR.bat',
        '01_TROCAR_PARA_PR69_NOVA.bat','suporte/ames-workstation/START_AGENT_CANONICAL.ps1',
        'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1','suporte/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1',
        'suporte/ames-workstation/SAFE_STATE_TRANSFER.py','suporte/ames-workstation/issue57_update_preflight.py','network/ensure_ames_route.ps1']
    require(all(n in data for n in critical),'Missing startup/switch dependency')
    require('ames-agent/candidate-files.json' not in data,'CLEAN mixed with legacy overlay')
    extracted=None
    if extract_to is not None:
        dest=Path(extract_to);require(dest.is_absolute() and not dest.exists(),'New absolute extraction destination required')
        dest.mkdir(mode=0o700)
        for name,raw in data.items():
            path=dest.joinpath(*PurePosixPath(name).parts);path.parent.mkdir(parents=True,exist_ok=True)
            with path.open('xb') as f:f.write(raw)
        actual={p.relative_to(dest).as_posix():sha(p.read_bytes()) for p in dest.rglob('*') if p.is_file()}
        require(actual==hashes,'Extracted hashes differ');extracted=True
    original=model['old'];added=sorted(set(data)-set(original));removed=sorted(set(original)-set(data));require(not removed,'EEDACC65 source-model path removed')
    return {'schema':'central-candidate-verification-v1','sha':expected_sha,'candidate_version':version,'zip_sha256':sha(Path(archive).read_bytes()),
        'members':len(data),'manifest_members':len(manifest['files']),'files':hashes,'components':components,
        'transformed_or_generated':sorted(model['cd']),'EEDACC65_source_model':{'members':len(original),'added':added,'removed':removed,'original_zip_available':False},
        'passive_extraction_verified':extracted,'code_imported':False,'operational_execution':False,'installation_authorized':False,'physical':'PENDING'}

def main():
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('--sha',required=True);p.add_argument('--extract-to');p.add_argument('--receipt',required=True);a=p.parse_args()
    receipt=verify(a.archive,a.sha,a.extract_to)
    with Path(a.receipt).open('x',encoding='utf-8') as f:json.dump(receipt,f,indent=2,ensure_ascii=False)
    print(json.dumps({k:v for k,v in receipt.items() if k!='files'},ensure_ascii=False))
if __name__=='__main__':main()
