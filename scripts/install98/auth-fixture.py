"""Prepare previous-browser state using OFFICIAL SDK/emulators, never auth mocks.

This fixture is NOT delivered as part of the Central. Its backend is stopped
before the candidate runs. Do not mutate Auth storage/JWT/user objects directly.
"""
import hashlib,http.server,json,os,pathlib,re,shutil,signal,socket,subprocess,sys,threading,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
LAB=pathlib.Path(os.environ['INSTALL98_ROOT']).resolve()
TARGET=pathlib.Path(sys.argv[1]).resolve()
assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Windows'
assert LAB.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve() and LAB.name=='CENTRAL-INSTALL-LAB-'+os.environ['GITHUB_RUN_ID'] and TARGET.parent==LAB
assert (LAB/'.installation98-synthetic.json').read_text()=='CENTRAL98_SYNTHETIC_INSTALLATION_ONLY'
proof=json.loads((LAB/'containment.json').read_text(encoding='utf-8-sig'));assert proof['kernel_deny_proven'] is True
for name in ('FIREBASE_TOKEN','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_CONFIG','GOOGLE_GHA_CREDS_PATH','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE'):
 assert not os.environ.get(name),'UNEXPECTED_CLOUD_CREDENTIAL_ENVIRONMENT'
TOOLS=LAB/'auth-tools';INPUTS=json.loads((ROOT/'scripts/install98/firebase-lab-inputs.json').read_text())
for entry in INPUTS['sources']:
 p=TOOLS/entry['path'];h=hashlib.sha256()
 with p.open('rb') as stream:
  while chunk:=stream.read(1024*1024):h.update(chunk)
 assert p.stat().st_size==entry['size'] and h.hexdigest()==entry['sha256']
PROFILE=LAB/'existing-synthetic-profile';assert not PROFILE.exists(),'PREEXISTING_BROWSER_IDENTITY_REFUSED'
# Use exactly the deployed public namespace/API key; no real credential is read.
source=(ROOT/'offline-bootstrap.mjs').read_text();literal=re.search(r'const firebaseConfig=({.*?});',source,re.S).group(1)
CONFIG={k:json.loads(v) for k,v in re.findall(r'(\w+)\s*:\s*("(?:[^"\\]|\\.)*")',literal)}
assert set(CONFIG)=={'apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId'}
RULES=ROOT/'firestore.rules';rules_hash=hashlib.sha256(RULES.read_bytes()).hexdigest()
# All config/cache belongs to this synthetic run. No login or deploy command.
env={k:v for k,v in os.environ.items() if k.casefold()!='psmodulepath'}
for key,leaf in [('XDG_CONFIG_HOME','firebase-config'),('APPDATA','firebase-appdata'),('LOCALAPPDATA','firebase-localappdata')]:
 location=LAB/leaf;location.mkdir();env[key]=str(location)
env.update(FIREBASE_EMULATORS_PATH=str(TOOLS/'emulator-cache'),CI='true',NO_UPDATE_NOTIFIER='1',METADATA_DETECTION='none',GCE_METADATA_HOST='127.0.0.1:9',GCE_METADATA_IP='127.0.0.1')
configstore=LAB/'firebase-config/configstore';configstore.mkdir();(configstore/'firebase-tools.json').write_text('{"usage":false}')
config=LAB/'firebase-emulator-fixture.json';config.write_text(json.dumps({'firestore':{'rules':str(RULES)},'emulators':{'auth':{'host':'127.0.0.1','port':9099},'firestore':{'host':'127.0.0.1','port':8080},'hub':{'host':'127.0.0.1','port':4400},'logging':{'host':'127.0.0.1','port':4500},'ui':{'enabled':False},'singleProjectMode':True}}))
CLI=TOOLS/'firebase-tools-win.exe';java=shutil.which('java');assert java
java_version=subprocess.run([java,'-version'],capture_output=True,text=True,check=True).stderr
assert re.search(r'version "21\.',java_version),'GENUINE_JAVA21_REQUIRED'
# Read back ACTIVE OS rules before executing either genuine tool.
policy=LAB/'verify-auth-containment.ps1'
policy.write_text("""param([string]$Group,[string]$CLI,[string]$Java)
$ErrorActionPreference='Stop'
$r=@(Get-NetFirewallRule -Group $Group -ErrorAction Stop)
if(@($r|Where-Object {$_.Enabled -ne 'True' -or $_.Action -ne 'Block' -or $_.Direction -ne 'Outbound'}).Count){throw 'AUTH_RULES_UNVERIFIED'}
foreach($rule in $r){if(@($rule|Get-NetFirewallAddressFilter|Where-Object {$_.RemoteAddress -ne 'Any'}).Count){throw 'AUTH_EGRESS_SCOPE_UNVERIFIED'}}
$p=@($r|Get-NetFirewallApplicationFilter|ForEach-Object {$_.Program})
if($p -notcontains $CLI -or $p -notcontains $Java){throw 'AUTH_EXECUTABLE_NOT_CONTAINED'}
if(@(Get-NetFirewallProfile|Where-Object {-not $_.Enabled}).Count){throw 'AUTH_FIREWALL_DISABLED'}
Write-Output 'OFFICIAL_EMULATOR_PROGRAMS_CONTAINED'
""")
subprocess.run(['powershell.exe','-NoProfile','-File',str(policy),'-Group','CENTRAL98-'+os.environ['GITHUB_RUN_ID'],'-CLI',str(CLI),'-Java',java],env=env,check=True)
def port_open(port):
 with socket.socket() as sock:sock.settimeout(.3);return sock.connect_ex(('127.0.0.1',port))==0
