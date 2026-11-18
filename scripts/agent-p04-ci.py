"""CI-only provisioning/test driver. Never an operational/LAB installer.

Official hash-locked wheels ONLY; no sdist/build, browser download or archive.
Actual negative cases alter/restore only the disposable venv/report.
"""
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
TOOL=ROOT/'tools/ames-lab/windows_preflight.py'
LOCK=json.loads((ROOT/'tools/ames-lab/p04_windows_wheels.json').read_text(encoding='utf-8'))
BASE='5856eb3f0cc1dd391cf93217fd068f0a044f8ab2'


def run(args,**kwargs):return subprocess.run([str(x) for x in args],check=True,**kwargs)


def main():
    assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ['RUNNER_OS']=='Windows','Disposable Windows CI only'
    assert os.environ['GITHUB_REPOSITORY']=='pedrokam700/Central-de-Controle-'
    base=Path(os.environ['RUNNER_TOOL_CACHE'])/'Python/3.12.10/x64/python.exe'
    assert base.is_file(),'Preinstalled CPython3.12.10 x64 missing; installer/download forbidden'
    scratch=Path(os.environ['RUNNER_TEMP']).resolve();lab=scratch/('P04-SYNTHETIC-'+os.environ['GITHUB_RUN_ID'])
    lab.mkdir(mode=0o700);venv=lab/'venv';report=lab/'pip-report.json';lock=lab/'locked-wheels.txt'
    run([base,'-B','-c',"import sys,struct,json,sysconfig; assert sys.version_info[:3]==(3,12,10) and struct.calcsize('P')==8; print(json.dumps({'version':sys.version,'platform':sysconfig.get_platform()}))"])
    run([base,'-B','scripts/agent-distribution-guard-compat.test.py','-v'],cwd=ROOT)
    run([base,'-B','-m','venv','--without-pip',venv])
    py=venv/'Scripts/python.exe'
    lock.write_text('\n'.join(a['name']+' @ '+a['url']+' --hash=sha256:'+a['sha256'] for a in LOCK['artifacts'])+'\n',encoding='utf-8')
    run([base,'-B','-m','pip','--python',py,'--isolated','install','--no-index','--no-deps','--require-hashes','--only-binary=:all:','--no-cache-dir','--no-compile','--disable-pip-version-check','--report',report,'-r',lock])
    run([base,'-B','-m','pip','--python',py,'--isolated','check'])
    context={'schema':'ames-p04-ci-context-v1','scope':'SYNTHETIC_ONLY','base_sha':BASE,'code_sha':os.environ['GITHUB_SHA'],'run_id':os.environ['GITHUB_RUN_ID']}
    (lab/'context.json').write_text(json.dumps(context),encoding='utf-8')
    api=runpy.run_path(str(TOOL))
    def probe(reason=None):
        result=subprocess.run([str(py),'-I','-B',str(TOOL),'--ci-lab-root',str(lab)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=90)
        assert not result.stderr.strip(),result.stderr
        receipt=json.loads(result.stdout)
        if reason:
            assert result.returncode==2,(result.returncode,receipt)
            assert receipt['status']=='REFUSED' and receipt['reason']==reason,receipt
        else:
            print(result.stdout,flush=True)
            assert result.returncode==3,(result.returncode,receipt)
            assert api['verify_receipt'](receipt,os.environ['GITHUB_SHA'])
            assert receipt['assessment']['core_status']=='PASS' and receipt['assessment']['workstation_status']=='BLOCKED',receipt
            assert len(receipt['assessment']['missing_verified_wheels'])==6
        return receipt
    baseline=probe()
    site=venv/'Lib/site-packages'
    cases=[('wrong-official-wheel-hash',report,lambda b:json.dumps({**json.loads(b),'install':[{**x,'download_info':{**x['download_info'],'archive_info':{'hashes':{'sha256':'0'*64}}}} if x['metadata']['name'].lower()=='pandas' else x for x in json.loads(b)['install']]}).encode(),'WHEEL_ORIGIN_MISMATCH:pandas'),
      ('wrong-installed-version',site/'pandas-2.2.3.dist-info/METADATA',lambda b:b.replace(b'Version: 2.2.3',b'Version: 3.0.0',1),'INSTALLED_VERSION_MISMATCH:pandas'),
      ('wrong-native-wheel-tag',site/'greenlet-3.2.4.dist-info/WHEEL',lambda b:b.replace(b'cp312-cp312-win_amd64',b'cp311-cp311-win_amd64'),'WHEEL_TAG_MISMATCH:greenlet'),
      ('changed-package-before-import',site/'pyperclip/__init__.py',lambda b:b+b'\nraise RuntimeError("SYNTHETIC_IMPORT_CANARY_MUST_NOT_EXECUTE")\n','INSTALLED_RECORD_MISMATCH:pyperclip')]
    for name,path,transform,reason in cases:
        old=path.read_bytes();new=transform(old);assert old!=new,name
        try:path.write_bytes(new);probe(reason)
        finally:path.write_bytes(old)
        print(json.dumps({'P04_negative':name,'result':'PASS_EXPECTED_REFUSAL','reason':reason}),flush=True)
    for name,path in [('missing-native-extension',next((site/'greenlet').glob('_greenlet*.pyd'))),('missing-tzdata-resource',site/'tzdata/zoneinfo/America/Sao_Paulo')]:
        temp=path.with_name(path.name+'.P04-SYNTHETIC-MISSING');path.rename(temp)
        try:probe('INSTALLED_MEMBER_MISSING')
        finally:temp.rename(path)
        print(json.dumps({'P04_negative':name,'result':'PASS_EXPECTED_REFUSAL','reason':'INSTALLED_MEMBER_MISSING'}),flush=True)
    final=probe();assert final['receipt_sha256']==baseline['receipt_sha256'],'Disposable environment failed to return to verified state'
    (lab/'receipt.json').write_text(json.dumps(final,sort_keys=True,indent=2),encoding='utf-8')
    print(json.dumps({'P04_core':'PASS','P04_workstation':'BLOCKED_SOURCE_ONLY_GUI_WHEELS','negative_cases':6,'physical':'PENDING','code_sha':os.environ['GITHUB_SHA']}),flush=True)


if __name__=='__main__':main()
