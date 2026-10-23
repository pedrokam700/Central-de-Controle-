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
import {indexedQueue,publication} from '/ames/sync.mjs';
const store=createAmesStore(),queue=indexedQueue(),writes=[];let online=false;
const remote={watch:()=>()=>{},putPart:async()=>{if(window.qa?.holdPart){window.remoteFlight.entered=true;await window.qa.holdPart;}},commitHead:async(u,h)=>writes.push(h),commitHistory:async()=>{}};
const integration=createMesIntegration(store,remote,{syncOptions:{online:()=>online,now:()=>new Date('${fixtureDay}T12:00:00Z')},schedule:()=>0,unschedule:()=>{}});
window.qa={store,queue,writes,integration,publication,sample:${JSON.stringify(fixture)},seed:async()=>{store.replaceLocalSnapshots([${JSON.stringify(fixture)}]);await integration.sync.capture();},online:()=>{online=true;return integration.sync.retry();}};
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
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===0);
  await page.evaluate(()=>qa.seed());await page.waitForFunction(()=>qa.store.agent().sync.pending===1);
  assert.equal(await page.evaluate(()=>qa.writes.length),0);
  await page.reload();await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===1);
  assert.equal(await page.evaluate(()=>qa.store.localCanonical().length),0,'pending evidence survives even with empty in-memory state');
  await page.evaluate(()=>qa.integration.start('B'));await page.waitForFunction(()=>qa.store.agent().sync.pending===0);
  assert.equal(await page.evaluate(async()=>(await qa.queue.list('A')).length),1,'B cannot consume A outbox');
  const crossUser=await page.evaluate(()=>qa.integration.sync.inspectUpdateReadiness());
  assert.equal(crossUser.pending_entries,1,'read-only audit must count evidence for signed-out A');
  assert.equal(crossUser.advisory_no_pending,false);
  assert.equal(crossUser.update_authorized,false);
  await page.evaluate(()=>qa.integration.start('A'));await page.waitForFunction(()=>qa.store.agent().sync.pending===1);
  await page.evaluate(()=>qa.online());await page.waitForFunction(()=>qa.store.agent().sync.pending===0);
  assert.equal(await page.evaluate(()=>qa.writes.length),1);assert.equal(await page.evaluate(async()=>(await qa.queue.list('A')).length),0);
  await page.waitForFunction(async()=>(await qa.integration.sync.inspectUpdateReadiness()).advisory_no_pending);
  const drained=await page.evaluate(()=>qa.integration.sync.inspectUpdateReadiness());
  assert.equal(drained.pending_entries,0);
  assert.equal(drained.multi_tab_attested,false,'empty current origin cannot attest all tabs/profiles');
  assert.equal(drained.update_authorized,false,'browser observation never permits motor update');
  // A second tab with the same origin/profile must not enqueue a new pending
  // record while the candidate maintenance observer owns its cooperative lock.
  // This is NOT an authorization gate for legacy tabs or other browser profiles.
  const peer=await context.newPage();
  await peer.goto('http://127.0.0.1:'+server.address().port);
  await peer.waitForFunction(()=>window.qa?.queue);
  assert.equal(await page.evaluate(()=>typeof navigator.locks?.request),'function','Web Locks must be present in this Chromium fixture');
  await page.evaluate(()=>{
    const gate=window.maintenanceGate={};
    gate.wait=new Promise(resolve=>{gate.release=resolve;});
    gate.result=qa.queue.withCooperativeMaintenanceFence(async evidence=>{
      gate.evidence=evidence;
      await gate.wait;
    });
  });
  await page.waitForFunction(()=>window.maintenanceGate?.evidence?.cooperative_fence_held);
  assert.deepEqual(await page.evaluate(()=>({pending:maintenanceGate.evidence.pending_entries,authorized:maintenanceGate.evidence.update_authorized})),{pending:0,authorized:false});
  await peer.evaluate(()=>{
    window.queueWrite='waiting';
    window.queueWritePromise=qa.queue.put({id:'fixture:held-write',uid:'fixture-other-user'}).then(()=>{window.queueWrite='committed';});
  });
  await peer.waitForFunction(async()=>{
    const state=await navigator.locks.query();
    return state.pending.some(item=>item.mode==='shared'&&item.name==='central-ames-outbox-v2-cooperative-writer-v1');
  });
  assert.equal(await peer.evaluate(()=>window.queueWrite),'waiting','peer enqueue must wait without changing IndexedDB');
  assert.equal(await page.evaluate(()=>qa.queue.countAll()),0);
  const refused=await peer.evaluate(()=>qa.queue.withCooperativeMaintenanceFence());
  assert.equal(refused.cooperative_fence_observed,false,'a second lease attempt must not overtake the holder');
  assert.equal(refused.update_authorized,false);
  await page.evaluate(()=>maintenanceGate.release());
  const gateResult=await page.evaluate(()=>maintenanceGate.result);
  assert.equal(gateResult.cooperative_fence_observed,true);
  assert.equal(gateResult.cooperative_fence_released,true);
  assert.equal(gateResult.multi_tab_attested,false);
  assert.equal(gateResult.update_authorized,false);
  await peer.evaluate(()=>window.queueWritePromise);
  assert.equal(await page.evaluate(()=>qa.queue.countAll()),1,'peer write resumes after lock is released');
  await peer.evaluate(()=>qa.queue.remove('fixture:held-write'));
  assert.equal(await page.evaluate(()=>qa.queue.countAll()),0,'fixture evidence removed without disturbing original outbox');
  // A different cooperative tab can be in the middle of remote Firestore
  // publication even when its pending queue looks locally idle elsewhere.
  // The dual observer must acquire REMOTE exclusive BEFORE OUTBOX exclusive;
  // otherwise it could deadlock a publishing tab in queue.remove().
  await peer.evaluate(async sampleDay=>{
    const flight=window.remoteFlight={};
    flight.wait=new Promise(resolve=>{flight.release=resolve;});
    qa.holdPart=flight.wait;
    const entry=await qa.publication('A',qa.sample,{now:new Date(sampleDay+'T12:00:00Z'),productionConfig:{timezone:'America/Sao_Paulo',dayStart:'07:00'}});
    await qa.queue.put(entry);
    flight.publish=qa.online();
  },fixtureDay);
  await peer.waitForFunction(()=>window.remoteFlight?.entered);
  const uploadBusy=await page.evaluate(()=>qa.integration.sync.withCooperativeBrowserFence());
  assert.equal(uploadBusy.cooperative_fence_observed,false,'remote upload in another tab must deny dual maintenance probe');
  assert.equal(uploadBusy.reason,'cooperative_remote_publication_busy');
  assert.equal(uploadBusy.update_authorized,false);
  await peer.evaluate(()=>remoteFlight.release());
  await peer.evaluate(()=>remoteFlight.publish);
  await page.waitForFunction(async()=>await qa.queue.countAll()===0);
  const dual=await page.evaluate(()=>qa.integration.sync.withCooperativeBrowserFence(async evidence=>{
    if(!evidence.remote_publication_fence_held||!evidence.cooperative_fence_held||evidence.pending_entries!==0)throw Error('dual_fence_unproven');
  }));
  assert.equal(dual.cooperative_fence_observed,true);
  assert.equal(dual.cooperative_fence_released,true);
  assert.equal(dual.pending_entries,0);
  assert.equal(dual.multi_tab_attested,false);
  assert.equal(dual.update_authorized,false);
  await peer.close();
  await page.reload();await page.waitForFunction(()=>window.qa?.store.agent().sync.pending===0);
  assert.deepEqual(errors,[]);
  const out=process.env.BROWSER_OUTPUT||'../browser-evidence';fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'sync-reload.json'),JSON.stringify({result:'PASS',browser:'chromium',checks:['real IndexedDB offline enqueue','reload restores pending count','UID isolation','cross-UID read-only pending audit','reconnect drains once','empty audit never authorizes updater','cooperative cross-tab Web Locks fence blocks new writers','second probe refused','release resumes peer writer','inflight remote upload refuses dual fence','remote acknowledgement completes without deadlock','dual fence observes empty queue without authorizing update','second reload empty'],production:false},null,2));
  console.log('PASS: IndexedDB/reload/UID isolation/cooperative cross-tab writer and publication fences; no Console mounted');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
