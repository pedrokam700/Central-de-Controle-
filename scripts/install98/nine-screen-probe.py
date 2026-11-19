"""Original delivered Central, real agent, genuine preserved synthetic SDK session.

Never inject Auth state, data or an app harness. Backend emulators must already
be stopped; the candidate only reads the session/cache prepared through SDK APIs.
"""
import hashlib,json,os,pathlib,sys,urllib.request
from playwright.sync_api import sync_playwright
lab=pathlib.Path(os.environ['INSTALL98_ROOT']).resolve();root=pathlib.Path(sys.argv[1]).resolve()
assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and root.parent==lab
assert json.loads((lab/'containment.json').read_text(encoding='utf-8-sig'))['kernel_deny_proven'] is True
prior=json.loads((lab/'auth-fixture-receipt.json').read_text());assert prior['ready'] and prior['backend_stopped_before_candidate'] and not prior['storage_injected']
out=lab/'browser-evidence';out.mkdir(exist_ok=True)
views=['monitor','top3','failures','sn','trace','reuse','process','base','knowledge'];mime=[]
for name in ('index.html','offline-bootstrap.mjs','app.js','mobile.css','core/login-accessibility.css'):
 with urllib.request.urlopen('http://127.0.0.1:8765/Central-de-Controle-/'+name,timeout=5) as response:
  content=response.read();mime.append({'file':name,'status':response.status,'content_type':response.headers.get('Content-Type'),'sha256':hashlib.sha256(content).hexdigest()})
