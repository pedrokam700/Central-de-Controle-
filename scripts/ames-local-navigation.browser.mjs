// Browser contract for local Console -> canonical Central. The Central auth state
// belongs to the canonical origin; this test must never fake a logged-in localhost
// Firebase session because that is precisely the physical regression it guards.
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
const index=path.join(tmp,'Central-de-Controle-/index.html');
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.49"','src="/Central-de-Controle-/core/local-entry.mjs"').replace(/<script id="central-runtime-boot-guard">[\s\S]*?<\/script>/,''));
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;let f=path.resolve(tmp,'.'+p);if(p.endsWith('/'))f=path.join(f,'index.html');if(!f.startsWith(tmp+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('content-type',/\.(mjs|js)$/.test(f)?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'image/svg+xml');res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1920,height:1080},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='central-cora-v2.vercel.app')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main data-canonical-central>Central canônica</main></body></html>'});
 if(u.hostname==='127.0.0.1'&&u.port===String(server.address().port))return route.continue();
 return route.abort();
});
page.on('dialog',d=>d.dismiss());
const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
try{
 const localUrl='http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/';
 await page.goto(localUrl);await page.waitForFunction(()=>window.__centralLocalReady===true);
 assert.equal(await page.locator('[data-console-back]').isVisible(),true);
 assert.equal(await page.locator('[data-central-online]').getAttribute('href'),'https://central-cora-v2.vercel.app/Central-de-Controle-/?from_mes_local=1');
 const localWidth=await page.locator('.app > .main').evaluate(el=>el.getBoundingClientRect().width);assert(localWidth>1800,'Local console still constrained by hidden sidebar grid');
 await page.locator('[data-console-back]').click();
 await page.waitForURL('https://central-cora-v2.vercel.app/Central-de-Controle-/?from_mes_local=1');
 assert.equal(new URL(page.url()).hostname,'central-cora-v2.vercel.app');
 assert.equal(await page.locator('[data-canonical-central]').isVisible(),true);
 assert.equal(await page.locator('#loginForm').count(),0,'Console must not open a localhost Central login');
 await page.screenshot({path:path.join(out,'console-to-canonical-central-1920x1080.png'),fullPage:true});
 // The exact production return URL is separately locked by ames-central-roundtrip.test.mjs.
 // Come back to this isolated test server only to prove the local Console remains intact.
 await page.goto(localUrl);await page.waitForFunction(()=>window.__centralLocalReady===true);
 assert.equal(await page.locator('[data-console-view=trace]').isVisible(),true);
 await page.screenshot({path:path.join(out,'console-local-return-1920x1080.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: local Console -> canonical Central origin with roundtrip marker; no localhost Firebase login.');
}catch(error){await page.screenshot({path:path.join(out,'navigation-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'navigation-failure.json'),JSON.stringify({error:error.message,errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
