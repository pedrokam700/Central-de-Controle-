"""Publish only bytes installed by Windows and covered by exact-SHA regressions."""
import hashlib,json,os,pathlib,re,time,urllib.request
REPO='pedrokam700/Central-de-Controle-';BRANCH='work/ames-windows-installation-20261118'
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ['GITHUB_REPOSITORY']==REPO and os.environ['GITHUB_REF_NAME']==BRANCH
sha=os.environ['GITHUB_SHA'];assert re.fullmatch('[a-f0-9]{40}',sha)
root=pathlib.Path(os.environ['INSTALL98_DELIVERY']).resolve()
load=lambda name:json.loads((root/name).read_text(encoding='utf-8'))
archive=root/('CENTRAL_AMES_CANDIDATA_'+sha+'.zip');actual=hashlib.sha256(archive.read_bytes()).hexdigest()
assert actual==load('complete-archive-receipt.json')['zip_sha256']==load('independent-archive-receipt.json')['zip_sha256']
assert load('independent-archive-receipt.json')['sha']==sha and load('complete-archive-receipt.json')['sha']==sha
assert load('progress.json')['full_switch_qualified'] is True and load('progress.json')['physical']=='PENDING'
assert all(r['status'] in ('PASS','EXPECTED_RED_BASELINE') for r in load('progress.json')['checks'])
ui=load('nine-screen-receipt.json');assert ui['qualified'] is True and ui['sha']==sha and len(ui['views'])==9 and all(v['rendered'] for v in ui['views'])
assert ui['identity_preserved'] and ui['agent_evidence_matches'] and not ui['auth_mocked'] and not ui['storage_injected'] and not ui['data_mocked']
expected={'ames-lab-existing-regressions.yml','ames-lab-isolation.yml','ames-p04-windows-preflight.yml','ames-p08-generations.yml'}
for attempt in range(60):
 request=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/runs?head_sha='+sha+'&per_page=100',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
 with urllib.request.urlopen(request,timeout=30) as response:runs=json.load(response)['workflow_runs']
 selected={}
 for run in sorted(runs,key=lambda r:r['id']):
  name=run['path'].rsplit('/',1)[-1]
  if name in expected and run['head_sha']==sha and run['event']=='push' and run['head_branch']==BRANCH:selected[name]=run
 if any(r['status']=='completed' and r['conclusion']!='success' for r in selected.values()):raise SystemExit('EXACT_SHA_REGRESSION_FAILURE_NO_DELIVERY')
 if set(selected)==expected and all(r['conclusion']=='success' for r in selected.values()):
  receipt={'schema':'central98-qualified-delivery-v1','sha':sha,'zip_sha256':actual,'genuine_windows_run':os.environ['GITHUB_RUN_ID'],'regressions':{n:{'run':r['id'],'url':r['html_url']} for n,r in selected.items()},'synthetic_windows_installation':'PASS','nine_real_screens':'PASS','factory_installation_authorized':False,'physical':'PENDING'}
  (root/'QUALIFICACAO_LAB.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps(receipt),flush=True);break
 print('EXACT_SHA_REGRESSIONS_PENDING '+str(attempt),flush=True);time.sleep(10)
else:raise SystemExit('EXACT_SHA_REGRESSION_GATE_INCOMPLETE_NO_DELIVERY')
