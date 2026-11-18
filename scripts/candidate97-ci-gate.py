"""Wait only for this SHA's four existing guarded regression workflows."""
import json
import os
import re
import time
import urllib.request

REPO='pedrokam700/Central-de-Controle-'
BRANCH='work/ames-complete-candidate-20261118'
EXPECTED={'ames-lab-existing-regressions.yml','ames-lab-isolation.yml','ames-p04-windows-preflight.yml','ames-p08-generations.yml'}
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ['GITHUB_REPOSITORY']==REPO
assert os.environ['GITHUB_REF_NAME']==BRANCH
sha=os.environ['GITHUB_SHA'];assert re.fullmatch('[a-f0-9]{40}',sha)
for attempt in range(60):
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/runs?head_sha='+sha+'&per_page=100',headers={
        'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(req,timeout=30) as response:runs=json.load(response)['workflow_runs']
    selected={}
    for run in sorted(runs,key=lambda r:r['id']):
        name=run['path'].rsplit('/',1)[-1]
        if name in EXPECTED and run['head_sha']==sha and run['event']=='push' and run['head_branch']==BRANCH:selected[name]=run
    if any(r['status']=='completed' and r['conclusion']!='success' for r in selected.values()):raise SystemExit('Exact-SHA regression failure; no candidate build/publication')
    if set(selected)==EXPECTED and all(r['conclusion']=='success' for r in selected.values()):
        print(json.dumps({'sha':sha,'regression_gate':'PASS','runs':{k:{'id':v['id'],'url':v['html_url']} for k,v in selected.items()}}));break
    print(json.dumps({'sha':sha,'regression_gate':'WAIT','attempt':attempt,'seen':sorted(selected)}),flush=True);time.sleep(10)
else:raise SystemExit('Exact-SHA regression gate incomplete')
