"""Build one standalone clean local Central + A-MES candidate from canonical sources."""
import argparse, hashlib, json, os, re, subprocess, tempfile, zipfile
from pathlib import Path, PurePosixPath
import stat
ROOT=Path(__file__).resolve().parents[1]
HASHES={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
SUPPORT_FILES=('START_AGENT_CANONICAL.ps1','DIAGNOSTICO_POSTO.ps1','KEEP_AGENT_RUNNING.ps1','ISSUE57_RELAUNCH_ENROLLMENT.ps1',
 'SAFE_STATE_TRANSFER.py','issue57_update_preflight.py')
VERIFIER_FILES=('07_VERIFICAR_VERSAO_CENTRAL.bat','VERIFICAR_VERSAO_CENTRAL.ps1')
AT_SETUP_FILES=('00_PREPARAR_PENDRIVE_AT.bat','PREPARAR_DEPENDENCIAS_AT.ps1','01_INSTALAR_AT.bat',
 'INSTALAR_CENTRAL_AT.ps1','05_ABRIR_CHROME_AMES.bat','02_ABRIR_AT.bat','INICIAR_CENTRAL_AT.ps1')
FIRST_RUN_FILES=('08_PREPARAR_REDE_AMES.bat','01_TROCAR.bat','01_TROCAR_PARA_PR69_NOVA.bat','TROCAR_PARA_PR69_NOVA.ps1',
 '12_APLICAR_ROTA_AMES_PERSISTENTE.bat')
PACKAGE_DOCS=('INSTRUCOES_INSTALACAO_LIMPA.txt','MANUAL_LOGICA_CAPTURA_E_CRUZAMENTO.md','NOTAS_ALERTAS_SN_PR69.md','NOTAS_CORRECOES_28OUT_RESTAURACAO.md','NOTAS_VALIDACAO_FPY_TOP3_RASTREABILIDADE.md')
CANDIDATE_EVIDENCE=(
 'docs/ames/handoffs/ISSUE85_PR86_TIMELINE_20261116.md',
 'docs/ames/handoffs/PR87_CLASSIFICACAO_FISICA_3074_20261116.md',
 'docs/ames/handoffs/PR88_HORARIOS_PRODUTIVOS_3022_20261117.md',
 'docs/ames/handoffs/PR89_INTEGRACAO_FINAL_69_88_20261117.md',
 'docs/ames/handoffs/PR90_DESEMPENHO_GUARD_20261117.md',
 'docs/ames/handoffs/PR92_UPDATER_ROLLBACK_D01_D02_20261117.md',
 'docs/ames/handoffs/PR93_ENTRADA_LAB_P01_P03_P06_20261117.md',
 'docs/ames/handoffs/PR94_P02_SINTETICO_20261117.md',
 'docs/ames/handoffs/PR95_P04_WINDOWS_20261118.md',
 'docs/ames/handoffs/PR96_P08_G6_20261118.md',
 'docs/ames/audits/CONSOLIDACAO_EEDACC65_PR96_20261118.md',
 'docs/ames/audits/PR97_PACOTE_COMPLETO_20261118.md',
 'docs/ames/handoffs/PR97_CANDIDATA_COMPLETA_20261118.md')
CANDIDATE_INSTRUCTIONS='docs/ames/packaging/CANDIDATA_INSTALACAO_FUTURA_20261118.md'
_FORBIDDEN_EXACT={'config.json','local_agent_token','network_health.jsonl','.env','cookies.json','session.json'}
_FORBIDDEN_SUFFIXES={'.sqlite','.sqlite3','.db','.pyc','.log','.zip','.pem','.key'}
REQUIRED_FILES={'PACKAGE_IDENTITY.json','00_INICIAR_AQUI.bat','ames-agent/agent_entry.py','ames-agent/engine_bridge.py',
 'ames-agent/agent_hardened_entry.py','network/ensure_ames_route.ps1','LOCAL_BUNDLE_MANIFEST.json',
 'frontend/release-build.json','frontend/Central-de-Controle-/sw.js',
 *FIRST_RUN_FILES,*VERIFIER_FILES,*PACKAGE_DOCS,*('suporte/ames-workstation/'+n for n in SUPPORT_FILES),
 *('at-setup/'+n for n in AT_SETUP_FILES),'frontend/Central-de-Controle-/ames/at-viewer/index.html'}

def verify_build_identity(z,manifest):
 sha=manifest.get('sha')
 if not isinstance(sha,str) or not re.fullmatch(r'[0-9a-f]{40}',sha):raise ValueError('Invalid build SHA')
 missing=REQUIRED_FILES-set(z.namelist())
 if missing:raise ValueError('Required package files missing: '+', '.join(sorted(missing)))
 local=json.loads(z.read('LOCAL_BUNDLE_MANIFEST.json'))
 release=json.loads(z.read('frontend/release-build.json'))
 switch=z.read('TROCAR_PARA_PR69_NOVA.ps1').decode('utf-8-sig')
 sw=z.read('frontend/Central-de-Controle-/sw.js').decode('utf-8-sig')
 expected=re.findall(r"^\$ExpectedSha='([0-9a-f]{40})'",switch,re.M)
 cache=re.findall(r'''^const CACHE_REVISION=['"]([0-9a-f]{40})['"];''',sw,re.M)
 if local.get('sha')!=sha or release.get('sha')!=sha or expected!=[sha] or cache!=[sha]:
  raise ValueError('Build identity mismatch: manifest/local/release/switch/cache')
 for name,want in local.get('files',{}).items():
  if name not in manifest['files'] or hashlib.sha256(z.read(name)).hexdigest()!=want:
   raise ValueError('Local manifest hash mismatch: '+name)

def assert_clean_payload(payload):
 bad=[];seen=set()
 for name in payload:
  normalized=str(name);p=PurePosixPath(normalized);base=p.name.lower();parts={part.lower() for part in p.parts}
  if (not normalized or '\\' in normalized or ':' in normalized or normalized.startswith('/')
      or '/'.join(p.parts)!=normalized or any(x in ('.','..') or x.endswith(('.',' ')) or any(ord(c)<32 for c in x)
      or re.fullmatch(r'(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',x) for x in p.parts)
      or normalized.casefold() in seen):raise ValueError('Unsafe or aliased package path: '+normalized)
  seen.add(normalized.casefold())
  if normalized.lower().startswith('ames-agent/data/') or '__pycache__' in parts or base in _FORBIDDEN_EXACT or base.startswith('.env.') or base.endswith(('-wal','-shm','-journal')) or p.suffix.lower() in _FORBIDDEN_SUFFIXES:
   bad.append(normalized)
 if bad:raise ValueError('Standalone CLEAN contains forbidden runtime/private files: '+', '.join(sorted(bad)))
 return True

def verify_zip(destination):
 destination=Path(destination)
 with zipfile.ZipFile(destination) as z:
  if len(z.namelist())!=len(set(z.namelist())):raise ValueError('Duplicate ZIP paths')
  assert_clean_payload({name:b'' for name in z.namelist()})
  if any(stat.S_ISLNK(info.external_attr>>16) or info.flag_bits&1 or info.file_size>64*1024*1024 for info in z.infolist()):raise ValueError('Unsafe ZIP member')
  if sum(info.file_size for info in z.infolist())>256*1024*1024:raise ValueError('ZIP capacity exceeded')
  if z.testzip():raise ValueError('ZIP CRC failure')
  names=set(z.namelist())
  if 'CANDIDATE_MANIFEST.json' not in names:raise ValueError('CANDIDATE_MANIFEST.json missing from final ZIP')
  manifest=json.loads(z.read('CANDIDATE_MANIFEST.json').decode('utf-8'))
  files=manifest.get('files') if isinstance(manifest,dict) else None
  if not isinstance(files,dict):raise ValueError('Candidate manifest files map missing')
  expected=set(files)|{'CANDIDATE_MANIFEST.json'}
  missing=sorted(expected-names)
  if missing:raise ValueError('Manifest references missing ZIP files: '+', '.join(missing))
  extra=sorted(names-expected)
  if extra:raise ValueError('Final ZIP contains unmanifested files: '+', '.join(extra))
  mismatched=[]
  for name,want in files.items():
   got=hashlib.sha256(z.read(name)).hexdigest()
   if got!=want:mismatched.append(name)
  if mismatched:raise ValueError('Final ZIP hash mismatch: '+', '.join(sorted(mismatched)))
  assert_clean_payload({name:b'' for name in names})
  verify_build_identity(z,manifest)
  return {'zip_files':len(names),'manifest_files':len(files),'sha':manifest.get('sha')}

def build(destination, development=False):
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 dirty=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=ROOT,text=True).strip()
 if dirty and not development:raise ValueError('Commit candidate sources before building an exact-HEAD bundle')
 payload={}
 for p in (ROOT/'ames/agent').glob('*'):
  if p.suffix=='.py' or p.name in {'requirements.txt','config.example.json'}:payload['ames-agent/'+p.name]=p.read_bytes()
 if 'ames-agent/config.example.json' not in payload:raise ValueError('config.example.json missing from clean bundle')
 config_example=json.loads(payload['ames-agent/config.example.json'].decode('utf-8'))
 if not config_example.get('ames_start_date'):raise ValueError('Clean bundle requires configurable ames_start_date default')
 for name,expected in HASHES.items():
  if hashlib.sha256(payload['ames-agent/'+name]).hexdigest()!=expected:raise ValueError('Frozen collector changed: '+name)
 for p in (ROOT/'ames/factory-engine').rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts and (p.suffix=='.py' or (p.parent.name=='config' and p.suffix=='.json') or p.name=='requirements.txt'):
   payload['factory-engine/'+p.relative_to(ROOT/'ames/factory-engine').as_posix()]=p.read_bytes()
 ws=ROOT/'tools/ames-workstation'
 for name in SUPPORT_FILES:
  source=ws/name
  if not source.is_file():raise ValueError('Required workstation support file missing: '+name)
  payload['suporte/ames-workstation/'+name]=source.read_bytes()
 # Keep the AT workstation preparation scripts available, but NEVER label
 # this bundle an installable AT offline pendrive: the latter needs a separately
 # assembled, integrity-checked manifest, account bootstrap and vendor wheels.
 for name in AT_SETUP_FILES:
  source=ws/'at-setup'/name
  if not source.is_file():raise ValueError('Required AT preparation script missing: '+name)
  payload['at-setup/'+name]=source.read_bytes()
 for name in VERIFIER_FILES:
  source=ws/name
  if not source.is_file():raise ValueError('Required read-only version verification file missing: '+name)
  payload[name]=source.read_bytes()
 for name in ['01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','START_LOCAL_CANDIDATE.ps1']:
  payload[name]=(ws/name).read_bytes()
 for name in FIRST_RUN_FILES:
  source=ws/name
  if not source.is_file():raise ValueError('Required first-run/migration utility missing: '+name)
  data=source.read_bytes()
  if name=='TROCAR_PARA_PR69_NOVA.ps1':
   if data.count(b'__BUNDLE_SHA__')!=1:raise ValueError('PR69 migration SHA marker missing or ambiguous')
   data=data.replace(b'__BUNDLE_SHA__',sha.encode())
  payload[name]=data
 for name in PACKAGE_DOCS:
  source=ws/'package-docs'/name
  if not source.is_file():raise ValueError('Required PR69 instruction/evidence missing: '+name)
  payload[name]=source.read_bytes().replace(b'__BUNDLE_SHA__',sha.encode())
 payload['09_REPARAR_DEPENDENCIAS.bat']=(ws/'09_REPARAR_DEPENDENCIAS_CLEAN.bat').read_bytes()
 payload['network/ensure_ames_route.ps1']=(ws/'ensure_ames_route.ps1').read_bytes()
 launcher=b'@echo off\r\ncd /d "%~dp0"\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_LOCAL_CANDIDATE.ps1"\r\nif errorlevel 1 pause\r\n'
 for name in ['00_INICIAR_AQUI.bat','INICIAR_POSTO_CENTRAL_V2.bat','INICIAR_CENTRAL_AMES.cmd']:payload[name]=launcher
 with tempfile.TemporaryDirectory() as temp:
  subprocess.run(['node','scripts/build-static.mjs'],cwd=ROOT,env={**os.environ,'CENTRAL_STATIC_OUT':temp,'COMMIT':sha},check=True)
  for p in Path(temp).rglob('*'):
   if p.is_file():payload['frontend/'+p.relative_to(temp).as_posix()]=p.read_bytes()
 index='frontend/Central-de-Controle-/index.html'
 html=payload[index].decode()
 # IMPORTANT: the CLEAN must preserve the same integrated Central shell produced
 # by build-static. Older packaging replaced offline-bootstrap with local-entry,
 # creating a second Console-only mini-app and a second auth/navigation context.
 if 'src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.54"' not in html:
  raise ValueError('Integrated Central bootstrap missing from CLEAN index')
 if 'src="/Central-de-Controle-/local-entry.mjs"' in html:
  raise ValueError('CLEAN regressed to standalone local Console entry')
 for doc in (ROOT/'docs/ames').glob('integrated-v5*'):
  if doc.is_file():payload['evidence/'+doc.name]=doc.read_bytes()
 analytics_doc=ROOT/'docs/ames/falhas-do-dia-analytics.md'
 if analytics_doc.exists():payload['evidence/'+analytics_doc.name]=analytics_doc.read_bytes()
 unified_handoff=ROOT/'docs/ames/handoffs/ISSUE66_CANDIDATA_CONSOLIDADA_20261023.md'
 if unified_handoff.exists():payload['evidence/'+unified_handoff.name]=unified_handoff.read_bytes()
 recovery_handoff=ROOT/'docs/ames/handoffs/PR69_RECOVERY_20261030.md'
 payload['evidence/'+recovery_handoff.name]=recovery_handoff.read_bytes()
 audit_handoff=ROOT/'docs/ames/handoffs/PR69_3012_REUSO_20261106.md'
 payload['evidence/'+audit_handoff.name]=audit_handoff.read_bytes()
 prior_audit=ROOT/'docs/ames/handoffs/PR69_AUDITORIA_3012_REUSO_20261105.md'
 payload['evidence/'+prior_audit.name]=prior_audit.read_bytes()
 version='AMES-CANDIDATA-'+sha[:12]
 instructions=(ROOT/CANDIDATE_INSTRUCTIONS).read_text(encoding='utf-8').replace('__CANDIDATE_SHA__',sha).replace('__CANDIDATE_VERSION__',version).encode('utf-8')
 payload['LEIA_PRIMEIRO.txt']=instructions
 payload['INSTRUCOES_INSTALACAO_LIMPA.txt']=instructions
 for name in PACKAGE_DOCS:
  if name!='INSTRUCOES_INSTALACAO_LIMPA.txt':
   payload[name]=b'HISTORICO: consulte LEIA_PRIMEIRO.txt desta candidata antes de qualquer procedimento.\n\n'+payload[name]
 for source in CANDIDATE_EVIDENCE:payload['evidence/current/'+Path(source).name]=(ROOT/source).read_bytes()
 components={}
 for name,prefix in [('frontend','frontend/'),('agent','ames-agent/'),('engine','factory-engine/')]:
  members={k:hashlib.sha256(v).hexdigest() for k,v in sorted(payload.items()) if k.startswith(prefix)}
  components[name]={'code_sha':sha,'files':len(members),'members_sha256':hashlib.sha256(json.dumps(members,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
 payload['PACKAGE_IDENTITY.json']=json.dumps({'schema':'central-complete-candidate-v1','sha':sha,'candidate_version':version,
  'delivery':'INTEGRATED_CLEAN_COMPLETE','reference_test_sha':'eedacc65445dea9967a92085777b878c1ee9c123',
  'installation_authorized':False,'physical':'PENDING','legacy_updater_compatible':False,
  'future_supervised_entry':'01_TROCAR.bat','components':components,
  'limits':['P02_REAL_PENDING','P04_FULL_GUI_BLOCKED','P05_PENDING','P07_PENDING','P08_REAL_PENDING','G0_G7_PENDING','EEDACC65_ZIP_BYTES_UNAVAILABLE']},sort_keys=True,indent=2).encode()
 extra={k:hashlib.sha256(v).hexdigest() for k,v in payload.items() if k.startswith(('frontend/','factory-engine/','network/','at-setup/')) or k in ['ames-agent/requirements.txt','ames-agent/config.example.json','START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','09_REPARAR_DEPENDENCIAS.bat',*FIRST_RUN_FILES,*VERIFIER_FILES,*PACKAGE_DOCS] or k.startswith('suporte/ames-workstation/')}
 payload['LOCAL_BUNDLE_MANIFEST.json']=json.dumps({'sha':sha,'files':extra,'development':bool(dirty),'standalone_clean':True,'integrated_shell':True,'ames_start_date_default':config_example.get('ames_start_date'),'support_files':list(SUPPORT_FILES)},indent=2).encode()
 assert_clean_payload(payload)
 manifest={'sha':sha,'candidate_version':version,'delivery':'INTEGRATED_CLEAN_COMPLETE','installation_authorized':False,'baseline':'CLEAN_V3_20261013','implementation_reconciled':'CLEAN_V5_3012_SHIFT_20261013','pr26_sha':'f561a6ba65d80fef59e586e5b060a8cfbac79bc5','development':bool(dirty),'standalone_clean':True,'integrated_shell':True,'physical_gate':'PENDING','hashes_3028':HASHES,'ames_start_date_default':config_example.get('ames_start_date'),'support_files':list(SUPPORT_FILES),'files':{k:hashlib.sha256(v).hexdigest() for k,v in sorted(payload.items())}}
 payload['CANDIDATE_MANIFEST.json']=json.dumps(manifest,indent=2).encode()
 assert_clean_payload(payload)
 destination=Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(destination,'x',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,data in sorted(payload.items()):
   info=zipfile.ZipInfo(name,(2026,11,18,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
   z.writestr(info,data,compresslevel=9)
 verification=verify_zip(destination)
 if verification['sha']!=sha:raise ValueError('Final ZIP manifest SHA does not match build HEAD')
 print(json.dumps({'file':str(destination.resolve()),'sha':sha,'development':bool(dirty),'standalone_clean':True,'integrated_shell':True,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'files':len(payload),'verified_manifest_files':verification['manifest_files'],'verified_zip_files':verification['zip_files']}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('destination');p.add_argument('--development',action='store_true');a=p.parse_args();build(a.destination,a.development)
