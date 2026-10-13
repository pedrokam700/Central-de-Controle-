"""Build one local Central + A-MES candidate from canonical sources."""
import argparse, hashlib, json, os, subprocess, tempfile, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HASHES={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1','ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
def build(destination, development=False):
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 dirty=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=ROOT,text=True).strip()
 if dirty and not development:raise ValueError('Commit candidate sources before building an exact-HEAD bundle')
 payload={}
 for p in (ROOT/'ames/agent').glob('*'):
  if p.suffix=='.py' or p.name=='requirements.txt':payload['ames-agent/'+p.name]=p.read_bytes()
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
 # Boot guard is specific to the cloud login module; local mode has no such form.
 import re
 html=re.sub(r'<script id="central-runtime-boot-guard">[\s\S]*?</script>','',html)
 payload[index]=html.encode()
 payload['frontend/Central-de-Controle-/local-entry.mjs']=b"if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local workstation requires loopback');\nif(new URLSearchParams(location.search).has('online'))await import('./offline-bootstrap.mjs?v=15.1.13.49');else await import('./core/local-workstation.mjs');\n"
 # Reuse the transactional existing-install updater and its rollback protocol.
 import importlib.util
 spec=importlib.util.spec_from_file_location('migration',ROOT/'scripts/build-r12-migration-bundle.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 for name in ['ATUALIZAR_INSTALACAO_EXISTENTE.bat','ATUALIZAR_R12_EXISTENTE.bat']:payload[name]=mod._update_bat()
 for name in ['RESTAURAR_INSTALACAO_ANTERIOR.bat','ROLLBACK_R12_EXISTENTE.bat']:payload[name]=mod._rollback_bat()
 payload['ames-agent/candidate-files.json']=json.dumps({name:hashlib.sha256(payload['ames-agent/'+name]).hexdigest() for name in mod.FILES},indent=2).encode()
 extra={k:hashlib.sha256(v).hexdigest() for k,v in payload.items() if k.startswith(('frontend/','factory-engine/','network/')) or k in ['ames-agent/requirements.txt','START_LOCAL_CANDIDATE.ps1','01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','09_REPARAR_DEPENDENCIAS.bat']}
 payload['LOCAL_BUNDLE_MANIFEST.json']=json.dumps({'sha':sha,'files':extra,'development':bool(dirty)},indent=2).encode()
 for doc in (ROOT/'docs/ames').glob('integrated-v5*'):
  if doc.is_file():payload['evidence/'+doc.name]=doc.read_bytes()
 payload['LEIA_PRIMEIRO.txt']=(f'''CENTRAL + A-MES — CANDIDATO INTEGRADO
HEAD: {sha}
Gate fisico pendente. Nao e uma promocao de producao.

NO POSTO EXISTENTE (recomendado):
1. Feche o agente antigo. Extraia este ZIP em uma pasta temporaria.
2. Execute ATUALIZAR_INSTALACAO_EXISTENTE.bat e selecione a CLEAN V3.
3. O updater valida 3028, faz backup e preserva o mesmo SQLite/configuracao.
4. Na pasta atualizada, execute 00_INICIAR_AQUI.bat.
5. Entre manualmente no A-MES. Console local: http://127.0.0.1:8765/Central-de-Controle-/

NOVO POSTO: 00_INICIAR_AQUI.bat prepara Python/dependencias (internet ou vendor/wheels na primeira instalacao).
Depois de preparado, a inicializacao operacional nao depende de Vercel/Netlify/Internet.
O motor, frontend, agente, SQLite e scheduler sao unicos. Nenhum dado/sessao acompanha o ZIP.
A conta Central/sincronizacao usa o Auth existente e continua dependente da conexao e Rules autorizadas.

VALIDACAO FISICA:
- Shift 2114 1st 07:30-17:30 / 2nd 17:30-07:30 sem confirmar manualmente.
- Consulta SN: falha atual/antigas/material/PCBA anterior e 3022.
- 3028 hoje/anterior, TAN10101/2/3 separadas, reuso e processo com retrabalho.
- Filtros: CPH + familia + uso + relacao; PCBA agregada abre SNs individuais.
- Reboot, rota /32 persistente, internet indisponivel com MES disponivel, performance.
- Operador 3022: comparar os campos com RAW real; exemplo nominal nao foi provado no anexo.

ROLLBACK: RESTAURAR_INSTALACAO_ANTERIOR.bat seleciona backup; preserva SQLite operacional.
''').encode()
 manifest={'sha':sha,'baseline':'CLEAN_V3_20261013','implementation_reconciled':'CLEAN_V5_3012_SHIFT_20261013','pr26_sha':'f561a6ba65d80fef59e586e5b060a8cfbac79bc5','development':bool(dirty),'physical_gate':'PENDING','hashes_3028':HASHES,'files':{k:hashlib.sha256(v).hexdigest() for k,v in sorted(payload.items())}}
 payload['CANDIDATE_MANIFEST.json']=json.dumps(manifest,indent=2).encode()
 destination=Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
  for name,data in sorted(payload.items()):z.writestr(name,data)
 print(json.dumps({'file':str(destination.resolve()),'sha':sha,'development':bool(dirty),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'files':len(payload)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('destination');p.add_argument('--development',action='store_true');a=p.parse_args();build(a.destination,a.development)