assert not any(port_open(p) for p in (8765,8080,9099)),'LAB_PORT_ALREADY_OWNED'
cli_out=(LAB/'emulator-private.stdout').open('w');cli_err=(LAB/'emulator-private.stderr').open('w')
proc=None;server=None;thread=None;receipt=None
PREPARE=r'''import {initializeApp,SDK_VERSION} from '/Central-de-Controle-/vendor/browser/firebase/10.8.0/firebase-app.js';
import {getAuth,connectAuthEmulator,setPersistence,browserLocalPersistence,createUserWithEmailAndPassword,getIdTokenResult} from '/Central-de-Controle-/vendor/browser/firebase/10.8.0/firebase-auth.js';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,connectFirestoreEmulator,doc,setDoc,updateDoc,getDocFromServer,getDocFromCache,waitForPendingWrites,disableNetwork} from '/Central-de-Controle-/vendor/browser/firebase/10.8.0/firebase-firestore.js';
try {
 const config=__CONFIG__;const app=initializeApp(config);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099');
 const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});connectFirestoreEmulator(db,'127.0.0.1',8080);
 await setPersistence(auth,browserLocalPersistence);
 const credential=await createUserWithEmailAndPassword(auth,'central98@synthetic.invalid',crypto.randomUUID()+'-SYNTHETIC98');
 const user=credential.user,ref=doc(db,'users',user.uid),now=new Date().toISOString();
 await setDoc(ref,{name:'Central98 LAB sintético',email:user.email,role:'user',disabled:false,createdAt:now,updatedAt:now});
 await waitForPendingWrites(db);
 let denied=false;try {await updateDoc(ref,{role:'admin'});}catch(error){denied=error.code==='permission-denied';}
 if(!denied)throw Error('REAL_RULES_DID_NOT_REJECT_ROLE_ESCALATION');
 const profile=await getDocFromServer(ref),cached=await getDocFromCache(ref),token=await getIdTokenResult(user);
 if(profile.data().role!=='user'||cached.data().role!=='user'||token.claims.aud!==config.projectId||token.claims.iss!=='https://securetoken.google.com/'+config.projectId)throw Error('GENUINE_IDENTITY_OR_CACHE_MISMATCH');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.uid));
 const uidHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 await disableNetwork(db);
 window.__authFixture={ready:true,uid_sha256:uidHash,sdk:SDK_VERSION,namespace_matches_candidate:true,role:'user',admin_escalation_rejected:denied,cache_verified:true};
} catch(error){window.__authFixture={ready:false,error:String(error?.code||error?.message||error)};}
'''.replace('__CONFIG__',json.dumps(CONFIG))
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/__synthetic_auth_prepare__.html':body=b'<!doctype html><title>Explicit synthetic Auth fixture</title><script type="module" src="/__synthetic_auth_prepare__.mjs"></script>';kind='text/html'
  elif self.path=='/__synthetic_auth_prepare__.mjs':body=PREPARE.encode();kind='application/javascript'
  elif self.path.startswith('/Central-de-Controle-/vendor/browser/'):
   p=(TARGET/'frontend'/self.path.lstrip('/')).resolve()
   if not p.is_relative_to((TARGET/'frontend').resolve()) or not p.is_file():self.send_error(404);return
   body=p.read_bytes();kind='application/javascript' if p.suffix=='.js' else 'text/plain'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',kind+'; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
