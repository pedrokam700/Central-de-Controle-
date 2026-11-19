"""Official pinned inputs only. Runs solely in disposable Windows Actions."""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,sys,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('phase',choices=['download','build']);a=p.parse_args()
 assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and sys.version_info[:3]==(3,12,10)
 lab=pathlib.Path(os.environ['INSTALL98_ROOT']).resolve();assert lab.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve() and lab.name=='CENTRAL-INSTALL-LAB-'+os.environ['GITHUB_RUN_ID']
 lock=json.loads((ROOT/'scripts/install98/dependencies.json').read_text());downloads=lab/'downloads';wheels=lab/'wheels';tools=lab/'build-tools'
 if a.phase=='download':
  lab.mkdir();downloads.mkdir();wheels.mkdir()
  for x in lock['artifacts']:
   assert x['url'].startswith('https://files.pythonhosted.org/packages/') and x['url'].endswith('/'+x['filename'])
   dst=downloads/x['filename']
   with urllib.request.urlopen(x['url'],timeout=90) as r:
    assert r.url.startswith('https://files.pythonhosted.org/packages/');dst.write_bytes(r.read())
   assert sha(dst)==x['sha256'],x['name']
   if x['kind']=='bdist_wheel' and x['scope']=='runtime':shutil.copyfile(dst,wheels/dst.name)
  subprocess.run([sys.executable,'-m','venv',str(tools)],check=True)
  req=lab/'build-tools.txt';req.write_text('\n'.join(str(downloads/x['filename'])+' --hash=sha256:'+x['sha256'] for x in lock['artifacts'] if x['scope']=='build'))
  subprocess.run([str(tools/'Scripts/python.exe'),'-m','pip','install','--no-index','--no-deps','--require-hashes','-r',str(req)],check=True)
  print('VERIFIED_OFFICIAL_INPUTS',len(lock['artifacts']))
  emulator_inputs=json.loads((ROOT/'scripts/install98/firebase-lab-inputs.json').read_text())
  auth_tools=lab/'auth-tools';auth_tools.mkdir()
  for entry in emulator_inputs['sources']:
   target=auth_tools/entry['path'];target.parent.mkdir(parents=True,exist_ok=True)
   assert entry['path'] in {'firebase-tools-win.exe','emulator-cache/cloud-firestore-emulator-v1.22.0.jar'}
   part=target.with_name(target.name+'.part');digest=hashlib.sha256();size=0
   with urllib.request.urlopen(urllib.request.Request(entry['url'],headers={'User-Agent':'CentralAMES-LAB-verified-inputs'}),timeout=180) as response,part.open('xb') as output:
    while chunk:=response.read(1024*1024):output.write(chunk);digest.update(chunk);size+=len(chunk)
   assert size==entry['size'] and digest.hexdigest()==entry['sha256'],entry['path']
   part.rename(target);print('VERIFIED_OFFICIAL_EMULATOR_INPUT',entry['path'],size,flush=True)
  (auth_tools/'verified-inputs.json').write_text(json.dumps(emulator_inputs,indent=2))
 else:
  assert json.loads((lab/'containment.json').read_text())['kernel_deny_proven'] is True
  for x in lock['artifacts']:
   if x['kind']!='sdist':continue
   src=downloads/x['filename'];assert sha(src)==x['sha256']
   subprocess.run([str(tools/'Scripts/python.exe'),'-m','pip','wheel','--no-index','--no-deps','--no-build-isolation','--wheel-dir',str(wheels),str(src)],check=True)
  receipt={'sources':[{k:x[k] for k in ('name','version','url','sha256')} for x in lock['artifacts']],
           'built_and_official_wheels':{p.name:sha(p) for p in sorted(wheels.glob('*.whl'))},'factory_installation_tested':False}
  (lab/'dependency-receipt.json').write_text(json.dumps(receipt,indent=2));assert len(receipt['built_and_official_wheels'])==21
  print('GENUINE_RUNTIME_WHEELS',len(receipt['built_and_official_wheels']))
if __name__=='__main__':main()
