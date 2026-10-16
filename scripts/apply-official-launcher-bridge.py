from pathlib import Path


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old,new,1)

p=Path('scripts/build-integrated-candidate.py')
t=p.read_text(encoding='utf-8')
t=replace_once(t,
"import argparse, hashlib, json, os, subprocess, tempfile, zipfile\n",
"import argparse, hashlib, json, os, subprocess, tempfile, zipfile\nfrom urllib.parse import urlsplit\n",
'import urlsplit')
old=""" config_example=json.loads(payload['ames-agent/config.example.json'].decode('utf-8'))
 if not config_example.get('ames_start_date'):raise ValueError('Clean bundle requires configurable ames_start_date default')
"""
new=""" config_example=json.loads(payload['ames-agent/config.example.json'].decode('utf-8'))
 if not config_example.get('ames_start_date'):raise ValueError('Clean bundle requires configurable ames_start_date default')
 preview_urls=[u.strip().rstrip('/') for u in os.environ.get('CENTRAL_PREVIEW_URLS','').split(';') if u.strip()]
 if preview_urls:
  origins=[]
  for value in preview_urls:
   parsed=urlsplit(value)
   if parsed.scheme!='https' or not parsed.netloc:raise ValueError('CENTRAL_PREVIEW_URLS requires absolute https URLs')
   origins.append(f'{parsed.scheme}://{parsed.netloc}')
  config_example['allowed_origins']=list(dict.fromkeys([*(config_example.get('allowed_origins') or []),*origins]))
  payload['ames-agent/config.example.json']=(json.dumps(config_example,ensure_ascii=False,indent=2)+'\\n').encode('utf-8')
"""
t=replace_once(t,old,new,'candidate preview origins')
old=""" for name in ['01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','START_LOCAL_CANDIDATE.ps1']:
  payload[name]=(ws/name).read_bytes()
 payload['09_REPARAR_DEPENDENCIAS.bat']=(ws/'09_REPARAR_DEPENDENCIAS_CLEAN.bat').read_bytes()
 payload['network/ensure_ames_route.ps1']=(ws/'ensure_ames_route.ps1').read_bytes()
 launcher=b'@echo off\\r\\ncd /d "%~dp0"\\r\\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_LOCAL_CANDIDATE.ps1"\\r\\nif errorlevel 1 pause\\r\\n'
 for name in ['00_INICIAR_AQUI.bat','INICIAR_POSTO_CENTRAL_V2.bat','INICIAR_CENTRAL_AMES.cmd']:payload[name]=launcher
"""
new=""" for name in ['01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','START_LOCAL_CANDIDATE.ps1']:
  payload[name]=(ws/name).read_bytes()
 payload['09_REPARAR_DEPENDENCIAS.bat']=(ws/'09_REPARAR_DEPENDENCIAS_CLEAN.bat').read_bytes()
 payload['network/ensure_ames_route.ps1']=(ws/'ensure_ames_route.ps1').read_bytes()
 for name in ['ROTA_AMES_APLICAR.bat','ROTA_AMES_REMOVER.bat']:
  source=ws/name
  if source.is_file():payload['suporte/ames-workstation/'+name]=source.read_bytes()
 canonical_launcher=(ws/'INICIAR_POSTO_CENTRAL_V2.bat').read_bytes()
 payload['INICIAR_POSTO_CENTRAL_V2.bat']=canonical_launcher
 entry=(b'@echo off\\r\\ncd /d "%~dp0"\\r\\nif exist "%~dp0FRONTEND_GATE.json" (\\r\\n  call "%~dp0INICIAR_POSTO_CENTRAL_V2.bat"\\r\\n) else (\\r\\n  call "%~dp0INICIAR_POSTO_CENTRAL_V2.bat" /prod\\r\\n)\\r\\nif errorlevel 1 pause\\r\\n')
 payload['00_INICIAR_AQUI.bat']=entry
 payload['INICIAR_CENTRAL_AMES.cmd']=entry
 if preview_urls:
  payload['FRONTEND_GATE.json']=(json.dumps({'expected_sha':sha,'preview_urls':preview_urls},ensure_ascii=False,indent=2)+'\\n').encode('utf-8')
"""
t=replace_once(t,old,new,'canonical web launcher packaging')
t=t.replace('5. Central e Console MES usam o MESMO frontend local: http://127.0.0.1:8765/Central-de-Controle-/','5. O launcher abre a Central web exata (preview validado no candidato; dominio oficial na versao publicada) e pareia o agente local 127.0.0.1:8765.')
t=t.replace('6. Console MES e uma view interna da Central: entrar/sair nao abre outra aplicacao nem exige um segundo login.','6. Console MES e uma view interna da mesma Central web; o frontend local permanece apenas como fallback/suporte offline.')
p.write_text(t,encoding='utf-8')
