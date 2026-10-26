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
oldDefect.repair_evidence_3012=[{pcba_sn:oldDefect.pcba_sn,defect_code:'OTHER-CODE',
 defect_time:'2026-10-07T10:00:00-03:00',repair_time:'2026-10-07T11:00:00-03:00',
 repair_user:'SYNTHETIC-OLD-AT',repair_comment:'Preserved history <script>candidate</script>',
 association:'distinct_occurrence_candidate',occurrence_match:'contradicted',
 candidate_for_occurrence:false,repair_confirmed:false}];
old.insights={schema:'ames-insights-v1',ready:true,line:old.line_id,snapshot_id:old.snapshot_id,
 drilldowns:{pcba_analysis:[{PCBA:oldDefect.pcba_sn,'Defect Code':oldDefect.defect_code,
 'Defect Time':oldDefect.defect_time,'Uso da PCBA na falha':'2º uso','Modelo':oldDefect.product_model}],
 material_analysis:[0,1].map(()=>({'PCBA atual':oldDefect.pcba_sn,'Material SN':'PART-<img src=x>',
 'Tipo material':'GENERIC','Defect Code atual':oldDefect.defect_code,'Defect Time atual':oldDefect.defect_time,
 'Uso material na falha':'3º uso','Part Number':'PN-X'}))}};
