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
const local=fixture(17,'2026-10-15','custom');
local.content_hash='b'.repeat(64);
// Serialized insights survive the same sanitization used by shared snapshots.
const oldDefect=old.datasets.defects[0];
old.insights={schema:'ames-insights-v1',ready:true,line:old.line_id,snapshot_id:old.snapshot_id,
 drilldowns:{pcba_analysis:[{PCBA:oldDefect.pcba_sn,'Defect Code':oldDefect.defect_code,
 'Defect Time':oldDefect.defect_time,'Uso da PCBA na falha':'2º uso','Modelo':oldDefect.product_model}],
 material_analysis:[0,1].map(()=>({'PCBA atual':oldDefect.pcba_sn,'Material SN':'PART-<img src=x>',
 'Tipo material':'GENERIC','Defect Code atual':oldDefect.defect_code,'Defect Time atual':oldDefect.defect_time,
 'Uso material na falha':'3º uso','Part Number':'PN-X'}))}};
old.source_coverage={
 '3028':{status:'observed_partial',stored_rows:3,source_complete:false,transport_complete:true},
 '3074':{status:'unknown',stored_rows:0,source_complete:false,transport_complete:true},
 '2114':{status:'observed_partial',stored_rows:2,source_complete:false,transport_complete:true},
 '3022':{status:'unknown',stored_rows:0,source_complete:false,transport_complete:true},
 '3012':{status:'candidate_partial',stored_rows:1,source_complete:false,transport_complete:true,association:'same_pcba_candidate_only'}
};

