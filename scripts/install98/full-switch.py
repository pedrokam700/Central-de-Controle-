"""Whole delivered BAT/PS chain, real processes and journal, synthetic Windows only."""
from contextlib import closing
import json,os,pathlib,shutil,sqlite3,subprocess,threading,time,winreg,zipfile
RUN_KEY=r'Software\Microsoft\Windows\CurrentVersion\Run';RUN_NAME='CentralAMESOperatorAgent'
def quote(value):return str(value).replace("'","''")
def environment():return {k:v for k,v in os.environ.items() if k.casefold()!='psmodulepath'}
def execute(c):
 lab,A,B,ROOT,run,api,start,stop,tables,record=[c[k] for k in ('LAB','A','B','ROOT','run','api','start','stop','tables','record')]
 assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and lab.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve()
 assert json.loads((lab/'containment.json').read_text(encoding='utf-8-sig'))['kernel_deny_proven'] is True
 (lab/'.installation98-synthetic.json').write_text('CENTRAL98_SYNTHETIC_INSTALLATION_ONLY')
 def read_run():
  try:
   with winreg.OpenKey(winreg.HKEY_CURRENT_USER,RUN_KEY) as key:return winreg.QueryValueEx(key,RUN_NAME)[0]
  except FileNotFoundError:return None
 def set_run(value):
  with winreg.CreateKey(winreg.HKEY_CURRENT_USER,RUN_KEY) as key:
   if value is None:winreg.DeleteValue(key,RUN_NAME)
   else:winreg.SetValueEx(key,RUN_NAME,0,winreg.REG_SZ,value)
 def guardian_command(root):return 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+str(root/'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1')+'" -Root "'+str(root)+'"'
 identity_probe=lab/'guardian-identity.ps1'
 identity_probe.write_text(r"""param([string]$Source,[string]$ExpectedRoot)
$ErrorActionPreference='Stop'
$text=Get-Content -LiteralPath $Source -Raw
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors)
if($errors){throw 'COORDINATOR_PARSE_FAILED'}
$interop=[regex]::Match($text,"(?s)Add-Type -TypeDefinition @'\s*\r?\n(.*?)\r?\n'@")
if(-not $interop.Success){throw 'NATIVE_ARGV_PARSER_MISSING'}
Add-Type -TypeDefinition $interop.Groups[1].Value
foreach($name in @('Full','EqualPath','RootFor','SplitArgv','ValueAfter','Identify')){
 $node=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true))
 if($node.Count -ne 1){throw 'IDENTITY_HELPER_MISSING'}
 . ([scriptblock]::Create($node[0].Extent.Text))
}
$owners=@(Get-CimInstance Win32_Process|ForEach-Object {
 $p=$_;$identity=Identify $p
 if($identity -and $identity.kind -eq 'guardian' -and (EqualPath $identity.root $ExpectedRoot)){
  @{pid=[int]$p.ProcessId;created=([datetime]$p.CreationDate).ToUniversalTime().ToString('o');command=$p.CommandLine}
 }
})
ConvertTo-Json -InputObject $owners -Compress
""")
 def guardians(root):
  return json.loads(run(['powershell.exe','-NoProfile','-File',identity_probe,'-Source',B/'TROCAR_PARA_PR69_NOVA.ps1','-ExpectedRoot',root]))
 def stop_guardian(root):
  owners=guardians(root)
  assert len(owners)<=1,'guardian identity ambiguous'
  for owner in owners:
   script="$p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+str(owner['pid'])+"';if(-not $p -or ([datetime]$p.CreationDate).ToUniversalTime().ToString('o') -ne '"+owner['created']+"' -or $p.CommandLine -cne '"+quote(owner['command'])+"'){throw 'GUARDIAN_OWNER_CHANGED'};$h=Get-Process -Id "+str(owner['pid'])+";if($h.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') -ne ([datetime]'"+owner['created']+"').ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')){throw 'GUARDIAN_BIRTH_CHANGED'};$h.Kill();if(-not $h.WaitForExit(5000)){throw 'GUARDIAN_DID_NOT_EXIT'}"
   run(['powershell.exe','-NoProfile','-Command',script])
 def batch(root,extra_env=None):
  env=environment();env.update(extra_env or {})
  stamp=str(time.monotonic_ns());out=lab/('switch-'+stamp+'.stdout');err=lab/('switch-'+stamp+'.stderr')
  with out.open('w') as of,err.open('w') as ef:
   result=subprocess.run(['cmd.exe','/d','/c','call',str(root/'01_TROCAR.bat'),'/lab'],stdout=of,stderr=ef,cwd=root,env=env,timeout=240)
  text=out.read_text(encoding='utf-8',errors='replace')+err.read_text(encoding='utf-8',errors='replace')
  print('REAL_FULL_SWITCH '+root.name+' RC='+str(result.returncode)+'\n'+text[-12000:],flush=True)
  return result.returncode,text
 def pristine(root):return not (root/'ames-agent/config.json').exists() and not (root/'ames-agent/data').exists() and not (root/'.ames-switch').exists()
 def extract(root):
  with zipfile.ZipFile(lab/'B.zip') as z:
   assert z.testzip() is None;z.extractall(root)
  assert len(list((root/'vendor/wheels').glob('*.whl')))==21,'OFFLINE_DEPENDENCIES_MUST_BE_INSIDE_ACTUAL_ZIP'
  run(['cmd.exe','/d','/c','call',root/'01_INSTALAR_UMA_VEZ.bat','/prepare'],cwd=root,timeout=300)
  assert pristine(root)
 assert read_run() is None,'preexisting autostart identity must not be overwritten'
 S=lab/'S';T=lab/'T';extract(S)
 # Previous-browser fixture is created by genuine SDK/backend calls, then the
 # backend stops. The delivered candidate receives no emulator/Auth override.
 run([B/'.venv/Scripts/python.exe','-B',ROOT/'scripts/install98/auth-fixture.py',S],timeout=240)
 auth=json.loads((lab/'auth-fixture-receipt.json').read_text())
 assert auth['ready'] and auth['backend_stopped_before_candidate'] and not auth['auth_mocked'] and not auth['storage_injected']
 record('genuine_previous_browser_session_fixture','PASS',method=auth['method'],rules_real=True,role='user',admin_escalation_rejected=auth['admin_escalation_rejected'])
 original_A=tables(A);pid_A=start(A);controller=None
 guard_out=(lab/'guardian-A.stdout').open('w');guard_err=(lab/'guardian-A.stderr').open('w')
 try:
  set_run(guardian_command(A))
  controller=subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(A/'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1'),'-Root',str(A)],stdout=guard_out,stderr=guard_err,env=environment())
  time.sleep(1);assert len(guardians(A))==1
  # Run the NEW entry from the actual complete ZIP, against the genuine A
  # process/guardian/Run under containment, before any switch or backup.
  # No policy override is passed to this preflight and no file is substituted.
  preflight=run(['cmd.exe','/d','/c','call',S/'00_CONFERIR_ATUALIZACAO.bat'],cwd=S,stdin=subprocess.DEVNULL)
  observed=json.loads(preflight[preflight.index('{'):preflight.rindex('}')+1])
  assert observed['status']=='IDENTIFIED_ACTIVE' and pathlib.Path(observed['root']).resolve()==A
  assert observed['listener_owner_count']==1
  assert all(observed[k] is False for k in ('update_authorized','maintenance_lease','browser_sync_attested','state_originality_proven'))
  assert pristine(S) and tables(A)==original_A and read_run()==guardian_command(A)
  assert api(A,'/api/v1/ready')['pid']==pid_A
  record('delivered_assisted_preflight_identifies_real_A','PASS',actual_ZIP_entry=True,real_A_process=True,real_Run=True,no_policy_override=True,no_state_mutation=True,update_authorized=False)
  # Negative scope and WFP proofs use the actual entry without stopping A.
  rc,text=batch(S,{'GITHUB_ACTIONS':'false'})
  assert rc!=0 and 'LAB_HOST_UNVERIFIED' in text and api(A,'/api/v1/ready')['pid']==pid_A and pristine(S)
  record('whole_entry_refuses_non_CI_LAB_scope','PASS',real_batch=True)
  proof_path=lab/'containment.json';proof=proof_path.read_bytes();broken=json.loads(proof.decode('utf-8-sig'));broken['probe_pid']+=100000
  try:
   proof_path.write_text(json.dumps(broken));rc,text=batch(S)
   assert rc!=0 and 'LAB_WFP_DENIAL_UNVERIFIED' in text and api(A,'/api/v1/ready')['pid']==pid_A and pristine(S)
  finally:proof_path.write_bytes(proof)
  record('whole_entry_refuses_false_WFP_witness','PASS',kernel_proof_not_replaced=True)
  # Genuine manifest failure before stop: wrapper MUST preserve nonzero RC.
  script=S/'TROCAR_PARA_PR69_NOVA.ps1';original=script.read_bytes()
  try:
   script.write_bytes(original+b'\n# SYNTHETIC HASH FAULT\n');rc,text=batch(S)
   assert rc!=0 and 'TROCA_PR69=BLOCKED' in text and ('alterado' in text or 'divergente' in text)
   assert pristine(S) and api(A,'/api/v1/ready')['pid']==pid_A and tables(A)==original_A and read_run()==guardian_command(A)
  finally:script.write_bytes(original)
  record('whole_R0_manifest_failure_preserves_A_PID_data_and_Run','PASS',real_batch_rc=rc)
  rc,text=batch(S)
  assert rc==0 and 'TROCA_PR69=SUCCESS' in text and 'LAB_AUTHORIZATION=EXPLICIT_SYNTHETIC_CI' in text and 'OPERATOR_DIALOG=NOT_EXERCISED' in text
  ready=api(S,'/api/v1/ready');cap=api(S,'/api/v1/v2/capabilities');assert pathlib.Path(cap['package_root']).resolve()==S
  assert tables(S)==original_A and tables(A)==original_A and tables(B)!=original_A
  assert (S/'ames-agent/data/local_agent_token').read_bytes()==(A/'ames-agent/data/local_agent_token').read_bytes()
  assert (A/'.ames-update/switch-retired.txt').read_text()=='CENTRAL_SWITCH_RETIRED_GENERATION_PRESERVE_ALL_DATA'
  committed=json.loads((S/'.ames-switch/committed.json').read_text(encoding='utf-8-sig'));assert committed['phase']=='committed' and committed['candidate_may_have_run'] is True
  assert not guardians(A) and len(guardians(S))==1 and read_run()==guardian_command(S)
  record('full_01_TROCAR_and_START_LOCAL','PASS',candidate='S',real_BAT=True,real_local_launcher=True,real_guardian=True,real_Run=True,operator_dialog='NOT_EXERCISED',network_mode='LOCAL_ONLY_UNDER_KERNEL_DENY',historical_rows_equal=True)
  # Attempting A's REAL original starter must not take the current generation.
  out=lab/'retired-A.stdout';err=lab/'retired-A.stderr'
  with out.open('w') as of,err.open('w') as ef:
   r=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(A/'suporte/ames-workstation/START_AGENT_CANONICAL.ps1'),'-Root',str(A),'-MaxAttempts','1'],stdout=of,stderr=ef,env=environment(),timeout=45)
  message=out.read_text(errors='replace')+err.read_text(errors='replace');assert r.returncode!=0 and 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED' in message
  assert api(S,'/api/v1/ready')['pid']==ready['pid'] and tables(A)==original_A
  record('whole_switch_retired_A_cannot_reopen_stale_history','PASS')
  # Actual cold profile and actual delivered HTML/modules, no auth/data injection.
  run([S/'.venv/Scripts/python.exe','-B',ROOT/'scripts/install98/nine-screen-probe.py',S],timeout=90)
  ui=json.loads((lab/'browser-evidence/nine-screen-receipt.json').read_text())
  print('REAL_UI_DIAGNOSTIC '+json.dumps({k:ui.get(k) for k in ('blocker','static_MIME','console_errors','http_errors','external_dependencies_blocked')}),flush=True)
  record('nine_real_Windows_candidate_screens','PASS' if ui['qualified'] else 'PENDING',rendered=sum(x['rendered'] for x in ui['views']),blocker=ui['blocker'],auth_mocked=False)
  # New independent row keeps every existing record, technician and raw payload.
  with closing(sqlite3.connect(S/'ames-agent/data/ames_local.sqlite3')) as db:
   db.row_factory=sqlite3.Row;row=dict(db.execute('SELECT * FROM repair_history_3012 LIMIT 1').fetchone());row.update(row_key='SYNTHETIC98-NEW-S',repair_comment='SYNTHETIC98 new generation S evidence')
   raw=json.loads(row['raw_json']);raw.update(row_key=row['row_key'],repair_comment=row['repair_comment']);row['raw_json']=json.dumps(raw)
   db.execute('INSERT INTO repair_history_3012('+','.join('"'+k+'"' for k in row)+') VALUES('+','.join('?' for _ in row)+')',list(row.values()));db.commit()
  newer=tables(S);assert len(newer['repair_history_3012'])==len(original_A['repair_history_3012'])+1
  # A forced process exit followed by the REAL local starter must keep all rows.
  stop_guardian(S);stop(S,ready['pid'])
  run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',S/'START_LOCAL_CANDIDATE.ps1','-LocalOnly','-NoBrowser'],timeout=90)
  assert tables(S)==newer;record('whole_entry_local_restart_preserves_added_row','PASS',old_rows_preserved=True,new_rows=1)
  stop(S,api(S,'/api/v1/ready')['pid'])
  # A SECOND complete transition fails at the real durable commit write, after
  # the next generation has started and a new independent row was committed.
  # Fault injection is external I/O; no coordinator function or approval changes.
  extract(T);run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',S/'START_LOCAL_CANDIDATE.ps1','-LocalOnly','-NoBrowser'],timeout=90)
  prior=tables(S);set_run(guardian_command(S))
  g_out=(lab/'guardian-S.stdout').open('w');g_err=(lab/'guardian-S.stderr').open('w')
  s_guard=subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(S/'suporte/ames-workstation/KEEP_AGENT_RUNNING.ps1'),'-Root',str(S)],stdout=g_out,stderr=g_err,env=environment())
  witness={};worker_errors=[]
  def inject_commit_failure():
   try:
    deadline=time.monotonic()+140
    while not (T/'.ames-switch/candidate-intent.json').exists():
     if time.monotonic()>deadline:raise TimeoutError('REAL_CANDIDATE_INTENT_NOT_OBSERVED')
     time.sleep(.05)
    with (T/'.ames-switch/committed.json').open('xb') as stream:stream.write(b'SYNTHETIC98_EXTERNAL_COMMIT_IO_FAULT');stream.flush();os.fsync(stream.fileno())
    witness['commit_io_fault']=True
    while time.monotonic()<deadline:
     try:
      if pathlib.Path(api(T,'/api/v1/v2/capabilities')['package_root']).resolve()==T:
       with closing(sqlite3.connect(T/'ames-agent/data/ames_local.sqlite3')) as db:
        db.row_factory=sqlite3.Row;row=dict(db.execute('SELECT * FROM repair_history_3012 LIMIT 1').fetchone());row.update(row_key='SYNTHETIC98-NEW-T',repair_comment='SYNTHETIC98 new evidence before failed commit')
        raw=json.loads(row['raw_json']);raw.update(row_key=row['row_key'],repair_comment=row['repair_comment']);row['raw_json']=json.dumps(raw)
        db.execute('INSERT INTO repair_history_3012('+','.join('"'+k+'"' for k in row)+') VALUES('+','.join('?' for _ in row)+')',list(row.values()));db.commit()
       witness['new_row_committed']=True;return
     except (OSError,KeyError):pass
     time.sleep(.05)
    raise TimeoutError('REAL_NEXT_GENERATION_NOT_READY_BEFORE_COMMIT')
   except Exception as error:worker_errors.append(type(error).__name__+': '+str(error))
  worker=threading.Thread(target=inject_commit_failure,daemon=True);worker.start()
  rc,text=batch(T);worker.join(timeout=15)
  assert not worker.is_alive() and not worker_errors and witness=={'commit_io_fault':True,'new_row_committed':True},(worker_errors,witness)
  assert rc!=0 and 'TROCA_PR69=BLOCKED' in text and 'ROLLBACK_ANTIGO=STOP_NEW_OR_UNKNOWN_EVIDENCE' in text
  assert pathlib.Path(api(T,'/api/v1/v2/capabilities')['package_root']).resolve()==T
  after=tables(T);assert tables(S)==prior
  for table,rows in prior.items():assert all(row in after[table] for row in rows),table+' lost original evidence'
  assert len(after['repair_history_3012'])==len(prior['repair_history_3012'])+1
  assert (T/'.ames-switch/candidate-intent.json').is_file() and (T/'.ames-switch/committed.json').read_bytes()==b'SYNTHETIC98_EXTERNAL_COMMIT_IO_FAULT'
  assert (S/'.ames-update/switch-retired.txt').is_file() and read_run()==guardian_command(T) and not guardians(S)
  refusal=lab/'retired-S-refusal.stdout'
  with refusal.open('w') as stream:
   attempt=subprocess.run(['powershell.exe','-NoProfile','-File',str(S/'suporte/ames-workstation/START_AGENT_CANONICAL.ps1'),'-Root',str(S),'-MaxAttempts','1'],stdout=stream,stderr=subprocess.STDOUT,env=environment(),timeout=45)
  assert attempt.returncode!=0 and 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED' in refusal.read_text(errors='replace')
  assert tables(T)==after and pathlib.Path(api(T,'/api/v1/v2/capabilities')['package_root']).resolve()==T
  record('whole_entry_R2_commit_IO_failure_preserves_all_new_data','PASS',actual_write_failure=True,new_independent_rows=1,old_launcher_refused=True,old_Run_not_restored=True,old_generation_automatic_restart=False)
  stop_guardian(T);stop(T,api(T,'/api/v1/ready')['pid']);s_guard.wait(timeout=5);g_out.close();g_err.close()
 finally:
  # Only this synthetic fixture's attested processes/Run entry are eligible.
  for root in (A,S,T):
   try:stop_guardian(root)
   except Exception as error:print('OWNED_GUARDIAN_CLEANUP_REFUSED '+str(type(error).__name__),flush=True)
  value=read_run()
  if value in (guardian_command(A),guardian_command(S),guardian_command(T)):set_run(None)
  elif value is not None:raise RuntimeError('UNEXPECTED_RUN_ENTRY_PRESERVED')
  if controller is not None:
   try:controller.wait(timeout=2)
   except subprocess.TimeoutExpired:pass
  guard_out.close();guard_err.close()