old.insights.component_types=[{'Tipo material':'GENERIC','Materiais únicos no lote':1,'Reutilizados únicos':1,'3º+ uso':1}];
old.insights.drilldowns.component_type_items=[0,1].map(()=>({'Material SN':'PART-<img src=x>','Tipo material':'GENERIC','Reusos anteriores material':2,'PCBAs desvinculadas':'OLD-A | OLD-B'}));
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
let mutations=0,savedReads=0,savedOpens=0,captureReads=0,localPairCount=0;
const savedEntry={job_id:'J123',query_sn:'PCBA-TEST',query_created_at:'2026-10-16T14:00:00Z',query_status:'done',entry_hash:'b'.repeat(64),line_id:null,production_date:null,clock_kind:'query_created_at',local_only:true};
const client={canOpenOfficial:()=>true,openOfficial:()=>{},canPairFromOfficial:()=>true,openLocalPairing:()=>{localPairCount++;},collect:async()=>{mutations++;},auxiliary:async name=>{if(name!=='autostartStatus')mutations++;},refresh:async()=>{},clear(){},connect:async()=>{},
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
let historyReads=0,ambiguousHistory=false;
const history={list:async line=>{historyReads++;return line===old.line_id?[
 {line_id:line,source_id:old.source_id,snapshot_id:old.snapshot_id,snapshot_revision:1,collected_at:old.collected_at,period_start:old.summary.period.start_at,period_end:old.summary.period.end_at,history_source:'shared'},
 {line_id:line,source_id:local.source_id,snapshot_id:local.snapshot_id,snapshot_revision:local.snapshot_revision,collected_at:local.collected_at,period_start:local.summary.period.start_at,period_end:local.summary.period.end_at,history_source:'local'},
 ...(ambiguousHistory?[{line_id:line,source_id:'another-workstation',snapshot_id:'FOREIGN-OLD',snapshot_revision:1,collected_at:'2026-10-21T15:00:00Z',period_start:old.summary.period.start_at,period_end:old.summary.period.end_at,history_source:'shared'}]:[])
 ]:[];},open:async entry=>String(entry.snapshot_id)===String(local.snapshot_id)?local:old};
const view=createConsoleView(document.querySelector('#mesConsole'),store,{agentClient:client,history});
document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
document.querySelector('#mesConsoleView')?.classList.remove('hidden');document.querySelector('#accountScreen')?.classList.add('hidden');
window.qa={store,view,mutations:()=>mutations,localPairCount:()=>localPairCount,historyReads:()=>historyReads,savedReads:()=>savedReads,savedOpens:()=>savedOpens,captureReads:()=>captureReads,setAmbiguous:value=>{ambiguousHistory=value;}};view.render();
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
 await page.goto('http://127.0.0.1:'+server.address().port+'/Central-de-Controle-/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.qa);
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 // Real Chromium layout regression: the document must not own an extra scroll
 // while the MES console owns the one page scroll. Screenshot user showed two.
 const panes=await page.evaluate(()=>{
   const scroll=document.querySelector('.ames-legacy-main'),view=document.querySelector('#mesConsoleView');
   return {visible:!!view&&!view.classList.contains('hidden'),
     rootX:getComputedStyle(document.documentElement).overflowX,
     rootY:getComputedStyle(document.documentElement).overflowY,
     bodyY:getComputedStyle(document.body).overflowY,
     paneY:scroll?getComputedStyle(scroll).overflowY:null,
     scrollRange:scroll?scroll.scrollHeight-scroll.clientHeight:null};
 });
 assert.equal(panes.visible,true);
 assert.equal(panes.rootY,'hidden','outer HTML scrollbar must be disabled in fullscreen MES');
 assert.equal(panes.bodyY,'hidden','document body scrollbar must be disabled in fullscreen MES');
 assert.equal(panes.paneY,'auto','only MES pane owns vertical page scrollbar');

 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'FRIDAY-SNAPSHOT');
 for(const id of ['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']){
   await page.locator('[data-console-view="'+id+'"]').click();
   const pane=page.locator('[data-console-pane="'+id+'"]');
   assert.equal(await pane.isVisible(),true);
   if(id==='sn'){
     assert.match(await pane.locator('[data-shared-period]').innerText(),/independente/);
     assert.equal(await pane.locator('[data-sn-form] [data-sn-run]').count(),1,'independent SN live investigation must remain accessible in historical mode');
     assert.equal(await pane.locator('[data-sn-saved-toggle]').count(),1,'saved SN investigations remain accessible across periods');
     assert.equal(await pane.locator('[data-stored-search]').count(),0,'daily snapshot search cannot replace the SN workflow');
   }else assert.match(await pane.locator('[data-shared-period]').innerText(),/16/);
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
 assert.deepEqual(await groupTable.locator('thead th').allTextContents(),
   ['Falha','Ocorrências','PCBAs 2º+*','C/ item 2º+*','Materiais 2º+*','Mesma falha/fam.*','Última ocorrência'],
   'grouped failures retain all four distinct reuse/correlation evidence columns');
 const groupedCells=await groupTable.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(td=>td.textContent.trim())));
 assert.equal(groupedCells.reduce((sum,cells)=>sum+Number(cells[1]),0),old.datasets.defects.length,'grouping cannot duplicate observed 3028 occurrences');
 assert(groupedCells.some(cells=>cells[2]==='1'&&cells[3]==='1'&&cells[4]==='1'),
   'observed board, component-context and unique physical SN counts remain exact and separate');
 assert(groupedCells.some(cells=>cells[5]==='—'),'unproven correlation remains unknown rather than zero');
 assert.doesNotMatch(await groupTable.locator('tbody').innerText(),/≥/,'exact observed counts must not be confused with population coverage');
 assert.match(await page.locator('[data-failure-groups]').innerText(),/cobertura pode estar incompleta/i,'incomplete population coverage stays explicit');
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
 // Issue66: a contradicted 3012 candidate stays auditable, never the current AT.
 const analytics=page.locator('[data-console-pane=top3] [data-top3-analytics]');
 await analytics.locator('[data-dfa-clear]').click();
 await analytics.locator('[data-dfa-mode=occurrences]').click();
 const repairCandidates=analytics.locator('[data-dfa-repair-candidates]');
 assert.equal(await repairCandidates.count(),1);
 await repairCandidates.locator('summary').click();
 assert.match(await repairCandidates.innerText(),/Outra ocorrência \/ não associado/);
 assert.match(await repairCandidates.innerText(),/Preserved history <script>candidate<\/script>/);
 assert.equal(await repairCandidates.locator('img, script').count(),0);
 assert.doesNotMatch(await analytics.locator('.ames-dfa-occ-grid').allTextContents().then(v=>v.join(' ')),/SYNTHETIC-OLD-AT/);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'opening preserved repair candidates cannot query MES');
 await page.locator('[data-console-view=reuse]').click();
 const matrix=page.locator('[data-component-matrix]');
 assert.equal(await matrix.locator('[data-component-cell=total] > summary').innerText(),'1');
 await matrix.locator('[data-component-cell=total] > summary').click();
 assert.equal(await matrix.locator('[data-component-cell=total] [data-component-item]').count(),1);
 assert.match(await matrix.locator('[data-component-cell=total]').innerText(),/OLD-A, OLD-B/);
 assert.equal(await matrix.locator('img').count(),0);
 const cohorts=page.locator('[data-reuse-cohorts]');
 assert.match(await cohorts.innerText(),/Denominador não comprovado/);
 assert.equal(await cohorts.locator('[data-cohort-kind=pcbas][data-cohort-metric=second_use] strong').innerText(),'1');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=third_plus_use] strong').innerText(),'1');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=failed] strong').innerText(),'0');
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=verified_no_failure]').count(),0,
  'unknown denominator cannot occupy an unproven no-failure KPI');
 await cohorts.locator('[data-cohort-limits] > summary').click();
 assert.match(await cohorts.locator('[data-cohort-limits]').innerText(),/Sem registro de falha não comprova ausência/);
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=unknown_outcome]').count(),1,
  'unknown outcomes remain inspectable in the advanced coverage details');
 await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=associated]').click();
 assert.equal(await cohorts.locator('[data-cohort-row]').count(),1);
 assert.equal(await cohorts.locator('img').count(),0);
 await cohorts.locator('[data-cohort-row]').evaluate(e=>e.open=true);
 assert.match(await cohorts.locator('[data-cohort-detail]').innerText(),/FRIDAY-SNAPSHOT/);
 await cohorts.locator('select[name=part_number]').selectOption('PN-X');
 await cohorts.locator('form button[type=submit]').click();
 assert.equal(await cohorts.locator('[data-cohort-kind=components][data-cohort-metric=observed] strong').innerText(),'1');
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 // Line selection remains explicit across reuse↔monitor navigation even with a missing snapshot.
 await page.locator('[data-reuse-line-tab="TAN10102"]').click();
 assert.equal(await page.evaluate(()=>qa.store.context().line_id),'TAN10102');
 await page.locator('[data-console-view="monitor"]').click();
 assert.match(await page.locator('[data-console-pane="monitor"] [data-line-tab="TAN10102"]').getAttribute('class'),/primary/);
 await page.locator('[data-console-view="reuse"]').click();
 await page.locator('[data-reuse-line-tab="TAN10101"]').click();
 assert.equal(await page.evaluate(()=>qa.store.context().line_id),'TAN10101');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'no MES mutation from line changes');
 // D: stored trends use history transport only, and retain gaps/revision evidence.
 await page.locator('[data-console-view=top3]').click();
 const trends=page.locator('[data-console-pane=top3] [data-history-trends]');
 await trends.locator('[data-history-day]').first().waitFor();
 assert.equal(await trends.locator('[data-history-day]').count(),30,'stored trends automatically load 30 days in Top 3 without running MES');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'automatic archived reads must not start collection');
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
 await page.locator('[data-console-view=monitor]').click();
 await page.evaluate(()=>{
   const node=document.querySelector('[data-console-pane="monitor"] [data-latest-capture-preview]');
   if(!node)throw Error('saved capture preview is absent');
   const old=qa.store.agent().period_read;
   qa.store.updateAgent({period_read:{...old,status:'loading'}});
   qa.view.render();
   if(document.querySelector('[data-console-pane="monitor"] [data-latest-capture-preview]')!==node)
     throw Error('saved capture reader remounted on agent polling');
   qa.store.updateAgent({period_read:old});qa.view.render();
 });
 await page.locator('[data-line-tab="TAN10102"]').click();
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10102').snapshot),null);
 await page.locator('[data-line-tab="TAN10101"]').click();await page.locator('[data-global-reading-period] [data-read-period=today]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.snapshot_id),'TODAY-SNAPSHOT');
 for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>{document.documentElement.lang='en-US';qa.view.render();});
   assert.equal(await page.locator('[data-global-reading-period] [data-read-period=previous]').innerText(),'Last production day');
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
 // Factory regression: three 2114 records must raise a visible high alert in
 // the default Complete Story, not disappear inside the hidden Technical tab.
 await page.evaluate(()=>{
   const sn='PCBA-THREE-2114',time='2026-10-20 09:30:00';
   const rows=[0,1,2].map(seq=>({
     pcba_sn:sn,'Defect Hist Seq':seq,'Defect Code':'GN01-TX01',
     'Defect Description':'Antenna: ANT0 test failed','Defect Time':time,
     'Repair Status':'Y','Defect Type':seq===0?'Phone Disassembly':'MainBoard'
   }));
   qa.store.updateAgent({status:'connected',resultSource:'sn',job:{kind:'sn_lookup',status:'done',result:{
     sn,detected_type:'PCBA',trace_2114:{status:'COMPLETE',pcbas:[{
       pcba_sn:sn,status:'COMPLETE',result:{rows}
     }],current_failure:rows[2],previous_failures:rows.slice(0,2)},
     trace_3074:{status:'not_collected'},trace_3022:{status:'not_collected'},
     trace_3012:{status:'not_collected'}
   }}});
   qa.view.render();
 });
 const alertPanel=snLive.locator('[data-sn-tab-panel="story"] [data-sn-smart-alerts]');
 assert.equal(await alertPanel.count(),1,'organized alert must mount in default story');
 assert.equal(await alertPanel.isVisible(),true,'technical tab must not hide priority alert');
 assert.match(await alertPanel.innerText(),/ALTA PRIORIDADE/);
 assert.match(await alertPanel.innerText(),/Mesma falha já ocorreu nesta PCBA/);
 const smartProof=alertPanel.locator('[data-smart-alert="pcba-same-failure"] details');
 await smartProof.locator('summary').click();
 assert.equal(await smartProof.evaluate(el=>el.open),true);
 await page.evaluate(()=>qa.view.render());
 assert.equal(await snLive.locator('[data-sn-tab-panel="story"] [data-smart-alert="pcba-same-failure"] details').evaluate(el=>el.open),true,
   'open evidence must survive a background redraw');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'rendering three historical failures must not collect MES');
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
 // Factory SIM case: A5162 is a prior completed process, NOT a mapped origin.
 await page.evaluate(()=>{
   qa.store.updateAgent({status:'connected',resultSource:'sn',job:{result:{
     sn:'PCBA-SIM-NO-ORIGIN',detected_type:'PCBA',product_model:'CPH2819BR',
     trace_2114:{status:'complete',current_failure:{
       'Defect Code':'J606-KZ03','Defect Description':'SIM card',
       'Defect Time':'2026-10-20 11:59:16','Manual/Automatic':'Manual'
     },previous_failures:[]},
     trace_3074:{status:'partial',reused_components:[]},
     trace_3022:{status:'partial',process_passages:[]},
     trace_3012:{status:'unavailable'},
     local_snapshot:{process_contexts:[{
       source:'3022',pcba_sn:'PCBA-SIM-NO-ORIGIN',product_model:'CPH2819BR',
       defect_code:'J606-KZ03',defect_time:'2026-10-20 11:59:16',
       defect_time_utc:'2026-10-20T14:59:16Z',
       registration_mode:'MANUAL',failure_family:'SIM',
       reference_confidence:'UNMAPPED',reference_reason:'Sem regra CPH/familia',
       status:'GENERIC_ONLY_RULE_NOT_MAPPED',
       reference_pass_count_before_defect:0,
       previous_operation_code:'A5162',previous_event_time:'2026-10-20T14:10:00Z'
     }]}
   }}});
   qa.view.render();
 });
 const simNote=snLive.locator('[data-sn-unmapped-origin]');
 assert.equal(await simNote.count(),1);
 assert.match(await simNote.innerText(),/Posto de geração ainda não mapeado/);
 assert.match(await simNote.innerText(),/A5162/);
 assert.match(await simNote.innerText(),/11:10/);
 assert.match(await simNote.innerText(),/1st Shift/);
 assert.match(await simNote.innerText(),/20\/10\/2026/);
 assert.match(await simNote.innerText(),/NÃO à geração da falha/);
 assert.equal(await snLive.locator('.ames-process-evidence tbody tr').first().locator('td').nth(5).innerText(),'—','no 3022 generation time invented');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'unmapped 3022 diagnostic cannot trigger collection');
 // New physical rule: A5150 is an explicitly approximate assembly reference
 // for functional defects detected later at test, never proven origin.
 await page.evaluate(()=>{
   qa.store.updateAgent({status:'connected',resultSource:'sn',job:{result:{
     sn:'PCBA-SIM-MIDPOINT',detected_type:'PCBA',product_model:'CPH2819BR',
     trace_2114:{status:'complete',current_failure:{
       'Defect Code':'J606-KZ03','Defect Description':'SIM card anomaly',
       'Defect Time':'2026-10-20 11:59:16','Manual/Automatic':'Manual'
     },previous_failures:[]},
     trace_3074:{status:'partial',reused_components:[]},
     trace_3022:{status:'partial',process_passages:[]},
     trace_3012:{status:'unavailable'},
     local_snapshot:{process_contexts:[{
       source:'3022',pcba_sn:'PCBA-SIM-MIDPOINT',product_model:'CPH2819BR',
       defect_code:'J606-KZ03',defect_time:'2026-10-20 11:59:16',
       defect_time_utc:'2026-10-20T14:59:16Z',registration_mode:'MANUAL',
       failure_family:'SIM',reference_station_code:'A5150',
       reference_event_time:'2026-10-20T11:30:00+00:00',
       production_event_time:'2026-10-20T11:30:00+00:00',
       production_shift:'1st Shift',production_operational_date:'2026-10-20',
       production_shift_source:'3022',production_shift_basis:'reference_process',
       reference_confidence:'OPERATIONAL_ESTIMATE_NOT_CAUSE',
       reference_reason:'Referência operacional estimada no A5150, não causa.'
     }]}
   }}});
   qa.view.render();
 });
 const midpoint=snLive.locator('[data-sn-operational-reference]');
 assert.equal(await midpoint.count(),1);
 assert.match(await midpoint.innerText(),/Referência aproximada de montagem: A5150/);
 assert.match(await midpoint.innerText(),/08:30/);
 assert.match(await midpoint.innerText(),/1st Shift/);
 assert.match(await midpoint.innerText(),/NÃO é prova do posto exato/);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'period or midpoint presentation must not initiate MES');
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
 // SN input, live evidence and saved job stay on one stable independent view
 // even while the global production period changes (without MES collection).
 await page.locator('[data-sn-form] input[name=sn]').fill('PCBA-PERSIST-PERIOD');
 await page.evaluate(()=>{qa.snFormIdentity=document.querySelector('[data-console-pane=sn] [data-sn-form]');});
 await page.locator('[data-console-view=monitor]').click();
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 await page.locator('[data-console-view=sn]').click();
 assert.equal(await page.locator('[data-sn-form] input[name=sn]').inputValue(),'PCBA-PERSIST-PERIOD');
 assert.equal(await page.evaluate(()=>qa.snFormIdentity===document.querySelector('[data-console-pane=sn] [data-sn-form]')),true,'period selection must not discard active SN investigation');
 assert.equal(await page.locator('[data-sn-live] [data-sn-smart-alerts]').count(),1);
 assert.equal(await page.locator('[data-sn-saved-toggle]').count(),1);
 assert.equal(await page.locator('[data-stored-search]').count(),0);
 assert.match(await page.locator('[data-console-pane="sn"] [data-shared-period]').innerText(),/independente/);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'period switching and SN display must not execute MES');
 await page.locator('[data-console-view=monitor]').click();
 await page.locator('[data-read-period=today]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 await page.locator('[data-console-view=sn]').click();
 assert.equal(await page.locator('[data-sn-form] input[name=sn]').inputValue(),'PCBA-PERSIST-PERIOD');
 assert.equal(await page.evaluate(()=>qa.snFormIdentity===document.querySelector('[data-console-pane=sn] [data-sn-form]')),true);
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

 // A completed collection must re-read historical SQLite without running MES.
 await page.locator('[data-console-view=monitor]').click();
 await page.locator('[data-read-period=previous]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.locator('[data-monitor-main] [data-agent-action=previous_day]').isVisible(),true);
 assert.equal(await page.locator('[data-monitor-main] [data-agent-action=today]').isVisible(),true);
 assert.equal(await page.locator('[data-monitor-technical]').evaluate(el=>el.open),false);
 assert.equal(await page.locator('[data-console-preparation]').isHidden(),true,'a connected paired agent must not leave the setup panel expanded');
 await page.locator('[data-console-setup]').click();
 assert.equal(await page.locator('[data-console-preparation]').isVisible(),true,'on-demand workstation setup stays accessible');
 assert.equal(await page.locator('[data-pair-official]').count(),1);
 assert.equal(await page.locator('[data-sync-guide]').count(),1,'sync overview integrated in setup');
 assert.equal(await page.locator('[data-share-line]').count(),3,'all lines have explicit synchronized/cached/unknown status');
 // A factory can have several publishers for one day. The UI must report the
 // conflict on each affected line, never quietly claim that no data exists.
 await page.evaluate(()=>{
   const old=qa.store.agent().sync||{};
   qa.store.updateAgent({sync:{...old,read_status:'origin_conflict',origin_conflict_lines:['TAN10102','TAN10103']}});
   qa.view.render();
 });
 assert.equal(await page.locator('[data-share-conflict=true]').count(),2);
 assert.match(await page.locator('[data-source-conflict-warning]').innerText(),/múltiplos publicadores/i);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'conflict diagnostics never modify MES');
 await page.evaluate(()=>{
   const old=qa.store.agent().sync||{};
   qa.store.updateAgent({sync:{...old,read_status:'ready',origin_conflict_lines:[]}});
   qa.view.render();
 });
 await page.locator('[data-onboarding-guide]').waitFor();
 try{await page.locator('[data-official-clean-download]').waitFor({timeout:9000});}
 catch(e){console.error('ONBOARD_DEBUG',await page.locator('[data-onboarding-guide]').innerText(),await page.evaluate(()=>({url:location.href,language:document.documentElement.lang})));throw e;}
 const verifiedDownload=await page.locator('[data-official-clean-download]').getAttribute('href');
 assert(
   verifiedDownload==='https://github.com/pedrokam700/Central-de-Controle-/releases/latest' ||
   /^https:\/\/github\.com\/pedrokam700\/Central-de-Controle-\/releases\/download\/ames-v0\.5\.\d+-multipc-\d{8}\/AMES_Central_CLEAN_[a-f0-9]{8}\.zip$/.test(verifiedDownload),
   'install guide must use a SHA-verified GitHub ZIP or the permanent latest release landing, never a stale ZIP'
 );
 assert.equal(await page.locator('[data-installation-detection=verified]').count(),1);
 assert.equal(await page.locator('[data-setup-new]').count(),1);
 assert.equal(await page.locator('[data-setup-existing]').count(),1);
 assert.equal(await page.locator('[data-setup-share]').count(),1);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'opening install guide never starts MES jobs');
 // Direct HTTPS without the workstation token is a pairing problem, not
 // evidence that the agent was never installed.
 await page.evaluate(()=>{qa.store.updateAgent({status:'disconnected',connection_error:{code:'agent-unauthorized',message:'Token required'}});qa.view.render();});
 await page.locator('[data-installation-detection=pairing_required]').waitFor();
 await page.locator('[data-connect-local-pairing]').click();
 assert.equal(await page.evaluate(()=>qa.localPairCount()),1,'HTTPS button must explicitly start local confirmation');
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'pairing must not run a MES job');
 assert.equal(await page.locator('[data-installation-detection=pairing_required] a[href="http://127.0.0.1:8765/Central-de-Controle-/"]').count(),1,'local recovery link exists before GitHub metadata finishes');
 await page.evaluate(()=>{qa.store.updateAgent({status:'disconnected',connection_error:{code:'agent-network',message:'Browser network restriction'}});qa.view.render();});
 await page.locator('[data-installation-detection=not_verified]').waitFor();
 assert.equal(await page.locator('[data-installation-detection=not_verified] a[href^="http://127.0.0.1:8765/"]').count(),1,'unverified install always retains the local fallback');
 await page.evaluate(()=>{qa.store.updateAgent({status:'connected',connection_error:null});qa.view.render();});
 await page.locator('[data-installation-detection=verified]').waitFor();
 await page.locator('[data-onboarding-guide] [data-integration-mode=viewer]').click();
 await page.locator('[data-setup-viewer]').waitFor();
 assert.equal(await page.locator('[data-official-clean-download]').count(),0,'viewer does not need CLEAN');
 assert.match(await page.locator('[data-setup-viewer]').innerText(),/não precisa de A-MES/);
 assert.equal(await page.evaluate(()=>qa.mutations()),0,'viewer and pairing guidance never start MES');
 await page.locator('[data-console-view=top3]').click();
 await page.locator('[data-console-view=monitor]').click();
 assert.equal(await page.locator('[data-console-preparation]').isHidden(),true,'setup collapses after navigation');
 const beforeJob=await page.evaluate(()=>qa.historyReads());
 await page.evaluate(()=>{qa.store.updateAgent({job:{id:'FACTORY-PREVIOUS-DONE',kind:'run',status:'done'}});qa.view.render();});
 await page.waitForFunction(before=>qa.historyReads()>before,beforeJob);
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.locator('[data-reading-reload]').count(),1);
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 const afterJob=await page.evaluate(()=>qa.historyReads());
 await page.locator('[data-reading-reload]').click();
 await page.waitForFunction(before=>qa.historyReads()>before,afterJob);
 assert.equal(await page.evaluate(()=>qa.mutations()),0);
 // A foreign, newer history entry must not silently replace the chosen origin.
 await page.evaluate(()=>qa.setAmbiguous(true));
 await page.locator('[data-reading-reload]').click();
 await page.waitForFunction(()=>qa.store.agent().period_read?.source_choices?.length===1);
 assert.equal(await page.locator('[data-history-source-picker]').count(),1);
 assert.equal(await page.locator('[data-history-source-select] option').count(),3,'explicit placeholder plus two source identities');
 assert.equal(await page.evaluate(()=>qa.store.agent().period_read.status),'ready','previously validated same-period source remains loaded');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.source_id),'preserved-workstation');
 assert.equal(await page.locator('[data-history-source-advanced]').evaluate(el=>el.open),false,'publisher picker starts collapsed');
 await page.locator('[data-history-source-advanced] summary').click();
 await page.locator('[data-history-source-select]').selectOption('preserved-workstation');
 await page.waitForFunction(()=>qa.store.agent().period_read?.status==='ready');
 assert.equal(await page.evaluate(()=>qa.store.read('TAN10101').snapshot?.source_id),'preserved-workstation');
 assert.equal(await page.locator('[data-history-source-picker]').count(),1,'historical source control persists after selection');
 assert.equal(await page.locator('[data-history-source-select]').inputValue(),'preserved-workstation');
 assert.equal(await page.locator('[data-history-source-select] option').count(),3,'other source remains selectable');
 assert.equal(await page.locator('[data-last-capture-panel]').count(),1,'latest archival evidence also remains reachable outside Today');

 assert.equal(await page.evaluate(()=>qa.mutations()),0,'source selection never starts MES collection');
 await page.locator('[data-read-period=today]').click();
 assert.equal(await page.locator('[data-monitor-main] [data-agent-action=today]').isVisible(),true);
 // Verify actual desktop/mobile CSS layout, not only class names.
 await page.setViewportSize({width:1440,height:950});
 const kpiCols=async()=>page.locator('[data-console-pane=monitor] .ames-line-summary').evaluate(e=>
   getComputedStyle(e).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
 assert.equal(await kpiCols(),4,'four primary KPIs on desktop, separate from provenance');
 assert.equal(await page.locator('[data-monitor-provenance] .stat').count(),2,'snapshot and source stay visible');
 assert.equal(await page.locator('[data-monitor-technical]').evaluate(e=>e.open),false,'technical logs collapsed on landing');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await kpiCols(),2,'mobile primary KPIs in two columns');
 assert.equal(await page.locator('[data-line-tab]').count(),3);
 await page.setViewportSize({width:1440,height:950});
 // An actual logout/reset must destroy the retained SN form and previous
 // forensic content rather than exposing another account's SN investigation.
 await page.evaluate(()=>{qa.store.clear();qa.store.selectReadingPeriod('today');qa.view.render();});
 await page.locator('[data-console-view=sn]').click();
 assert.equal(await page.locator('[data-sn-form] input[name=sn]').inputValue(),'');
 assert.equal(await page.locator('[data-sn-live] [data-sn-smart-alerts]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: nine views share exact historical scope; no MES mutations; Today restored; PT/EN and mobile selector');
}finally{await browser.close();await new Promise(r=>server.close(r));}
