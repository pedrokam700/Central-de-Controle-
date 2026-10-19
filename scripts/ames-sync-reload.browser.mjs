// Real browser IndexedDB reload/UID isolation; Firebase rules/transactions are
// covered separately by ames-e2e.emulator.mjs. No production service is contacted.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const fixture=canonicalAgentFixture(productFixture('TAN10101',2));
const fixtureDay=String(fixture.collected_at).slice(0,10);
fixture.summary.period={mode:'today',start_at:fixtureDay+'T07:00',end_at:fixtureDay+'T10:00'};
fixture.snapshot_id='1';fixture.summary.snapshot_id='1';
for(const rows of Object.values(fixture.datasets))for(const row of rows)row.snapshot_id='1';
const harness=`
import {createAmesStore} from '/ames/data/store.mjs';
import {createMesIntegration} from '/ames/integration-session.mjs';
import {indexedQueue} from '/ames/sync.mjs';
const store=createAmesStore(),queue=indexedQueue(),writes=[];let online=false;
const remote={watch:()=>()=>{},putPart:async()=>{},commitHead:async(u,h)=>writes.push(h),commitHistory:async()=>{}};
const integration=createMesIntegration(store,remote,{syncOptions:{online:()=>online,now:()=>new Date('${fixtureDay}T12:00:00Z')},schedule:()=>0,unschedule:()=>{}});
window.qa={store,queue,writes,integration,seed:async()=>{store.replaceLocalSnapshots([${JSON.stringify(fixture)}]);await integration.sync.capture();},online:()=>{online=true;return integration.sync.retry();}};
integration.start('A');
`;
const root=process.cwd(),server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://test').pathname;
  if(name==='/'){res.setHeader('content-type','text/html');return res.end('<h1>Integration browser contract</h1><script type="module" src="/qa.mjs"></script>');}
  if(name==='/qa.mjs'){res.setHeader('content-type','text/javascript');return res.end(harness);}
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===0);
  await page.evaluate(()=>qa.seed());await page.waitForFunction(()=>qa.store.agent().sync.pending===1);
  assert.equal(await page.evaluate(()=>qa.writes.length),0);
  await page.reload();await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===1);
  assert.equal(await page.evaluate(()=>qa.store.localCanonical().length),0,'pending evidence survives even with empty in-memory state');
  await page.evaluate(()=>qa.integration.start('B'));await page.waitForFunction(()=>qa.store.agent().sync.pending===0);
  assert.equal(await page.evaluate(async()=>(await qa.queue.list('A')).length),1,'B cannot consume A outbox');
  await page.evaluate(()=>qa.integration.start('A'));await page.waitForFunction(()=>qa.store.agent().sync.pending===1);
  await page.evaluate(()=>qa.online());await page.waitForFunction(()=>qa.store.agent().sync.pending===0);
  assert.equal(await page.evaluate(()=>qa.writes.length),1);assert.equal(await page.evaluate(async()=>(await qa.queue.list('A')).length),0);
  await page.reload();await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===0);
  assert.deepEqual(errors,[]);
  const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'sync-reload.json'),JSON.stringify({result:'PASS',browser:'chromium',checks:['real IndexedDB offline enqueue','reload restores pending count','UID isolation','reconnect drains once','second reload empty'],production:false},null,2));
  console.log('PASS: real IndexedDB offline/reload/account isolation/reconnect/second reload; no Console mounted');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
