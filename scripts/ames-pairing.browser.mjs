// Runs a REAL Chromium click and local form POST. Never contacts real MES.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
 ?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const child=spawn(process.env.PYTHON_BIN||'python3',['-u','scripts/agent-pairing-browser-server.py'],
  {stdio:['ignore','pipe','pipe']});
let errors='';
child.stderr.on('data',b=>{errors+=String(b)});
const reader=createInterface({input:child.stdout});
const port=await Promise.race([
  new Promise((resolve,reject)=>{
    reader.once('line',line=>{
      const n=Number(line);Number.isInteger(n)&&n>0?resolve(n):reject(new Error('Invalid fixture port '+line));
    });
    child.on('exit',code=>reject(new Error('Pairing fixture exited '+code+' '+errors)));
  }),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timed out waiting for fixture '+errors)),8000))
]);
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
  const context=await browser.newContext();
  const page=await context.newPage();
  const origin='http://127.0.0.1:'+port;
  const requests=[],responses=[];
  page.on('request',r=>{if(r.url().startsWith(origin))requests.push({
    method:r.method(),url:r.url(),
    origin:r.headers()['origin']||'',
    site:r.headers()['sec-fetch-site']||'',
    mode:r.headers()['sec-fetch-mode']||'',
    cookiePresent:!!r.headers()['cookie']
  });});
  page.on('response',r=>{if(r.url().startsWith(origin))responses.push({
    status:r.status(),url:r.url(),location:r.headers()['location']||''
  });});
  await page.route('https://pedrokam700.github.io/**',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<h1>test destination only</h1>'
  }));
  await page.goto(origin+'/workstation/parear');
  assert.match(await page.content(),/Conectar este computador/);
  assert.doesNotMatch(await page.content(),/synthetic-only-workstation-token/);
  await page.getByRole('button',{name:'Autorizar e abrir a Central'}).click();
  await page.waitForURL(/pedrokam700\.github\.io\/Central-de-Controle-/, {
    waitUntil:'domcontentloaded',timeout:8000
  }).catch(error=>{
    // Print ONLY request metadata, never fragment/token/nonce/cookie values.
    console.error('PAIRING_BROWSER_DIAGNOSTIC',JSON.stringify({
      localResponses:responses.map(x=>({status:x.status,path:new URL(x.url).pathname,
        redirectOrigin:x.location?new URL(x.location).origin:null})),
      browserRequestMetadata:requests.map(x=>({method:x.method,origin:x.origin,
        site:x.site,mode:x.mode,cookiePresent:x.cookiePresent})),
      stillLocal:page.url().startsWith(origin),
    }));
    throw error;
  });
  assert.match(page.url(),/#ames_agent_token=synthetic-only-workstation-token/);
  assert(responses.some(r=>r.status===303),'Real browser click must complete local HTTP 303');
  assert(requests.some(r=>r.method==='POST'),'Actual Chromium POST must occur');
  const posted=requests.find(r=>r.method==='POST');
  assert(posted.cookiePresent,'Strict cookie must be carried on the local POST');
  console.log('PASS: REAL Chromium confirms HTTPS pairing: 303, Strict cookie, fixed destination');
  console.log('Chromium POST metadata (no token):',JSON.stringify({
    origin:posted.origin,site:posted.site,mode:posted.mode
  }));
  const replay=await fetch(origin+'/workstation/parear',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
      'Sec-Fetch-Site':'cross-site'},
    body:'nonce=unissued-token'
  });
  assert.equal(replay.status,403,'cross-site/no-cookie must stay forbidden');
  console.log('PASS: foreign/unauthenticated POST remains 403');
}finally{
  await browser?.close().catch(()=>{});
  child.kill('SIGTERM');
  reader.close();
}
