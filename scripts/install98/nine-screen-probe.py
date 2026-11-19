"""Render the delivered page over the REAL Windows candidate, no auth/data mocks."""
import json,os,pathlib,sys
from playwright.sync_api import sync_playwright
lab=pathlib.Path(os.environ['INSTALL98_ROOT']).resolve();root=pathlib.Path(sys.argv[1]).resolve()
assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true' and root.parent==lab
assert json.loads((lab/'containment.json').read_text(encoding='utf-8-sig'))['kernel_deny_proven'] is True
out=lab/'browser-evidence';out.mkdir(exist_ok=True)
views=['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']
failed=[];errors=[];external=[]
chrome=pathlib.Path('C:/Program Files/Google/Chrome/Application/chrome.exe');assert chrome.is_file()
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(str(lab/'cold-browser-profile'),executable_path=str(chrome),headless=True,viewport={'width':1500,'height':1000},args=['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check'])
 def local_only(route):
  u=route.request.url
  if u.startswith('http://127.0.0.1:8765/') or u.startswith(('data:','blob:')):route.continue_()
  else:
   external.append(u.split('?',1)[0]);route.abort('blockedbyclient')
 context.route('**/*',local_only)
 page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('requestfailed',lambda req:failed.append({'url':req.url.split('?',1)[0],'failure':req.failure}))
 token=(root/'ames-agent/data/local_agent_token').read_text().strip()
 page.goto('http://127.0.0.1:8765/Central-de-Controle-/#ames_agent_token='+token,wait_until='networkidle',timeout=25000)
 try:page.locator('[data-console-view="monitor"]').wait_for(state='visible',timeout=8000)
 except Exception:pass
 samples=[]
 for view in views:
  button=page.locator('[data-console-view="'+view+'"]');pane=page.locator('[data-console-pane="'+view+'"]')
  visible=False
  if button.count() and button.first.is_visible():
   button.first.click();visible=pane.count()==1 and pane.is_visible()
   if visible:page.screenshot(path=str(out/(view+'.png')),full_page=True)
  samples.append({'view':view,'rendered':bool(visible)})
 page.screenshot(path=str(out/'cold-start.png'),full_page=True)
 result={'schema':'central98-real-windows-nine-screen-v1','sha':os.environ['GITHUB_SHA'],'origin':'http://127.0.0.1:8765','candidate_root':root.name,'fresh_profile':True,'real_agent':True,'auth_mocked':False,'data_mocked':False,'external_network_permitted':False,'views':samples,'external_dependencies_blocked':sorted(set(external)),'page_errors':errors,'failed_requests':failed,'physical':'PENDING'}
 result['qualified']=all(s['rendered'] for s in samples) and not errors
 result['blocker']=None if result['qualified'] else ('COLD_OFFLINE_FIREBASE_BOOTSTRAP_OR_AUTH' if any('gstatic.com/firebasejs/' in x for x in external) else 'REAL_UI_NOT_READY')
 (out/'nine-screen-receipt.json').write_text(json.dumps(result,indent=2,ensure_ascii=True))
 print(json.dumps(result),flush=True);context.close()
# A failed render is reported to the parent; it must NOT become a PASS.
