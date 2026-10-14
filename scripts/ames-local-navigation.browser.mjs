// Browser contract for the unified Central <-> Console MES shell.
// The physical CLEAN must keep both views in one document/origin/session: no
// Vercel jump, no localhost mini-app and no second login screen between views.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'central-nav-'));
execFileSync(process.execPath,['scripts/build-static.mjs'],{env:{...process.env,CENTRAL_STATIC_OUT:tmp},stdio:'pipe'});
const deployedIndex=fs.readFileSync(path.join(tmp,'Central-de-Controle-/index.html'),'utf8');
assert.match(deployedIndex,/offline-bootstrap\.mjs\?v=15\.1\.13\.49/,'static Central must keep integrated bootstrap');
assert.doesNotMatch(deployedIndex,/src="\/Central-de-Controle-\/local-entry\.mjs"/,'static Central must not boot standalone Console');
const packager=fs.readFileSync('scripts/build-integrated-candidate.py','utf8');
assert.doesNotMatch(packager,/html=html\.replace\([^\n]*local-entry\.mjs/,'CLEAN packager must not replace integrated bootstrap');

const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
import {installLocalConsoleReturn} from './core/central-roundtrip.mjs';
const store=createAmesStore();
const root=document.querySelector('#mesConsole');
const consoleSection=document.querySelector('#mesConsoleView');
const home=document.querySelector('#homeView');
const account=document.querySelector('#accountScreen');
const app=document.querySelector('.app');
let homeClicks=0,consoleClicks=0;
account?.classList.add('hidden');
app?.classList.remove('hidden');
function showHome(){homeClicks++;consoleSection.classList.add('hidden');home?.classList.remove('hidden');}
function showConsole(){consoleClicks++;home?.classList.add('hidden');consoleSection.classList.remove('hidden');view.render();}
document.querySelectorAll('[data-page="home"]').forEach(button=>button.addEventListener('click',showHome));
document.querySelectorAll('[data-page="mesConsole"]').forEach(button=>button.addEventListener('click',showConsole));
const view=createConsoleView(root,store,{locale:()=> 'pt-BR',transport:{fetcher:async()=>{throw Error('agent intentionally unavailable in navigation harness');}}});
view.render();
showHome();
installLocalConsoleReturn(document,location);
window.qa={showHome,showConsole,get homeClicks(){return homeClicks},get consoleClicks(){return consoleClicks}};
window.__centralUnifiedReady=true;
`;
const sourceIndex=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/Central-de-Controle-/qa.mjs"></script>';
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname.endsWith('/qa.mjs')){res.setHeader('content-type','text/javascript');return res.end(harness);}
  if(pathname==='/Central-de-Controle-/'){res.setHeader('content-type','text/html');return res.end(sourceIndex);}
  const file=path.resolve(root,pathname.replace(/^\/Central-de-Controle-\//,''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
  res.setHeader('content-type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'image/svg+xml');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1920,height:1080},serviceWorkers:'block'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.dismiss());
const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
try{
  const localUrl='http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/';
  await page.goto(localUrl);await page.waitForFunction(()=>window.__centralUnifiedReady===true);
  const initialUrl=page.url();
  assert.equal(await page.locator('#homeView').isVisible(),true,'Central home should be the initial internal view');
  assert.equal(await page.locator('#accountScreen').isVisible(),false,'navigation harness represents an already authenticated Central session');

  await page.locator('.main-nav [data-page="mesConsole"]').click();
  await page.locator('[data-console-back]').waitFor({state:'visible'});
  assert.equal(page.url(),initialUrl,'opening Console MES must not navigate or change origin');
  const bounds=await page.locator('#mesConsoleView').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {position:s.position,left:r.left,top:r.top,width:r.width,height:r.height};});
  assert.equal(bounds.position,'fixed','Console MES should behave like CORA as a full-screen internal route');
  assert(bounds.left<=1&&bounds.top<=1&&bounds.width>=1918&&bounds.height>=1078,'Console MES does not cover the Central viewport');
  await page.screenshot({path:path.join(out,'central-console-unified-1920x1080.png'),fullPage:false});

  await page.locator('[data-console-back]').click();
  assert.equal(page.url(),initialUrl,'returning to Central must not navigate or reload');
  assert.equal(await page.locator('#homeView').isVisible(),true);
  assert.equal(await page.locator('#mesConsoleView').isVisible(),false);
  assert.equal(await page.locator('#accountScreen').isVisible(),false,'return must not expose a second login');
  assert.equal(await page.evaluate(()=>qa.homeClicks>=2),true);

  await page.goto(localUrl+'?view=mesConsole');await page.waitForFunction(()=>window.__centralUnifiedReady===true);
  await page.locator('[data-console-back]').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).origin,new URL(localUrl).origin,'direct Console compatibility route must stay same-origin');
  assert.equal(await page.locator('#accountScreen').isVisible(),false);
  await page.locator('[data-console-back]').click();
  assert.equal(await page.locator('#homeView').isVisible(),true);
  await page.screenshot({path:path.join(out,'console-back-to-central-same-document.png'),fullPage:false});

  assert.deepEqual(errors,[]);
  console.log('PASS: Central -> Console MES -> Central stays in one local document/origin with no second login.');
}catch(error){
  await page.screenshot({path:path.join(out,'navigation-failure.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(out,'navigation-failure.json'),JSON.stringify({error:error.message,errors,url:page.url(),text:await page.locator('body').innerText().catch(()=>null)},null,2));
  throw error;
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmp,{recursive:true,force:true});
}
