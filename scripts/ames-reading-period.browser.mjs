import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
function fixture(id,date,mode){
 const p=canonicalAgentFixture(productFixture('TAN10101',3));
 p.snapshot_id=id;p.summary.snapshot_id=id;p.source_id='preserved-workstation';p.snapshot_revision=1;
 p.summary.period={mode,start_at:date+'T07:00',end_at:date+'T12:00'};
 p.collected_at=date+'T15:00:00Z';p.summary.collected_at=p.collected_at;
 for(const rows of Object.values(p.datasets))for(const row of rows){row.snapshot_id=id;row.snapshot_revision=1;}
 return p;
}
const today=fixture('TODAY-SNAPSHOT','2026-10-19','today'),old=fixture('FRIDAY-SNAPSHOT','2026-10-16','previous_day');
const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
const store=createAmesStore({now:()=>Date.parse('2026-10-19T15:00:00Z')}),old=${JSON.stringify(old)};
store.replaceSyncedSnapshots([${JSON.stringify(today)}]);
let mutations=0,savedReads=0,savedOpens=0;
const savedEntry={job_id:'J123',query_sn:'PCBA-TEST',query_created_at:'2026-10-16T14:00:00Z',query_status:'done',entry_hash:'b'.repeat(64),line_id:null,production_date:null,clock_kind:'query_created_at',local_only:true};
const client={collect:async()=>{mutations++;},auxiliary:async()=>{mutations++;},refresh:async()=>{},clear(){},connect:async()=>{},savedSnHistory:async()=>{savedReads++;return {items:[savedEntry],next_cursor:null,clock_kind:'query_created_at',local_only:true};},openSavedSnHistory:async()=>{savedOpens++;return {job_id:savedEntry.job_id,entry_hash:savedEntry.entry_hash,query_created_at:savedEntry.query_created_at,line_id:null,production_date:null,result:{trace_3074:{rows:[{sn:'PART',note:'<script>unsafe</script>'}]},trace_3012:{rows:[{association:'same_pcba_candidate'}]}}};}};
const history={list:async line=>line===old.line_id?[{line_id:line,source_id:old.source_id,snapshot_id:old.snapshot_id,snapshot_revision:1,collected_at:old.collected_at,period_start:old.summary.period.start_at,period_end:old.summary.period.end_at,history_source:'shared'}]:[],open:async()=>old};
const view=createConsoleView(document.querySelector('#mesConsole'),store,{agentClient:client,history});
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
document.querySelector('#mesConsoleView')?.classList.remove('hidden');document.querySelector('#accountScreen')?.classList.add('hidden');
window.qa={store,view,mutations:()=>mutations,savedReads:()=>savedReads,savedOpens:()=>savedOpens};view.render();
`;
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<script type="module" src="/Central-de-Controle-/qa-context.mjs"></script>';
const root=process.cwd(),server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname==='/release-build.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({sha:'c'.repeat(40),branch:'test'}));}
  if(pathname.endsWith('/qa-context.mjs')){res.setHeader('content-type','text/javascript');return res.end(harness);}
  if(pathname==='/Central-de-Controle-/'){res.setHeader('content-type','text/html');return res.end(html);}
  const file=path.resolve(root,pathname.replace(/^\/Central-de-Controle-\//,''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end();}
  res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'image/svg+xml');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/');await page.waitForFunction(()=>!!window.qa);
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'FRIDAY-SNAPSHOT');
 for(const id of ['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']){
   await page.locator('[data-console-view="'+id+'"]').click();
   const pane=page.locator('[data-console-pane="'+id+'"]');
   assert.equal(await pane.isVisible(),true);assert.match(await pane.locator('[data-shared-period]').innerText(),/16/);
   assert(!((await pane.innerText()).includes('TODAY-SNAPSHOT')),id+' leaked Today');
 }
 await page.locator('[data-console-view=monitor]').click();await page.locator('[data-line-tab="TAN10102"]').click();
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10102').snapshot),null);
 await page.locator('[data-line-tab="TAN10101"]').click();await page.locator('[data-read-period=today]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'TODAY-SNAPSHOT');
 for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>{document.documentElement.lang='en-US';qa.view.render();});
   assert.equal(await page.locator('[data-read-period=previous]').innerText(),'Last production day');
   assert(await page.locator('[data-global-reading-period]').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
 }

 // B3.3: saved queries are separate from production-period revisions.
 // Nothing is loaded from SQLite until the operator explicitly requests it.
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>{document.documentElement.lang='pt-BR';qa.store.updateAgent({status:'connected'});qa.view.render();});
 await page.locator('[data-console-view=sn]').click();
 assert.equal(await page.locator('[data-sn-saved-toggle]').count(),1);
 assert.equal(await page.evaluate(()=>qa.savedReads()),0);
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 await page.locator('[data-sn-saved-toggle]').click();
 await page.locator('[data-sn-saved-search] input[name=sn]').fill('PCBA-TEST');
 await page.locator('[data-sn-saved-search] button[type=submit]').click();
 await page.waitForFunction(()=>qa.savedReads()===1);
 await page.locator('[data-sn-saved-open]').click();
 await page.waitForFunction(()=>qa.savedOpens()===1);
 await page.locator('[data-sn-saved-detail] details').first().evaluate(e=>e.open=true);
 await page.locator('[data-sn-saved-detail] pre').first().waitFor();
 assert.equal(await page.locator('[data-sn-saved-detail] script').count(),0);
 assert.match(await page.locator('[data-sn-saved-detail]').innerText(),/same_pcba_candidate|unsafe/);
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'TODAY-SNAPSHOT');
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'Navigation must never schedule MES');assert.deepEqual(errors,[]);
 console.log('PASS: nine views share exact historical scope; no MES mutations; Today restored; PT/EN and mobile selector');
}finally{await browser.close();await new Promise(r=>server.close(r));}
