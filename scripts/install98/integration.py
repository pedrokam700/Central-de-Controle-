"""Execute genuine package preparation/bootstrap/transfer in contained Windows.

No substituted libraries, no MES endpoint, no factory data. Full interactive
switch remains separately measured; component success is never called its PASS.
"""
from contextlib import closing
import hashlib,json,os,pathlib,runpy,shutil,sqlite3,subprocess,sys,time,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
LAB=pathlib.Path(os.environ['INSTALL98_ROOT']).resolve()
EED='eedacc65445dea9967a92085777b878c1ee9c123'
ROWS=[]
def record(name,status,**fields):
 row={'check':name,'status':status,**fields};ROWS.append(row);print(json.dumps(row),flush=True)
 (LAB/'progress.json').write_text(json.dumps({'checks':ROWS,'physical':'PENDING','full_switch_qualified':any(x['check']=='full_01_TROCAR_and_START_LOCAL' and x['status']=='PASS' for x in ROWS) and any(x['check']=='nine_real_Windows_candidate_screens' and x['status']=='PASS' for x in ROWS)},indent=2))
def run(args,**kw):
 # Files avoid a Windows pipe-reader waiting indefinitely for inherited handles
 # in a long-lived descendant. They do not change or replace any tested code.
 label=str(time.monotonic_ns());out=LAB/('child-'+label+'.stdout');err=LAB/('child-'+label+'.stderr')
 print('REAL_CHILD_START '+str(args[0])+' '+label,flush=True)
 native_env=dict(os.environ)
 # pwsh7's PSModulePath must not shadow Windows PowerShell 5.1 modules.
 # Let each genuine native host initialize its own standard module path.
 native_env={k:v for k,v in native_env.items() if k.casefold()!='psmodulepath'}
 kw.setdefault('env',native_env)
 try:
  with out.open('w',encoding='utf-8') as of,err.open('w',encoding='utf-8') as ef:
   r=subprocess.run(list(map(str,args)),stdout=of,stderr=ef,timeout=kw.pop('timeout',180),**kw)
 except subprocess.TimeoutExpired:
  print(out.read_text(errors='replace')[-7000:]+err.read_text(errors='replace')[-7000:],flush=True)
  raise
 stdout=out.read_text(encoding='utf-8',errors='replace');stderr=err.read_text(encoding='utf-8',errors='replace')
 if r.returncode:print(stdout[-7000:]+stderr[-7000:],flush=True);raise RuntimeError('CHILD_FAILED:'+str(args[0]))
 print('REAL_CHILD_EXIT '+label+' 0',flush=True)
 return stdout
def api(root,path):
 token=(root/'ames-agent/data/local_agent_token').read_text().strip()
 req=urllib.request.Request('http://127.0.0.1:8765'+path,headers={'X-Central-Agent-Token':token})
 with urllib.request.urlopen(req,timeout=8) as r:return json.load(r)
