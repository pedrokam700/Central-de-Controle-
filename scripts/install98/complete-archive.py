"""Close the real candidate over genuine, verified Windows runtime wheels.

Only the disposable Windows installer job may assemble the delivery. The base
archive verifier remains authoritative; no runtime, identity or fixture is added.
"""
import email,hashlib,json,os,pathlib,re,runpy,sys,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
def digest(content):return hashlib.sha256(content).hexdigest()
def canonical(name):return re.sub(r'[-_.]+','-',name).lower()
def dependencies(wheels,receipt,lock):
 expected={canonical(x['name']):x for x in lock['artifacts'] if x['scope']=='runtime'}
 sources=[{k:x[k] for k in ('name','version','url','sha256')} for x in lock['artifacts']]
 if receipt.get('sources')!=sources:raise ValueError('DEPENDENCY_SOURCE_PROVENANCE_MISMATCH')
 inventory=receipt.get('built_and_official_wheels',{})
 entries=list(wheels.iterdir())
 if len(expected)!=21 or len(inventory)!=21 or set(inventory)!={p.name for p in entries}:raise ValueError('INCOMPLETE_OR_UNEXPECTED_WHEEL_INVENTORY')
 result={};records=[];seen=set()
 for path in sorted(entries):
  if path.is_symlink() or not path.is_file() or path.suffix!='.whl' or path.resolve().parent!=wheels.resolve():raise ValueError('UNSAFE_WHEEL_PATH')
  content=path.read_bytes();actual=digest(content)
  if actual!=inventory[path.name]:raise ValueError('WHEEL_HASH_MISMATCH')
  with zipfile.ZipFile(path) as archive:
   names=archive.namelist();metadata=[n for n in names if n.endswith('.dist-info/METADATA')]
   if len(names)!=len(set(names)) or len(metadata)!=1 or archive.testzip() is not None:raise ValueError('INVALID_WHEEL_METADATA_OR_CRC')
   info=email.message_from_bytes(archive.read(metadata[0]));name=canonical(info.get('Name',''));version=info.get('Version','')
  source=expected.get(name)
  if not source or name in seen or source['version']!=version:raise ValueError('UNEXPECTED_OR_DUPLICATE_WHEEL_IDENTITY')
  if source['kind']=='bdist_wheel' and (source['filename']!=path.name or source['sha256']!=actual):raise ValueError('OFFICIAL_WHEEL_BYTES_CHANGED')
  if not (path.name.endswith('-py3-none-any.whl') or path.name.endswith('-py2.py3-none-any.whl') or path.name.endswith('-cp312-cp312-win_amd64.whl') or (source['kind']=='bdist_wheel' and path.name.endswith('-py3-none-win_amd64.whl'))):raise ValueError('UNREVIEWED_WHEEL_PLATFORM')
  seen.add(name);result['vendor/wheels/'+path.name]=content
  records.append({'name':source['name'],'version':version,'wheel':path.name,'wheel_sha256':actual,'source_url':source['url'],'source_sha256':source['sha256'],'method':'OFFICIAL_WHEEL' if source['kind']=='bdist_wheel' else 'GENUINE_SOURCE_BUILT_OFFLINE_UNDER_WFP'})
 if seen!=set(expected):raise ValueError('RUNTIME_DEPENDENCY_MISSING')
 return result,records
def assemble(base,destination,lab):
 assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Windows'
 assert lab.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve() and lab.name=='CENTRAL-INSTALL-LAB-'+os.environ['GITHUB_RUN_ID']
 assert base.parent==lab and destination.parent==lab and not destination.exists()
 assert json.loads((lab/'containment.json').read_text(encoding='utf-8-sig'))['kernel_deny_proven'] is True
 builder=runpy.run_path(str(ROOT/'scripts/build-integrated-candidate.py'))
 verification=builder['verify_zip'](base);assert verification['sha']==os.environ['GITHUB_SHA']
 wheels,records=dependencies(lab/'wheels',json.loads((lab/'dependency-receipt.json').read_text()),json.loads((ROOT/'scripts/install98/dependencies.json').read_text()))
 with zipfile.ZipFile(base) as archive:payload={name:archive.read(name) for name in archive.namelist() if name!='CANDIDATE_MANIFEST.json'}
 assert not any(name.startswith('vendor/') for name in payload),'UNREVIEWED_BASE_VENDOR_INPUT'
 payload.update(wheels)
 payload['evidence/current/PR98_INSTALACAO_WINDOWS_20261118.md']=(ROOT/'docs/ames/handoffs/PR98_INSTALACAO_WINDOWS_20261118.md').read_bytes()
 payload['vendor/RUNTIME_DEPENDENCIES.json']=json.dumps({'schema':'central98-offline-runtime-v1','sha':verification['sha'],'python':'3.12.10','platform':'Windows x86_64','sources_lock_sha256':digest((ROOT/'scripts/install98/dependencies.json').read_bytes()),'packages':records,'requirements_sha256':digest(payload['ames-agent/requirements.txt']),'prerequisites':['Genuine Python 3.12 x64 with venv/pip','Genuine Google Chrome x64'],'includes_emulators':False,'physical':'PENDING'},sort_keys=True,indent=2).encode()
 local=json.loads(payload['LOCAL_BUNDLE_MANIFEST.json']);local['files'].update({n:digest(b) for n,b in payload.items() if n.startswith('vendor/')})
 payload['LOCAL_BUNDLE_MANIFEST.json']=json.dumps(local,sort_keys=True,indent=2).encode()
 identity=json.loads(payload['PACKAGE_IDENTITY.json']);identity['limits']=['P04_ORIGINAL_WINDOWS_PENDING' if value=='P04_FULL_GUI_BLOCKED' else value for value in identity['limits']];identity['offline_runtime']={'packages':len(records),'manifest':'vendor/RUNTIME_DEPENDENCIES.json','platform':'Windows x86_64','python':'3.12.10'}
 payload['PACKAGE_IDENTITY.json']=json.dumps(identity,sort_keys=True,indent=2).encode()
 with zipfile.ZipFile(base) as archive:manifest=json.loads(archive.read('CANDIDATE_MANIFEST.json'))
 manifest['files']={n:digest(b) for n,b in sorted(payload.items())};manifest['offline_runtime_packages']=len(records)
 payload['CANDIDATE_MANIFEST.json']=json.dumps(manifest,sort_keys=True,indent=2).encode()
 builder['assert_clean_payload'](payload)
 with zipfile.ZipFile(destination,'x',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for name,content in sorted(payload.items()):
   info=zipfile.ZipInfo(name,(2026,11,19,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
   archive.writestr(info,content,compresslevel=9)
 verified=builder['verify_zip'](destination)
 receipt={'schema':'central98-complete-archive-v1','sha':verified['sha'],'zip_sha256':digest(destination.read_bytes()),'zip_bytes':destination.stat().st_size,'verified_manifest_files':verified['manifest_files'],'runtime_wheels':len(records),'private_state_included':False,'installation_qualified':False,'physical':'PENDING'}
 (lab/'complete-archive-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
if __name__=='__main__':assemble(pathlib.Path(sys.argv[1]).resolve(),pathlib.Path(sys.argv[2]).resolve(),pathlib.Path(os.environ['INSTALL98_ROOT']).resolve())