const harness=`
import {createAmesStore} from './ames/data/store.mjs';
import {createConsoleView} from './ames/console-view.mjs';
const store=createAmesStore({now:()=>Date.parse('2026-10-19T15:00:00Z')}),old=${JSON.stringify(old)},local=${JSON.stringify(local)};
store.replaceSyncedSnapshots([${JSON.stringify(today)}]);
let mutations=0,savedReads=0,savedOpens=0,captureReads=0;
const savedEntry={job_id:'J123',query_sn:'PCBA-TEST',query_created_at:'2026-10-16T14:00:00Z',query_status:'done',entry_hash:'b'.repeat(64),line_id:null,production_date:null,clock_kind:'query_created_at',local_only:true};
const client={collect:async()=>{mutations++;},auxiliary:async()=>{mutations++;},refresh:async()=>{},clear(){},connect:async()=>{},
 sourceCaptures:async params=>{
  captureReads++;
  if(params.snapshot_id!==17||params.snapshot_revision!==1||params.content_hash!==local.content_hash)throw Error('wrong capture target');
  return {schema:'ames-local-source-capture-v1',metadata_only:true,local_only:true,source_complete:false,
    source_id:local.source_id,period:local.summary.period,items:[{
      source_view:'3022',source_status:'partial',capture_revision:1,
      job_id:'JOB-<img src=x onerror=alert(1)>',stored_at:'2026-10-15T14:00:00Z',
      source_id:local.source_id,snapshot_id:String(local.snapshot_id),line_id:local.line_id,
      snapshot_revision:local.snapshot_revision,period_start:local.summary.period.start_at,
      period_end:local.summary.period.end_at,period_mode:local.summary.period.mode,
      source_complete:false,population_complete:false,local_only:true,
      checkpoint_kind:'bounded_partial_progress',progress_only:true,sample_count:1
    }],next_cursor:null};
 },
 savedSnHistory:async()=>{savedReads++;return {items:[savedEntry],next_cursor:null,clock_kind:'query_created_at',local_only:true};},openSavedSnHistory:async()=>{savedOpens++;return {job_id:savedEntry.job_id,entry_hash:savedEntry.entry_hash,query_created_at:savedEntry.query_created_at,line_id:null,production_date:null,result:{trace_3074:{rows:[{sn:'PART',note:'<script>unsafe</script>'}]},trace_3012:{rows:[{association:'same_pcba_candidate'}]}}};}};
const history={list:async line=>line===old.line_id?[
 {line_id:line,source_id:old.source_id,snapshot_id:old.snapshot_id,snapshot_revision:1,collected_at:old.collected_at,period_start:old.summary.period.start_at,period_end:old.summary.period.end_at,history_source:'shared'},
 {line_id:line,source_id:local.source_id,snapshot_id:local.snapshot_id,snapshot_revision:local.snapshot_revision,collected_at:local.collected_at,period_start:local.summary.period.start_at,period_end:local.summary.period.end_at,history_source:'local'}
 ]:[],open:async entry=>String(entry.snapshot_id)===String(local.snapshot_id)?local:old};
const view=createConsoleView(document.querySelector('#mesConsole'),store,{agentClient:client,history});
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
document.querySelector('#mesConsoleView')?.classList.remove('hidden');document.querySelector('#accountScreen')?.classList.add('hidden');
window.qa={store,view,mutations:()=>mutations,savedReads:()=>savedReads,savedOpens:()=>savedOpens,captureReads:()=>captureReads};view.render();
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
 // Real browser checks for selective PR33→PR42 integration, no MES mutations.
 await page.locator('[data-console-view=failures]').click();
 // PR35 blocks 13/14 + PR36 exact occurrence gate: actual DOM wiring.
 const failureRows=page.locator('[data-console-pane=failures] .ames-failures-table tbody tr');
 const evidenceCells=page.locator('[data-console-pane=failures] [data-failure-evidence-cell]');
 await page.waitForFunction(()=>document.querySelectorAll('[data-console-pane=failures] [data-failure-evidence-cell]').length>=3);
 assert.equal(await evidenceCells.count(),await failureRows.count(),'each 3028 row has one evidence cell');
 assert.equal(await page.locator('[data-failure-evidence-head]').count(),1);
 assert.match(await evidenceCells.first().innerText(),/3028/);
 await evidenceCells.first().locator('.ames-failure-evidence-detail summary').click();
 assert.match(await evidenceCells.first().innerText(),/cadeia de evidências/i);
 assert.equal(await evidenceCells.first().locator('[data-ames-source-view]').count(),5,'five sources remain separately auditable');
 assert.equal(await evidenceCells.first().locator('[data-ames-snapshot-provenance]').count(),1);
 assert.equal(await evidenceCells.locator('img, script').count(),0,'untrusted SN cannot create markup');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'opening evidence cannot query MES');
 const groupTable=page.locator('[data-console-pane=failures] [data-failure-groups] table');
 assert.equal(await groupTable.locator('thead th').count(),7,'three reuse-evidence columns remain in grouped Failures');
 assert.match(await groupTable.locator('tbody').innerText(),/1\+/,'2nd+ use is a minimum observed, never an invented exact denominator');
 assert.equal(await page.locator('[data-failure-sort]').inputValue(),'count_desc');
 await page.locator('[data-failure-sort]').selectOption('failure_asc');
 assert.equal(await page.locator('[data-failure-sort]').inputValue(),'failure_asc');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'group sorting cannot run MES');
 await page.locator('[data-console-view=top3]').click();
 const top3Defect=page.locator('[data-console-pane=top3] [data-daily-top3-defect]').first();
 assert.equal(await top3Defect.count(),1,'Top 3 must retain its clickable quick summary');
 const beforeDefect=await page.evaluate(()=>qa.store.context()?.defect??null);
 await top3Defect.click();
 await page.waitForFunction(()=>!!document.querySelector('[data-console-pane=top3] [data-top3-analytics] .ames-dfa-rank-item[open]'));
 assert.equal(await page.evaluate(()=>qa.store.context()?.defect??null),beforeDefect,'Top 3 drilldown may not overwrite shared defect scope');
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 await page.locator('[data-console-view=reuse]').click();
 const cohorts=page.locator('[data-reuse-cohorts]');
 assert.match(await cohorts.innerText(),/Denominador não comprovado/);
 assert.equal(await cohorts.locator('[data-cohort-kind=pcbas][data-cohort-metric=second_use] strong').innerText(),'1');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=third_plus_use] strong').innerText(),'1');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=failed] strong').innerText(),'0');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=verified_no_failure] strong').innerText(),'—');
 await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=verified_no_failure]').click();
 assert.match(await cohorts.locator('[data-cohort-detail]').innerText(),/Indisponível/);
 assert.doesNotMatch(await cohorts.locator('[data-cohort-detail]').innerText(),/0 itens observados/);
 await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=associated]').click();
 assert.equal(await cohorts.locator('[data-cohort-row]').count(),1);
 assert.equal(await cohorts.locator('img').count(),0);
 await cohorts.locator('[data-cohort-row]').evaluate(e=>e.open=true);
 assert.match(await cohorts.locator('[data-cohort-detail]').innerText(),/FRIDAY-SNAPSHOT/);
 await cohorts.locator('select[name=part_number]').selectOption('PN-X');
 await cohorts.locator('form button[type=submit]').click();
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=observed] strong').innerText(),'1');
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 // D: stored trends use history transport only, and retain gaps/revision evidence.
 await page.locator('[data-console-view=top3]').click();
 const trends=page.locator('[data-console-pane=top3] [data-history-trends]');
 assert.equal(await trends.locator('[data-history-day]').count(),0,'navigation alone does not read history payloads');
 await trends.locator('form button[type=submit]').click();
 await trends.locator('[data-history-day]').first().waitFor();
 assert.equal(await trends.locator('[data-history-day]').count(),7);
 assert.equal(await trends.locator('[data-history-day-open]').count(),1);
 assert.match(await trends.locator('[data-week-scope-warning]').innerText(),/CPH ou origem/,'mixed stored 3028 CPHs require a visible weekly comparability warning');
 assert.match(await trends.locator('[data-history-day="2026-10-15"]').innerText(),/Não coletado/,'custom window is not daily production');
 await trends.locator('[data-history-day-open]').click();
 assert.match(await trends.locator('[data-history-day-detail]').innerText(),/FRIDAY-SNAPSHOT/);
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'FRIDAY-SNAPSHOT');
 await trends.locator('select[name=days]').selectOption('30');
 await trends.locator('form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-console-pane=top3] [data-history-day]').length===30);
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>{document.documentElement.lang='en-US';qa.view.render();});
  assert.match(await trends.innerText(),/Stored history trends/);
  assert.equal(await trends.locator('[data-history-day]').count(),30);
  assert(await trends.locator('svg').evaluate(e=>e.getBoundingClientRect().width<=e.parentElement.clientWidth+2));
 }
 await page.evaluate(()=>{document.documentElement.lang='pt-BR';qa.view.render();});
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 await page.locator('[data-console-view=base]').click();
 const proof=page.locator('[data-console-pane=base] [data-five-source-coverage]');
 assert.equal(await proof.count(),1);
 assert.equal(await proof.locator('[data-source-view="3074"]').getAttribute('data-source-status'),'unknown');
 assert.equal(await proof.locator('[data-source-view="3012"]').getAttribute('data-source-status'),'candidate_partial');
 assert.match(await proof.innerText(),/3012/);
 assert(!/3074[^\n]*0 (?:registro|row)/i.test(await proof.innerText()),'Missing 3074 is not zero');
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
 // Integration gate: live SN decorators from PR33/35/36 must actually mount
 // together, remain read-only and preserve per-source unknown/partial status.
 await page.evaluate(()=>{
   qa.store.updateAgent({status:'connected',resultSource:'sn',job:{result:{
     sn:'PCBA-TEST-LIVE',detected_type:'PCBA',
     trace_2114:{status:'complete',current_failure:{
       pcba_sn:'PCBA-TEST-LIVE',defect_code:'D1',defect_desc:'Camera',
       defect_time:'2026-10-19 10:30:00',manual_or_auto:'Manual'}},
     trace_3074:{status:'partial',reused_components:[]},
     trace_3022:{status:'partial',process_passages:[]},
     trace_3012:{status:'unavailable'},
     local_snapshot:{process_contexts:[{
       pcba_sn:'PCBA-TEST-LIVE',defect_code:'D1',defect_time:'2026-10-19 10:30:00',
       production_shift_source:'3022',production_shift_basis:'reference_process',
       reference_station_code:'A5162',production_event_time:'2026-10-19T10:00:00-03:00',
       production_shift:'1st Shift'
     }]}
   }}});
   qa.view.render();
 });
 const snLive=page.locator('[data-console-pane=sn] [data-sn-live]');
 await snLive.locator('[data-sn-live-provenance]').waitFor();
 assert.equal(await snLive.locator('[data-sn-live-provenance]').count(),1);
 assert.equal(await snLive.locator('[data-sn-live-provenance]').evaluate(el=>el.open),false,'source details start collapsed');
 await snLive.locator('[data-sn-live-provenance] summary').click();
 assert.match(await snLive.locator('[data-sn-live-provenance]').innerText(),/3012|2114/);
 assert.equal(await snLive.locator('[data-sn-smart-alerts]').count(),1);
 assert.equal(await snLive.locator('[data-sn-temporal-detail]').count(),1);
 assert.equal(await snLive.locator('[data-sn-history-detail]').count(),1);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'SN live decoration cannot collect MES');
 // PR35 block 15 lifecycle: a new query replaces, rather than stacks on,
 // the previous query's provenance and all read-only forensic decorators.
 await page.evaluate(()=>{
   qa.store.updateAgent({status:'connected',resultSource:'sn',job:{result:{
     sn:'PCBA-SECOND',detected_type:'PCBA',
     trace_2114:{status:'unavailable'},trace_3074:{status:'not_collected'},
     trace_3022:{status:'not_collected'},trace_3012:{status:'not_collected'}
   }}});
   qa.view.render();
 });
 assert.equal(await snLive.locator('[data-sn-live-provenance]').count(),1,'source panel must not duplicate across SN queries');
 assert.equal(await snLive.locator('[data-sn-source-state]').count(),5,'new SN retains all five distinct source statuses');
 assert.equal(await snLive.locator('[data-sn-smart-alerts]').count(),1,'smart alerts panel must not duplicate');
 await page.evaluate(()=>{document.documentElement.lang='en-US';qa.view.render();});
 await page.waitForFunction(()=>document.querySelector('[data-sn-live-provenance] summary')?.textContent?.includes('Source provenance'));
 assert.equal(await snLive.locator('[data-sn-live-provenance]').count(),1,'changing language must not stack source panels');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'query switching and translation must be read-only');
 await page.evaluate(()=>{document.documentElement.lang='pt-BR';qa.view.render();});
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
 // B3.4b6: local snapshot metadata is lazy, source-locked, read-only and escaped.
 await page.locator('[data-console-view=base]').click();
 await page.locator('[data-history-mode=history]').click();
 await page.locator('[data-base-history] form input[name=start]').fill('2026-10-15T07:00');
 await page.locator('[data-base-history] form input[name=end]').fill('2026-10-15T12:00');
 await page.locator('[data-base-history] form button[type=submit]').click();
 await page.locator('[data-history-open]').waitFor();
 await page.evaluate(()=>qa.store.updateAgent({status:'connected',capabilities:{source_id:'preserved-workstation'}}));
 await page.locator('[data-history-open]').click();
 await page.locator('[data-source-capture-toggle]').waitFor();
 assert.equal(await page.evaluate(()=>qa.captureReads()),0,'capture metadata must be lazy');
 await page.locator('[data-source-capture-toggle]').click();
 await page.locator('[data-capture-source="3022"]').waitFor();
 assert.equal(await page.evaluate(()=>qa.captureReads()),1);
 assert.match(await page.locator('[data-capture-source="3022"]').innerText(),/somente progresso/i);
 assert.equal(await page.locator('[data-history-captures] img').count(),0,'job ID cannot create HTML');
 // A different stored day/workstation is not a local capture.
 await page.locator('[data-history-mode=history]').click();
 await page.locator('[data-base-history] form input[name=start]').fill('2026-10-16T07:00');
 await page.locator('[data-base-history] form input[name=end]').fill('2026-10-16T12:00');
 await page.locator('[data-base-history] form button[type=submit]').click();
 await page.locator('[data-history-open]').waitFor();
 await page.locator('[data-history-open]').click();
 await page.locator('[data-source-capture-status]').waitFor();
 assert.equal(await page.locator('[data-source-capture-toggle]').count(),0);
 assert.equal(await page.evaluate(()=>qa.captureReads()),1,'shared revision cannot request this computer’s localhost');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'history navigation must never schedule MES');
 // Global read-period Base must offer the same local index for the SAME revision.
 // The real client sets localConnected after an authenticated successful refresh.
 await page.evaluate(()=>qa.store.setLocalConnected(true));
 await page.locator('[data-console-view=monitor]').click();
 await page.locator('[data-read-period=custom]').click();
 await page.locator('[data-reading-range] input[name=start]').fill('2026-10-15T07:00');
 await page.locator('[data-reading-range] input[name=end]').fill('2026-10-15T12:00');
 await page.locator('[data-reading-range] button[type=submit]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready'&&String(qa.store.read('TAN10101').snapshot?.snapshot_id)==='17');
 await page.locator('[data-console-view=base]').click();
 await page.locator('[data-stored-captures] [data-source-capture-toggle]').waitFor();
 assert.equal(await page.evaluate(()=>qa.captureReads()),1,'no metadata auto-read on global period navigation');
 await page.locator('[data-stored-captures] [data-source-capture-toggle]').click();
 await page.waitForFunction(()=>qa.captureReads()===2);
 await page.locator('[data-stored-captures] [data-capture-source="3022"]').waitFor();
 assert.equal(await page.evaluate(()=>qa.mutations()),0);

 assert.deepEqual(errors,[]);
 console.log('PASS: nine views share exact historical scope; no MES mutations; Today restored; PT/EN and mobile selector');
}finally{await browser.close();await new Promise(r=>server.close(r));}