def start(root):
 try:
  out=run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',root/'suporte/ames-workstation/START_AGENT_CANONICAL.ps1','-Root',root,'-MaxAttempts','1','-StartupTimeoutSeconds','25'],timeout=75)
 except Exception:
  state=root/'logs/agent_startup_state.json'
  if state.exists():
   raw=json.loads(state.read_text(encoding='utf-8-sig'));diag={k:raw.get(k) for k in ('status','message','pid','process_created_at','events','probe_error','capability_error','hardening_error')}
   print('NATIVE_STARTUP_DIAGNOSTIC '+json.dumps(diag,ensure_ascii=True),flush=True)
   (LAB/('startup-'+root.name+'.json')).write_text(json.dumps(diag,indent=2))
   if raw.get('pid'):
    ps="$p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+str(int(raw['pid']))+"'; if($p){@{pid=$p.ProcessId;created=([datetime]$p.CreationDate).ToUniversalTime().ToString('o');executable=$p.ExecutablePath;entry_present=([string]$p.CommandLine).Contains('"+str(root/'ames-agent/agent_hardened_entry.py').replace("'","''")+"');command=$(if(([string]$p.CommandLine).Contains('"+str(root).replace("'","''")+"')){$p.CommandLine}else{'UNPROVEN_ROOT_REDACTED'})}|ConvertTo-Json -Compress}"
    print('NATIVE_OWNER_OBSERVATION '+run(['powershell.exe','-NoProfile','-Command',ps]),flush=True)
    probe=LAB/'identity-probe.ps1'
    script=r"""param([string]$Root,[int]$Owner)
$ErrorActionPreference='Stop'
$source=Join-Path $Root 'suporte/ames-workstation/START_AGENT_CANONICAL.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors){throw 'PARSE_FAILED'}
foreach($name in @('Initialize-ArgvParser','Get-KnownPackage','Get-ProcessIdentity','Get-IdentityByPid')){
 $fn=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true))
 if($fn.Count -ne 1){throw 'FUNCTION_NOT_FOUND'}
 . ([scriptblock]::Create($fn[0].Extent.Text))
}
Initialize-ArgvParser
$p=Get-CimInstance Win32_Process -Filter "ProcessId = $Owner"
@{identity=(Get-ProcessIdentity $p);argv=@([CentralAmesArgv]::Split([string]$p.CommandLine));known_root=(Get-KnownPackage (Join-Path $Root 'ames-agent/agent_hardened_entry.py'));frozen=@(Get-FileHash (Join-Path $Root 'ames-agent/ames_3028.py'),(Join-Path $Root 'ames-agent/ames_3028_live.py')|Select-Object -ExpandProperty Hash)}|ConvertTo-Json -Depth 8 -Compress
"""
    probe.write_text(script)
    print('NATIVE_CLASSIFIER_OBSERVATION '+run(['powershell.exe','-NoProfile','-File',probe,'-Root',root,'-Owner',str(raw['pid'])]),flush=True)
  raise
 ready=api(root,'/api/v1/ready');hard=api(root,'/api/v1/hardening/health');cap=api(root,'/api/v1/v2/capabilities')
 assert ready['ready'] is True and hard['integrity']=='ok' and pathlib.Path(cap['package_root']).resolve()==root
 record('native_bootstrap_'+root.name,'PASS',pid=ready['pid'],sqlite=hard['integrity']);return ready['pid']
def stop(root,pid):
 # Only the exact launcher-owned birth/path recorded by the real starter.
 state=json.loads((root/'logs/agent_startup_state.json').read_text(encoding='utf-8-sig'));assert state['pid']==pid
 birth=state['process_created_at']
 expected=str(root/'ames-agent/agent_hardened_entry.py')
 code="$p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+str(pid)+"'; if(-not $p -or ([datetime]$p.CreationDate).ToUniversalTime().ToString('o') -ne '"+birth+"' -or $p.CommandLine -notlike '*"+expected.replace("'","''")+"*'){throw 'OWNER_CHANGED'}; $h=Get-Process -Id "+str(pid)+"; if($h.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') -ne ([datetime]'"+birth+"').ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')){throw 'BIRTH_CHANGED'}; $h.Kill(); if(-not $h.WaitForExit(5000)){throw 'OWNER_DID_NOT_EXIT'}"
 run(['powershell.exe','-NoProfile','-Command',code]);time.sleep(1)
def tables(root):
 with closing(sqlite3.connect(root/'ames-agent/data/ames_local.sqlite3')) as con:
  return {t:[list(r) for r in con.execute('SELECT * FROM "'+t+'" ORDER BY rowid')] for t in ('defect_observations','pcba_history','material_reuse','mes_revisions','snapshot_payload_revisions','repair_history_3012','process_raw_events','process_events','process_defect_contexts')}
def main():
 assert os.name=='nt' and os.environ['GITHUB_ACTIONS']=='true'
 assert LAB.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve() and LAB.name=='CENTRAL-INSTALL-LAB-'+os.environ['GITHUB_RUN_ID']
 assert json.loads((LAB/'containment.json').read_text(encoding='utf-8-sig'))['kernel_deny_proven'] is True
 sourceA=LAB/'source-A'
 run(['git','worktree','add','--detach',sourceA,EED],cwd=ROOT)
 for label,source in [('A',sourceA),('B',ROOT)]:
  archive=LAB/(label+'.zip');run([sys.executable,'-B',source/'scripts/build-integrated-candidate.py',archive],cwd=source)
  with zipfile.ZipFile(archive) as z:
   assert z.testzip() is None
   manifest=json.loads(z.read('CANDIDATE_MANIFEST.json'));assert manifest['sha']==(EED if label=='A' else os.environ['GITHUB_SHA'])
   for n,h in manifest['files'].items():assert hashlib.sha256(z.read(n)).hexdigest()==h
   z.extractall(LAB/label)
  root=LAB/label;shutil.copytree(LAB/'wheels',root/'vendor/wheels')
  out=run(['cmd.exe','/d','/c','call',root/'01_INSTALAR_UMA_VEZ.bat','/prepare'],cwd=root,timeout=300)
  assert not (root/'ames-agent/config.json').exists() and not (root/'ames-agent/data').exists()
  record('actual_installer_prepare_'+label,'PASS',no_runtime_created=True)
 # Genuine GUI backend, no patch or fake module. Images stay private and synthetic.
 py=LAB/'B/.venv/Scripts/python.exe'
 # Pillow is a verified TEST screenshot dependency, not imported by the agent.
 # PyScreeze leaves it optional; never substitute a fake imaging backend.
 run([py,'-m','pip','install','--no-index','--find-links',LAB/'wheels','Pillow==11.3.0'])
 record('test_only_screenshot_dependency','PASS',package='Pillow==11.3.0',operational_requirements_changed=False)
 gui=json.loads(run([py,'-B','-c',"import json,pyautogui,mouseinfo,pygetwindow,pyrect,pytweening,pymsgbox; from PIL import ImageGrab; im=ImageGrab.grab(); print(json.dumps({'screen':list(pyautogui.size()),'capture':list(im.size),'backend':pyautogui.platformModule.__name__}))"]))
 assert gui['screen'][0]>0 and gui['capture'][0]>0 and gui['backend']=='pyautogui._pyautogui_win'
 record('genuine_windows_GUI_dependencies','PASS',**gui)
 A=LAB/'A';B=LAB/'B';data=A/'ames-agent/data';data.mkdir()
 fixture=runpy.run_path(str(ROOT/'scripts/fixtures/p02_installation.py'));fixture['database'](data/'ames_local.sqlite3')
 (data/'local_agent_token').write_text('SYNTHETIC98-'+64*'x')
 (data/'checkpoints').mkdir();(data/'checkpoints/fixture.json').write_text('{"scope":"SYNTHETIC98","complete":true}')
 cfg=json.loads((A/'ames-agent/config.example.json').read_text());cfg.update(host='127.0.0.1',port=8765,engine_dir=str(A/'factory-engine'),
  ames_host='127.0.0.1',ames_port=9,ames_start_url='http://127.0.0.1:9/SYNTHETIC98',ames_wifi_profile='SYNTHETIC98-NO-WLAN',
  chrome_profile_dir=str(A/'SYNTHETIC98-CHROME'),auto_backup_on_start=False,allowed_origins=['http://127.0.0.1:8765'])
 (A/'ames-agent/config.json').write_text(json.dumps(cfg))
 initial=tables(A);pid=None
 try:
  pid=start(A);assert tables(A)==initial;stop(A,pid);pid=None
  # Real residual committed WAL after an abrupt writer exit, no active writer.
  code="import os,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA wal_autocheckpoint=0');c.execute(\"UPDATE repair_history_3012 SET repair_comment='SYNTHETIC98 COMMITTED WAL' WHERE rowid=1\");c.commit();os._exit(0)"
  run([py,'-B','-c',code,data/'ames_local.sqlite3']);assert (data/'ames_local.sqlite3-wal').exists()
  # Preserve the raw closed generation before any SQLite backup read.
  shutil.copytree(A/'ames-agent/data',LAB/'C0-data')
  helper=B/'suporte/ames-workstation/SAFE_STATE_TRANSFER.py';backup=LAB/'BACKUP-SYNTHETIC98'
  result=json.loads(run([py,'-B',helper,'stage','--old-root',A,'--new-root',B,'--backup-root',backup]))
  assert all(result[k] for k in ('backup_verified','restore_rehearsed','source_unchanged','staged_identity_verified'))
  assert tables(A)==tables(B);assert (B/'ames-agent/data/local_agent_token').read_bytes()==(data/'local_agent_token').read_bytes()
  record('real_helper_WAL_backup_transfer','PASS',raw_C0_preserved=True,all_historical_rows_equal=True)
  newcfg=json.loads((B/'ames-agent/config.json').read_text())
  record('candidate_engine_generation','PASS' if pathlib.Path(newcfg['engine_dir']).resolve()==B/'factory-engine' else 'RED',old_engine_still_selected=pathlib.Path(newcfg['engine_dir']).resolve()==A/'factory-engine')
  pid=start(B)
  with urllib.request.urlopen('http://127.0.0.1:8765/Central-de-Controle-/',timeout=5) as r:assert r.status==200
  record('actual_updated_frontend_served','PASS',nine_screen_render='NOT_YET_PROVEN')
  stop(B,pid);pid=None
  before=tables(B)
  with closing(sqlite3.connect(B/'ames-agent/data/ames_local.sqlite3')) as con:
   con.execute("UPDATE repair_history_3012 SET repair_comment='SYNTHETIC98 NEW B EVIDENCE' WHERE rowid=1");con.commit()
  newer=tables(B);assert before!=newer
  pid=start(B);assert tables(B)==newer;stop(B,pid);pid=None
  record('native_restart_preserves_new_B_evidence','PASS')
  # Fault injection at the real rollback boundary AFTER real B wrote new data.
  # No fake process, listener or starter: original branch may actually reopen A.
  native_env={k:v for k,v in os.environ.items() if k.casefold()!='psmodulepath'}
  result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'scripts/install98/rollback-probe.ps1'),'-OldRoot',str(A),'-CandidateRoot',str(B)],stdout=(LAB/'rollback.stdout').open('w'),stderr=(LAB/'rollback.stderr').open('w'),env=native_env,timeout=100)
  print((LAB/'rollback.stdout').read_text(errors='replace')[-5000:]+(LAB/'rollback.stderr').read_text(errors='replace')[-5000:],flush=True)
  rollback_output=(LAB/'rollback.stdout').read_text(errors='replace')
  if result.returncode!=1 or 'NATIVE_ROLLBACK_BRANCH_ENTERED' not in rollback_output:raise RuntimeError('ROLLBACK_PROBE_DID_NOT_EXECUTE_THE_REAL_BRANCH')
  try:
   live=api(A,'/api/v1/v2/capabilities');old_is_serving=pathlib.Path(live['package_root']).resolve()==A
  except Exception:old_is_serving=False
  safe_stop=(not old_is_serving and 'ROLLBACK_ANTIGO=STOP_NEW_OR_UNKNOWN_EVIDENCE' in rollback_output)
  record('rollback_must_STOP_after_new_B_evidence','PASS' if safe_stop else 'RED',old_generation_serving=old_is_serving,all_B_evidence_preserved=tables(B)==newer)
  if old_is_serving:
   ready=api(A,'/api/v1/ready');stop(A,ready['pid'])
  assert tables(B)==newer
  runpy.run_path(str(ROOT/'scripts/install98/full-switch.py'))['execute'](dict(LAB=LAB,A=A,B=B,ROOT=ROOT,run=run,api=api,start=start,stop=stop,tables=tables,record=record))
 finally:
  if pid is not None:
   try:stop(B if (B/'logs/agent_startup_state.json').exists() else A,pid)
   except Exception:pass
 if any(r['status']=='RED' for r in ROWS):raise SystemExit('PROVEN_INSTALLATION_DEFECT_REQUIRES_CORRECTION')
 if any(r['status']=='PENDING' for r in ROWS):raise SystemExit('FULL_INSTALLATION_QUALIFICATION_STILL_PENDING')
if __name__=='__main__':main()
