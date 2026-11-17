// Real two-tab Chromium lifecycle. Tiny synthetic shell, actual new SW logic;
// no builder, external SDK, MES, product credentials or operational state.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base='/Central-de-Controle-/',assets=[base,base+'app.js',base+'ames/data/canonical.mjs'];
const current=fs.readFileSync('sw.js','utf8').replace(/const ASSETS=\[[\s\S]*?\];/,'const ASSETS='+JSON.stringify(assets)+';')
 .replace(/^ASSETS\.push\([^\n]*\);\s*$/gm,'').replace(/const FIREBASE_SDK=Object\.freeze\(\[[\s\S]*?\]\);/,'const FIREBASE_SDK=[];');
const legacy=`const CACHE='central-cora-v15v-synthetic-old';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(${JSON.stringify(assets)}))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&${JSON.stringify(assets)}.includes(new URL(e.request.url).pathname))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(new URL(e.request.url).pathname))||fetch(e.request)));});`;
let version='old';
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://synthetic').pathname;
 res.setHeader('Cache-Control','no-store');
 if(path===base+'sw.js'){res.setHeader('Content-Type','text/javascript');return res.end(version==='old'?legacy:current);}
 if(path===base){res.setHeader('Content-Type','text/html');return res.end(`<script>window.runtime=${JSON.stringify(version)};window.registration=navigator.serviceWorker.register('${base}sw.js');navigator.serviceWorker.addEventListener('controllerchange',()=>window.controllerChanges=(window.controllerChanges||0)+1);</script>`);}
 if(assets.includes(path)){res.setHeader('Content-Type','text/javascript');return res.end(`export const runtime=${JSON.stringify(version)};`);}
 if(path===base+'api/test'){res.setHeader('Content-Type','application/json');return res.end('{"synthetic":true}');}
 res.statusCode=404;res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const context=await browser.newContext(),one=await context.newPage(),two=await context.newPage();
const url='http://127.0.0.1:'+server.address().port+base;
const request=(page,path='ames/data/canonical.mjs')=>page.evaluate(async path=>{const r=await fetch(path);return {status:r.status,text:await r.text()};},path);
try{
 await one.goto(url);await one.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await two.goto(url);await two.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await one.evaluate(()=>window.registration);await two.evaluate(()=>window.registration);
 await two.evaluate(()=>localStorage.setItem('synthetic-draft','save-me'));
 await two.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('synthetic-audit-outbox',1);open.onupgradeneeded=()=>open.result.createObjectStore('items');
  open.onsuccess=()=>{const db=open.result,t=db.transaction('items','readwrite');t.objectStore('items').put('pending-write','K');t.oncomplete=()=>{db.close();resolve();};};open.onerror=reject;
 }));
 version='new';
 await two.evaluate(()=>window.controllerChanges=0);
 await one.evaluate(async()=>{
  const r=await window.registration;await r.update();const worker=r.waiting||r.installing;
  if(!worker)throw Error('Synthetic update did not expose a candidate worker');
  if(worker.state!=='installed')await new Promise(resolve=>worker.addEventListener('statechange',()=>{if(worker.state==='installed')resolve();}));
  const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  worker.postMessage({type:'cora-activate-update'});await changed;
 });
 await two.waitForFunction(()=>window.controllerChanges>0);
 assert.equal((await request(two)).status,409);
 assert.equal((await request(two,'app.js?v=OLD')).status,409);
 assert.equal(await two.evaluate(()=>window.runtime),'old','other tab is not automatically reloaded');
 const cdp=await context.newCDPSession(two);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');
 assert.equal((await request(two)).status,409,'persisted guard survives worker process restart');
 await one.reload();assert.equal(await one.evaluate(()=>window.runtime),'new');
 assert.equal((await request(one)).status,200);
 assert.equal((await request(two)).status,409);
 await two.reload();assert.equal(await two.evaluate(()=>window.runtime),'new');
 assert.equal((await request(two)).status,200);
 assert.equal(await two.evaluate(()=>localStorage.getItem('synthetic-draft')),'save-me');
 assert.equal(await two.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('synthetic-audit-outbox',1);open.onsuccess=()=>{const db=open.result,r=db.transaction('items').objectStore('items').get('K');r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=reject;};open.onerror=reject;
 })),'pending-write');
 assert.equal(await two.evaluate(async()=> (await fetch('api/test',{method:'POST',body:'synthetic'})).status),200);
 await context.setOffline(true);await two.reload();assert.equal(await two.evaluate(()=>window.runtime),'new');
 assert.equal((await request(two)).status,200);
 console.log('GREEN synthetic Chromium: two tabs, explicit activation, restart, reload, offline, draft/IndexedDB and API POST preserved');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