chrome=pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe');assert chrome.is_file()
token=(root/'ames-agent/data/local_agent_token').read_text().strip()
request=urllib.request.Request('http://127.0.0.1:8765/api/v1/v2/capabilities',headers={'X-Central-Agent-Token':token})
with urllib.request.urlopen(request,timeout=8) as response:cap=json.load(response)
with sync_playwright() as p:
 def browser(profile):return p.chromium.launch_persistent_context(str(profile),executable_path=str(chrome),headless=True,viewport={'width':1500,'height':1000},args=['--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad','--no-first-run','--no-default-browser-check'])
 def route_local(route):
  u=route.request.url
  if u.startswith('http://127.0.0.1:8765/') or u.startswith(('data:','blob:')):route.continue_()
  else:route.abort('blockedbyclient')
 # A blank identity must remain on the REAL login form. No anonymous bypass.
 cold=browser(lab/'cold-browser-profile');cold.route('**/*',route_local);cold_page=cold.new_page()
 cold_page.goto('http://127.0.0.1:8765/Central-de-Controle-/',wait_until='networkidle',timeout=30000)
 try:cold_page.wait_for_function('window.__centralLoginModuleReady===true',timeout=12000)
 except Exception:pass
 cold_result={'fresh_profile':True,'module_ready':bool(cold_page.evaluate('window.__centralLoginModuleReady===true')),'login_visible':cold_page.locator('#accountScreen').is_visible(),'login_button_enabled':cold_page.locator('#loginButton').is_enabled(),'anonymous_console_visible':cold_page.locator('#mesConsoleView').is_visible(),'physical_first_login':'PENDING'}
 cold_page.screenshot(path=str(out/'cold-first-login.png'),full_page=True);cold.close()
 (out/'cold-first-login-receipt.json').write_text(json.dumps(cold_result,indent=2))
 context=browser(lab/'existing-synthetic-profile');failed=[];errors=[];external=[];console_errors=[];http_errors=[];dialogs=[];api_reads=[]
 def local_only(route):
  u=route.request.url
  if not u.startswith(('http://127.0.0.1:8765/','data:','blob:')):external.append(u.split('?',1)[0])
  route_local(route)
 context.route('**/*',local_only);page=context.new_page()
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
 page.on('response',lambda response:http_errors.append({'url':response.url.split('?',1)[0],'status':response.status,'content_type':response.headers.get('content-type')}) if response.status>=400 else None)
 page.on('requestfailed',lambda request:failed.append({'url':request.url.split('?',1)[0],'failure':request.failure}))
 page.on('request',lambda request:api_reads.append({'path':request.url.split('?',1)[0].split('8765',1)[-1],'method':request.method}) if request.url.startswith('http://127.0.0.1:8765/api/v1/') else None)
 def on_dialog(dialog):dialogs.append({'type':dialog.type,'message':dialog.message});dialog.dismiss()
 page.on('dialog',on_dialog)
 page.goto('http://127.0.0.1:8765/Central-de-Controle-/#ames_agent_token='+token,wait_until='networkidle',timeout=30000)
 try:
  page.wait_for_function('window.__centralLoginModuleReady===true',timeout=20000)
  page.locator('#accountScreen').wait_for(state='hidden',timeout=40000)
  # Allow the existing real worker lifecycle to claim, then use a new document;
  # never clear its caches, unregister it, force activation or mix module builds.
  page.evaluate('Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),8000))])')
  page.reload(wait_until='networkidle',timeout=30000);page.locator('#accountScreen').wait_for(state='hidden',timeout=30000)
  page.locator('[data-page="mesConsole"]').click(timeout=10000)
  page.locator('[data-console-view="monitor"]').wait_for(state='visible',timeout=10000)
  page.locator('[data-line-tab="TAN10103"]').click()
  page.locator('[data-last-capture-open]').wait_for(state='visible',timeout=18000)
  page.locator('[data-last-capture-open]').click()
  page.wait_for_function("(async()=>{const {sessionAmes}=await import('/Central-de-Controle-/core/ames-session.mjs');return !!sessionAmes.read('TAN10103').snapshot?.source_id})()",timeout=20000)
 except Exception as error:console_errors.append('REAL_UI_FLOW: '+str(error).splitlines()[0])
 samples=[]
 for view in views:
  button=page.locator('[data-console-view="'+view+'"]');pane=page.locator('[data-console-pane="'+view+'"]');visible=False
  if button.count() and button.first.is_visible():
   button.first.click();visible=pane.count()==1 and pane.is_visible()
   if visible:page.screenshot(path=str(out/(view+'.png')),full_page=True)
  samples.append({'view':view,'rendered':bool(visible)})
 page.screenshot(path=str(out/'candidate-original-shell.png'),full_page=True)
 identity={'present':False};evidence={};excel={}
 if page.evaluate('window.__centralLoginModuleReady===true'):
  identity=page.evaluate("""async()=>{const {getAuth}=await import('/Central-de-Controle-/vendor/browser/firebase/10.8.0/firebase-auth.js');const auth=getAuth();await auth.authStateReady();const user=auth.currentUser;if(!user)return {present:false};const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.uid));return {present:true,uid_sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),emulator_connected:!!auth.emulatorConfig};}""")
  evidence=page.evaluate("""async()=>{const {sessionAmes}=await import('/Central-de-Controle-/core/ames-session.mjs');const p=sessionAmes.read('TAN10103').snapshot;return {agent_status:sessionAmes.agent().status,source_id:p?.source_id??null,snapshot_id:p?.snapshot_id??null,revision:p?.snapshot_revision??null,pcba_history:p?.canonical?.datasets?.pcba_history?.length??null,defects:p?.canonical?.datasets?.defects?.length??null};}""")
  excel=page.evaluate("""()=>{if(!window.XLSX)return {available:false};const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['SYNTHETIC98'],[42]]),'LAB');const read=XLSX.read(XLSX.write(book,{bookType:'xlsx',type:'array'}),{type:'array'});return {available:true,version:XLSX.version,roundtrip:XLSX.utils.sheet_to_json(read.Sheets.LAB,{header:1})[1][0]===42};}""")
 valid_identity=identity.get('present') and identity.get('uid_sha256')==prior['uid_sha256'] and not identity.get('emulator_connected')
 valid_data=evidence.get('agent_status')=='connected' and evidence.get('source_id')==cap.get('source_id') and evidence.get('defects') is not None and evidence.get('defects')>0
 no_mutation=not any(x['method']!='GET' and any(part in x['path'] for part in ('/jobs','/chrome/','/collect','/run/')) for x in api_reads)
 result={'schema':'central98-real-windows-nine-screen-v2','sha':os.environ['GITHUB_SHA'],'candidate_root':root.name,'scope':'UPDATE_WITH_GENUINE_PRESERVED_SYNTHETIC_SESSION','fresh_profile_bypassed':False,'real_agent':True,'auth_mocked':False,'data_mocked':False,'storage_injected':False,'auth_backend_stopped':prior['backend_stopped_before_candidate'],'identity':identity,'identity_preserved':bool(valid_identity),'real_sqlite_evidence':evidence,'agent_evidence_matches':bool(valid_data),'no_MES_mutation':no_mutation,'excel':excel,'cold_profile':cold_result,'views':samples,'external_network_permitted':False,'external_requests_blocked':sorted(set(external)),'page_errors':errors,'console_errors':console_errors,'http_errors':http_errors,'dialogs':dialogs,'static_MIME':mime,'failed_requests':failed,'api_calls':api_reads,'physical':'PENDING'}
 result['qualified']=all(x['rendered'] for x in samples) and bool(valid_identity) and valid_data and no_mutation and excel.get('version')=='0.20.3' and excel.get('roundtrip') and not errors and not dialogs and cold_result['module_ready'] and cold_result['login_visible'] and cold_result['login_button_enabled'] and not cold_result['anonymous_console_visible']
 result['blocker']=None if result['qualified'] else 'REAL_UI_OR_PRESERVED_SESSION_NOT_QUALIFIED'
 (out/'nine-screen-receipt.json').write_text(json.dumps(result,indent=2,ensure_ascii=True));print(json.dumps(result),flush=True);context.close()
