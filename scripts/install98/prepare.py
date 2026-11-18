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
