"""Build one standalone clean local Central + A-MES candidate from canonical sources."""
import argparse, hashlib, json, os, subprocess, tempfile, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HASHES={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
_FORBIDDEN_EXACT={'config.json','local_agent_token','network_health.jsonl','.env','cookies.json','session.json'}
_FORBIDDEN_SUFFIXES={'.sqlite','.sqlite3','.db','.pyc','.log','.zip','.pem','.key'}

def assert_clean_payload(payload):
 bad=[]
 for name in payload:
  normalized=str(name).replace('\\','/')
  p=Path(normalized);base=p.name.lower();parts={part.lower() for part in p.parts}
  if normalized.startswith('ames-agent/data/') or '__pycache__' in parts or base in _FORBIDDEN_EXACT or p.suffix.lower() in _FORBIDDEN_SUFFIXES:
   bad.append(normalized)
 if bad:raise ValueError('Standalone CLEAN contains forbidden runtime/private files: '+', '.join(sorted(bad)))
 return True

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
 for p in ws.iterdir():
  if p.is_file():payload['suporte/ames-workstation/'+p.name]=p.read_bytes()
 for name in ['01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','START_LOCAL_CANDIDATE.ps1']:
  payload[name]=(ws/name).read_bytes()
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
 # Local boot does not load Firebase/CDNs. Online path still uses canonical Auth.
 html=html.replace('src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.49"','src="/Central-de-Controle-/local-entry.mjs"')
 import re
 html=re.sub(r'<script id="central-runtime-boot-guard">[\s\S]*?</script>','',html)
 payload[index]=html.encode()
 payload['frontend/Central-de-Controle-/local-entry.mjs']=b"if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local workstation requires loopback');\nif(new URLSearchParams(location.search).has('online'))await import('./offline-bootstrap.mjs?v=15.1.13.49');else await import('./core/local-workstation.mjs');\n"
 extra={k:hashlib.sha256(v).hexdigest() for k,v in payload.items() if k.startswith(('frontend/','factory-engine/','network/')) or k in ['ames-agent/requirements.txt','ames-agent/config.example.json','START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','09_REPARAR_DEPENDENCIAS.bat']}
 payload['LOCAL_BUNDLE_MANIFEST.json']=json.dumps({'sha':sha,'files':extra,'development':bool(dirty),'standalone_clean':True,'ames_start_date_default':config_example.get('ames_start_date')},indent=2).encode()
 for doc in (ROOT/'docs/ames').glob('integrated-v5*'):
  if doc.is_file():payload['evidence/'+doc.name]=doc.read_bytes()
 analytics_doc=ROOT/'docs/ames/falhas-do-dia-analytics.md'
 if analytics_doc.exists():payload['evidence/'+analytics_doc.name]=analytics_doc.read_bytes()
 payload['LEIA_PRIMEIRO.txt']=(f'''CENTRAL + A-MES — CANDIDATO CLEAN INTEGRADO
HEAD: {sha}
Gate fisico pendente. Nao e uma promocao de producao.

INSTALACAO / TESTE:
1. NAO altere, mova ou apague a CLEAN V3 funcional. Ela continua sendo o rollback fisico.
2. Extraia ESTE ZIP em uma pasta NOVA e independente.
3. Execute apenas 00_INICIAR_AQUI.bat.
4. O primeiro uso cria .venv, config.json e SQLite somente dentro desta nova pasta.
5. Entre manualmente no A-MES. Console local: http://127.0.0.1:8765/Central-de-Controle-/

ESTE PACOTE NAO E UM UPDATER:
- nao sobrepoe CLEAN V3;
- nao traz banco operacional, senha, cookie, sessao CDP ou token;
- nao depende de Vercel/Netlify/Internet para o uso operacional depois de preparado;
- usa um unico frontend local, agente, SQLite e scheduler.

3012 / HISTORICO:
- AMES_START_DATE nasce configuravel no posto (default atual do ambiente: {config_example.get('ames_start_date')});
- SN exata usa SQLite como cache e volta ao MES apenas para lacunas temporais;
- consulta ampla sem SN usa blocos/checkpoint;
- 3012 continua gate fisico ate prova no A-MES real.

VALIDACAO FISICA AINDA NECESSARIA:
- Shift 2114 1st 07:30-17:30 / 2nd 17:30-07:30 sem confirmar manualmente.
- 3012 real: Defect/Repair User/Time/Code/Comment e consulta historica por SN.
- Consulta SN: falha atual/antigas/material/PCBA anterior e 3022.
- 3028 hoje/anterior, TAN10101/2/3 separadas, reuso e processo com retrabalho.
- Turno de producao 3022 em casos reais e fronteiras de turno.
- Guardian TAXXX_5G / rota 172.29.185.215/32 em queda real.
- Reboot/bootstrap, performance e 9/9 desktop/mobile.

Se este candidato falhar, feche a pasta nova e volte a usar a CLEAN V3 intacta.
''').encode()
 assert_clean_payload(payload)
 manifest={'sha':sha,'baseline':'CLEAN_V3_20261013','implementation_reconciled':'CLEAN_V5_3012_SHIFT_20261013','pr26_sha':'f561a6ba65d80fef59e586e5b060a8cfbac79bc5','development':bool(dirty),'standalone_clean':True,'physical_gate':'PENDING','hashes_3028':HASHES,'ames_start_date_default':config_example.get('ames_start_date'),'files':{k:hashlib.sha256(v).hexdigest() for k,v in sorted(payload.items())}}
 payload['CANDIDATE_MANIFEST.json']=json.dumps(manifest,indent=2).encode()
 assert_clean_payload(payload)
 destination=Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
  for name,data in sorted(payload.items()):z.writestr(name,data)
 print(json.dumps({'file':str(destination.resolve()),'sha':sha,'development':bool(dirty),'standalone_clean':True,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'files':len(payload)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('destination');p.add_argument('--development',action='store_true');a=p.parse_args();build(a.destination,a.development)