try:
 proc=subprocess.Popen([str(CLI),'emulators:start','--only','auth,firestore','--project',CONFIG['projectId'],'--config',str(config),'--non-interactive'],cwd=LAB,env=env,stdout=cli_out,stderr=cli_err,creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
 deadline=time.monotonic()+110
 while time.monotonic()<deadline and not all(port_open(p) for p in (8080,9099)):
  if proc.poll() is not None:raise RuntimeError('OFFICIAL_EMULATOR_EXITED_BEFORE_READY')
  time.sleep(.5)
 assert all(port_open(p) for p in (8080,9099)),'OFFICIAL_EMULATORS_NOT_READY'
 server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 with sync_playwright() as p:
  context=p.chromium.launch_persistent_context(str(PROFILE),executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad','--no-first-run'])
  def only_local(route):
   from urllib.parse import urlsplit
   u=urlsplit(route.request.url)
   if u.scheme=='http' and u.hostname=='127.0.0.1' and u.port in (8765,8080,9099):route.continue_()
   else:route.abort('blockedbyclient')
  context.route('**/*',only_local);page=context.new_page()
  page.goto('http://127.0.0.1:8765/__synthetic_auth_prepare__.html',wait_until='networkidle',timeout=30000)
  page.wait_for_function('window.__authFixture!==undefined',timeout=45000)
  receipt=page.evaluate('window.__authFixture');assert receipt.get('ready'),receipt
  assert receipt['sdk']=='10.8.0';context.close()
 receipt.update(schema='central98-genuine-prior-session-v1',method='OFFICIAL_AUTH_AND_FIRESTORE_EMULATORS',auth_mocked=False,storage_injected=False,cloud_access=False,operator_approval_simulated=False,rules_sha256=rules_hash,physical='PENDING')
finally:
 if server:server.shutdown();server.server_close()
 if thread:thread.join(timeout=3)
 if proc and proc.poll() is None:
  try:proc.send_signal(signal.CTRL_BREAK_EVENT);proc.wait(timeout=12)
  except (OSError,subprocess.TimeoutExpired):proc.kill();proc.wait(timeout=5)
 # Reclaim ONLY the emulator JAR started from this unique LAB input path.
 jar=str(TOOLS/'emulator-cache/cloud-firestore-emulator-v1.22.0.jar').replace("'","''")
 cleanup=LAB/'stop-owned-emulator.ps1';cleanup.write_text("$ErrorActionPreference='Stop'\n$owners=@(Get-CimInstance Win32_Process|Where-Object {$_.Name -eq 'java.exe' -and $_.CommandLine -and $_.CommandLine.Contains('"+jar+"')});foreach($owner in $owners){$again=Get-CimInstance Win32_Process -Filter \"ProcessId=$($owner.ProcessId)\";if(-not $again -or $again.CreationDate -ne $owner.CreationDate -or $again.CommandLine -cne $owner.CommandLine){throw 'EMULATOR_OWNER_CHANGED'};$h=Get-Process -Id $owner.ProcessId;if($h.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') -ne ([datetime]$owner.CreationDate).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')){throw 'EMULATOR_BIRTH_CHANGED'};$h.Kill();if(-not $h.WaitForExit(5000)){throw 'EMULATOR_DID_NOT_EXIT'}}")
 subprocess.run(['powershell.exe','-NoProfile','-File',str(cleanup)],env=env,check=True)
 cli_out.close();cli_err.close()
 if receipt is None:
  print('OFFICIAL_EMULATOR_FAILURE '+(LAB/'emulator-private.stdout').read_text(errors='replace')[-3000:]+(LAB/'emulator-private.stderr').read_text(errors='replace')[-2000:],flush=True)
assert not any(port_open(p) for p in (8765,8080,9099)),'EMULATORS_OR_FIXTURE_NOT_STOPPED'
shutil.copytree(PROFILE,LAB/'C0-browser-profile')
receipt.update(backend_stopped_before_candidate=True,profile_closed_and_C0_preserved=True)
(LAB/'auth-fixture-receipt.json').write_text(json.dumps(receipt,indent=2));print('GENUINE_PREVIOUS_SESSION '+json.dumps(receipt),flush=True)
