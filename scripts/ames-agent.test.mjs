import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {collectionScope,normalizeAgentRead,SCHEDULER_POLICY} from '../ames/data/agent-contract.mjs';
import {productFixture,canonicalAgentFixture,canonicalResponse} from './ames-fixtures.mjs';

const line='TAN10101',scope={lines:[line],performance:'fast',max_failures:0,max_pcbas:0,defect_codes:[]};
function fixture(){
  const legacy=productFixture().payload;
  legacy.defects.forEach(row=>row.snapshot_id=legacy.summary.snapshot_id);
  return {schema:'central-agent-read-v1',legacy,datasets:{pcba_history:[{line,snapshot_id:legacy.summary.snapshot_id,pcba_sn:'P',defect_code:'D1'}],material_reuse:[],history_contexts:[]},insights:{schema:'ames-insights-v1',line,snapshot_id:legacy.summary.snapshot_id,ready:true,pcba_kpis:[['PCBAs',1]],component_types:[{'Tipo material':'RAM'}],drilldowns:{pcbas:[{PCBA:'P',cookie:'secret'}]}}};
}
export function harness(){
  const store=createAmesStore(),f=fixture(),calls=[],pending=[];let clock=10000;
  f.legacy.summary={...f.legacy.summary,snapshot_id:'17',period:{mode:'today',start_at:'2026-10-08T07:00-03:00',end_at:'2026-10-08T14:00-03:00'}};
  const routes={ready:{ok:true,ready:true,agent_build:'CANONICAL-R11-BATCH',agent_version:'0.5.23'},'v2/capabilities':{schema:'central-ames-v2',native_console:true,revision:true,cursor:true,exact_trace_targets:true,source_id:'test-source'},'v2/snapshots':()=>({ok:true,json:async()=>({snapshots:[canonicalAgentFixture(f)]})}),health:{agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY},engine_found:true},config:{configured_lines:[line],performance:'fast',production_day_start:'07:00',timezone:'America/Sao_Paulo',work_shifts:{'1':{label:'1º Turno',start:'07:30',end:'17:30'},'2':{label:'2º Turno',start:'17:30',end:'07:30'}}},monitor:{enabled:0},backup:{ok:true,backup:{path:'C:/Users/private/data/backups/ames.sqlite3',bytes:2048,created_at:'2026-10-15T09:38:00',reason:'native_console',token:'secret'}},'team-dashboard':{snapshot_ids:{[line]:f.legacy.summary.snapshot_id},lines:[{...f.legacy.summary,metrics:f.legacy.summary}]},insights:f.insights,'deep-trace':{id:'J',status:'queued'},runs:{id:'J',status:'queued'},'jobs/J':{id:'J',status:'running',stage_progress:{'3074':{line,current:1,total:3,line_percent:33}},partial_refresh:0},'jobs/J/cancel':{ok:true},'monitor/start':{enabled:true,interval_minutes:5},'monitor/stop':{enabled:false}};
  const fetcher=async(url,options)=>{
    const u=new URL(url),key=u.pathname.replace('/api/v1/','');calls.push({key,body:options.body&&JSON.parse(options.body),options,url});
    if(key==='v2/records')return {ok:true,json:async()=>canonicalResponse(canonicalAgentFixture(f),u)};
    if(key==='base')return {ok:true,json:async()=>({rows:u.searchParams.get('dataset')==='defects'?f.legacy.defects:(f.datasets[u.searchParams.get('dataset')]||[])})};
    if(key==='base/catalog')return {ok:true,json:async()=>({datasets:[{dataset:'defects',rows:f.legacy.defects.length}]})};
    if(key==='export/excel/download')return {ok:true,blob:async()=>new Blob(['PKoriginal'])};
    const value=routes[key];if(value instanceof Function)return value(options);
    if(!value)throw Error('Unexpected route '+key);
    return {ok:true,json:async()=>structuredClone(value)};
  };
  const client=createAgentClient(store,{fetcher,now:()=>clock,schedule:(fn,ms)=>{pending.push({fn,ms});return fn;},unschedule:fn=>{const i=pending.findIndex(x=>x.fn===fn);if(i>=0)pending.splice(i,1);}});
  return {store,f,calls,routes,pending,client,tick:async(ms=850)=>{clock+=ms;await pending.shift().fn();}};
}
test('real local projection is partial, line/snapshot isolated; exact CPH and manual state preserved',()=>{
  const f=fixture();f.datasets.pcba_history.push({line:'TAN10102',snapshot_id:f.legacy.summary.snapshot_id,pcba_sn:'P',defect_code:'D1'},{line,snapshot_id:'wrong',pcba_sn:'P'});
  const store=createAmesStore(),state={ames:store,reports:[{id:'manual'}]};store.replaceLocalSnapshots([f]);store.setLocalConnected(true);
  const s=store.read(line).snapshot;assert.equal(s.pcba_history.records.length,1);assert.equal(s.coverage.status,'partial');assert.equal(s.insights.drilldowns.pcbas[0].cookie,undefined);
  const a=store.occurrences({line_id:line,product:'CPH2859V'}),b=store.occurrences({line_id:line,product:'CPH2859'});assert(a.rows.every(r=>r.product_key==='CPH2859V'));assert(b.rows.every(r=>r.product_key==='CPH2859'));assert.equal(s.occurrences[0].occurrence_id,null);assert.deepEqual(state.reports,[{id:'manual'}]);
  const old=s;f.legacy.defects[0].defect_desc='corrected';store.replaceLocalSnapshots([f]);assert.notEqual(store.read(line).snapshot,old);assert.equal(store.read(line).snapshot.occurrences[0].defect_desc,'corrected');
});
test('untrusted remote envelope cannot enable local agent histories',()=>{
  const f=fixture(),s=createAmesStore();s.replaceRemoteDocuments([{kind:'ames_shared_snapshot',line,schema:f.schema,payload:f}]);assert.equal(s.read(line).snapshot,null);
  f.insights.line='TAN10102';assert.equal(normalizeAgentRead(f).insights,null);
});
test('scope validates exact lines, supported profiles and limits',()=>{
  assert.deepEqual(collectionScope({...scope,lines:[line,line]}),scope);
  for(const patch of [{lines:[]},{lines:['1']},{performance:'turbo'},{max_pcbas:-1},{max_failures:1.5},{defect_codes:['']}])assert.throws(()=>collectionScope({...scope,...patch}));
});
test('old agent blocked after fast readiness; real scheduler health required',async()=>{
  const h=harness();h.routes.health.mes_scheduler={};await assert.rejects(h.client.connect(),/patch/);assert.equal(h.store.agent().status,'disconnected');assert.deepEqual(h.calls.map(c=>c.key),['ready','health']);
});
test('health and manual backup keep recovery metadata without paths or secrets in Central state',async()=>{
  const h=harness();h.routes.health.latest_backup={path:'C:/Users/private/data/backups/old.sqlite3',bytes:4096,modified_at:'2026-10-15T08:00:00',token:'health-secret'};
  await h.client.connect();
  assert.deepEqual(h.store.agent().runtime.latest_backup,{created_at:'2026-10-15T08:00:00',bytes:4096,reason:null});
  let state=JSON.stringify(h.store.agent());assert.equal(state.includes('C:/Users/private'),false);assert.equal(state.includes('health-secret'),false);
  const result=await h.client.auxiliary('backup');
  assert.deepEqual(result.backup,{created_at:'2026-10-15T09:38:00',bytes:2048,reason:'native_console'});
  assert.deepEqual(h.store.agent().auxiliary.result.backup,result.backup);
  state=JSON.stringify(h.store.agent());assert.equal(state.includes('C:/Users/private'),false);assert.equal(state.includes('secret'),false);
});
test('real payloads, persistent config, 850ms progress and >2200ms changed partial refresh',async()=>{
  const h=harness();await h.client.connect();assert.equal(h.store.read(line).source,'local');assert.deepEqual(h.calls.slice(0,2).map(c=>c.key),['ready','health']);assert.equal(h.store.agent().config.production_day_start,'07:00');
  await h.client.saveConfig({...scope,lines:[line,'TAN10102']});assert.deepEqual(h.calls.find(c=>c.key==='config'&&c.body).body,{configured_lines:[line,'TAN10102'],performance:'fast'});
  await h.client.collect('deep',{...scope,defect_codes:['D1','D2']});assert.deepEqual(h.calls.find(c=>c.key==='deep-trace').body,{...scope,defect_codes:['D1','D2'],snapshot_targets:{[line]:{source_id:'test-source',snapshot_id:'17',snapshot_revision:1,content_hash:'test-hash-1',period:h.f.legacy.summary.period}},request_id:h.calls.find(c=>c.key==='deep-trace').body.request_id});assert.equal(h.pending[0].ms,850);
  const count=()=>h.calls.filter(c=>c.key==='v2/snapshots').length,before=count();await h.tick();assert.equal(count(),before);assert.equal(h.store.agent().job.stage_progress['3074'].current,1);
  h.routes['jobs/J'].partial_refresh=1;await h.tick(2300);assert.equal(count(),before+1);await h.tick(3000);assert.equal(count(),before+1);
  h.routes['jobs/J'].status='done';await h.tick();assert.equal(h.pending.length,0);
  await h.client.collect('today',scope);assert.deepEqual(h.calls.find(c=>c.key==='runs').body,{preset:'today',lines:[line],performance:'fast',request_id:h.calls.find(c=>c.key==='runs').body.request_id});
  await h.client.cancel();assert(h.calls.some(c=>c.key==='jobs/J/cancel'));h.client.clear();assert.equal(h.pending.length,0);
});
test('completed 3028 run exposes only exact per-line local snapshot receipt, not MES result data',async()=>{
 const h=harness();await h.client.connect();
 h.routes['jobs/J']={id:'J',kind:'analysis',status:'done',result:{
  snapshot_ids:{[line]:38,TAN10102:'foreign',TAN10103:0},
  start_at:'2026-10-16T07:00',end_at:'2026-10-17T07:00',
  dashboard:{secret:'never in view state'},records_3028:[{private:'no'}]
 }};
 await h.client.collect('previous_day',scope);await h.tick();
 assert.deepEqual(h.store.agent().job.collection_receipt,{snapshot_ids:{[line]:'38'},
  period_start:'2026-10-16T07:00',period_end:'2026-10-17T07:00'});
 assert.equal(JSON.stringify(h.store.agent().job).includes('secret'),false);
 assert.equal(JSON.stringify(h.store.agent().job).includes('private'),false);
 h.client.clear();
});
test('monitor is explicit; original Excel bytes pass through without regenerating',async()=>{
  const h=harness();await h.client.connect();await h.client.monitor(true,{...scope,interval_minutes:5});assert.deepEqual(h.calls.find(c=>c.key==='monitor/start').body,{mode:'today',lines:[line],performance:'fast',interval_minutes:5});
  await h.client.monitor(false,scope);assert.equal(h.store.agent().monitor.enabled,false);assert.equal(await (await h.client.excel()).text(),'PKoriginal');
  assert(h.calls.every(c=>!c.key.includes('3022')&&c.options.credentials==='omit'));
});
test('technical Base reads carry exact bounded offset without changing canonical refresh transport',async()=>{
  const h=harness();await h.client.connect();
  await h.client.auxiliary('dataset',{dataset:'defects',line,snapshot_id:'17',limit:100,offset:200});
  const call=h.calls.filter(c=>c.key==='base').at(-1),url=new URL(call.url);
  assert.equal(url.searchParams.get('dataset'),'defects');assert.equal(url.searchParams.get('line'),line);assert.equal(url.searchParams.get('snapshot_id'),'17');
  assert.equal(url.searchParams.get('limit'),'100');assert.equal(url.searchParams.get('offset'),'200');
  const canonicalCalls=h.calls.filter(c=>c.key==='v2/records');assert(canonicalCalls.every(c=>!new URL(c.url).searchParams.has('offset')));
});
test('snapshot replacement while reading is rejected, old read remains intact',async()=>{
  const h=harness();await h.client.connect();const old=h.store.read(line).snapshot;
  h.routes['v2/snapshots']=()=>({ok:true,json:async()=>({snapshots:[{...canonicalAgentFixture(h.f),snapshot_revision:2}]})});
  await assert.rejects(h.client.refresh(),/Revisão misturada/);assert.equal(h.store.read(line).snapshot,old);
});
test('logout aborts pending health request, no late data or errors enter next session',async()=>{
  const h=harness();let finish;h.routes.health=()=>new Promise(resolve=>finish=resolve);const pending=h.client.connect();
  for(let i=0;i<20&&!finish;i++)await Promise.resolve();
  assert.equal(typeof finish,'function');h.client.clear();h.store.clear();finish({ok:true,json:async()=>({agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY}})});await assert.rejects(pending,{name:'AbortError'});assert.equal(h.store.agent().status,'disconnected');assert.equal(h.store.agent().error,'');assert.equal(h.store.read(line).snapshot,null);
});

test('timeout retry retains request identity and unchanged revisions avoid dataset requests',async()=>{
  const h=harness();await h.client.connect();const old=h.store.read(line).snapshot;
  const before=h.calls.filter(c=>c.key==='v2/records').length;await h.client.refresh();assert.equal(h.calls.filter(c=>c.key==='v2/records').length,before);assert.equal(h.store.read(line).snapshot,old);
  h.routes['deep-trace']=()=>{throw new DOMException('Timeout','TimeoutError');};
  await assert.rejects(h.client.collect('deep',scope),{name:'TimeoutError'});const id=h.calls.find(c=>c.key==='deep-trace').body.request_id;
  const newer=structuredClone(h.store.localCanonical()[0]);newer.snapshot_revision=2;newer.content_hash='newer';
  for(const rows of Object.values(newer.datasets))for(const row of rows)row.snapshot_revision=2;
  h.store.replaceLocalSnapshots([newer]);
  h.routes['deep-trace']={id:'J',status:'queued'};await h.client.collect('deep',scope);assert.equal(h.calls.filter(c=>c.key==='deep-trace').at(-1).body.request_id,id);h.client.clear();
  assert.equal(h.calls.filter(c=>c.key==='deep-trace').at(-1).body.snapshot_targets[line].snapshot_revision,1);
});
test('local history requests the exact revision and rejects latest substitution by an older agent',async()=>{
 const h=harness();await h.client.connect();
 const f=structuredClone(h.f);f.legacy.summary.snapshot_id='17';const p=canonicalAgentFixture(f);h.routes['local-history']=p;
 await h.client.historicalPayload(p.snapshot_id,line,p.snapshot_revision);
 const url=new URL(h.calls.at(-1).url);assert.equal(url.searchParams.get('snapshot_revision'),String(p.snapshot_revision));
 await assert.rejects(h.client.historicalPayload(p.snapshot_id,line,p.snapshot_revision+1),/divergente/);
 const before=h.calls.length;await assert.rejects(h.client.historicalPayload(p.snapshot_id,line,0),/inválida/);assert.equal(h.calls.length,before);
 await h.client.historicalPayload(p.snapshot_id,line);assert.equal(new URL(h.calls.at(-1).url).searchParams.has('snapshot_revision'),false);
 h.client.clear();
});
test('deep trace refuses legacy capability, other workstation and remote historical data before submit',async()=>{
 for(const scenario of ['legacy','other-source','remote','missing-period']){
  const h=harness();await h.client.connect();
  if(scenario==='legacy')h.store.updateAgent({capabilities:{...h.store.agent().capabilities,exact_trace_targets:false}});
  if(scenario==='other-source')h.store.updateAgent({capabilities:{...h.store.agent().capabilities,source_id:'another-workstation'}});
  if(scenario==='remote'){
   const p=structuredClone(h.store.localCanonical()[0]);p.summary.period={mode:'previous_day',start_at:'2026-10-07T07:00',end_at:'2026-10-08T07:00'};
   h.store.selectReadingPeriod('custom',{start:'2026-10-07T07:00',end:'2026-10-08T07:00'});
   h.store.installHistoricalSnapshot(p,{source:'remote'});
  }
  if(scenario==='missing-period'){
   const p=structuredClone(h.store.localCanonical()[0]);p.summary.period={};p.content_hash='without-period';h.store.replaceLocalSnapshots([p]);
  }
  await assert.rejects(h.client.collect('deep',scope),/agente|revisão local/,scenario);
  assert.equal(h.calls.filter(c=>c.key==='deep-trace').length,0);h.client.clear();
 }
});
test('deep trace uses the selected local past revision even when publication head is newer',async()=>{
 const h=harness();await h.client.connect();
 const p=structuredClone(h.store.localCanonical()[0]);p.snapshot_id='12';p.content_hash='past-hash';
 for(const rows of Object.values(p.datasets))for(const row of rows)row.snapshot_id='12';
 p.summary.period={mode:'previous_day',start_at:'2026-10-07T07:00',end_at:'2026-10-08T07:00'};
 h.store.selectReadingPeriod('custom',{start:'2026-10-07T07:00',end:'2026-10-08T07:00'});
 h.store.installHistoricalSnapshot(p,{source:'local'});await h.client.collect('deep',scope);
 assert.equal(h.calls.find(c=>c.key==='deep-trace').body.snapshot_targets[line].snapshot_id,'12');
 assert.equal(h.store.localCanonical()[0].snapshot_id,'17');h.client.clear();
});


test('saved SN queries use authenticated local jobs only, carry query clock and validate identity before opening',async()=>{
  const h=harness();await h.client.connect();
  const entry={job_id:'ab0123',query_sn:'P01',entry_hash:'a'.repeat(64),query_created_at:'2026-10-19T15:00:00+00:00',clock_kind:'query_created_at',line_id:null,production_date:null,local_only:true};
  h.routes['saved-sn-history']={items:[entry],next_cursor:null,clock_kind:'query_created_at',local_only:true};
  const index=await h.client.savedSnHistory({sn:'P01',start:'2026-10-19T00:00:00Z',limit:15});
  assert.equal(index.items[0].entry_hash,entry.entry_hash);
  const q=new URL(h.calls.at(-1).url).searchParams;
  assert.equal(q.get('sn'),'P01');
  assert.equal(q.get('start'),'2026-10-19T00:00:00Z');
  assert.equal(q.get('limit'),'15');
  assert(!JSON.stringify(h.store.agent()).includes('ab0123'));
  h.routes['saved-sn-history']={job_id:entry.job_id,entry_hash:entry.entry_hash,clock_kind:'query_created_at',local_only:true,line_id:null,production_date:null,result:{trace_3074:{rows:[{evidence:'LOCAL-ONLY'}]}}};
  const exact=await h.client.openSavedSnHistory(entry);
  assert.equal(exact.result.trace_3074.rows[0].evidence,'LOCAL-ONLY');
  assert.equal(new URL(h.calls.at(-1).url).searchParams.get('entry_hash'),entry.entry_hash);
  assert.equal(JSON.stringify(h.store.agent()).includes('LOCAL-ONLY'),false);
  await assert.rejects(h.client.openSavedSnHistory({...entry,entry_hash:'invalid'}),/Identidade/);
  h.routes['saved-sn-history']={...exact,entry_hash:'b'.repeat(64)};
  await assert.rejects(h.client.openSavedSnHistory(entry),/divergente/);
  await assert.rejects(h.client.savedSnHistory({limit:0}),/Limite/);
  h.client.clear();
});


test('source capture metadata from exact immutable revision is local, bounded and never accepted with raw MES payloads',async()=>{
  const h=harness();await h.client.connect();
  const scope={snapshot_id:'19',line_id:'TAN10103',snapshot_revision:2,content_hash:'a'.repeat(64)};
  const record={snapshot_id:'19',line_id:'TAN10103',snapshot_revision:2,source_view:'3074',
    capture_revision:1,job_id:'JOB1',local_only:true,source_complete:false,source_status:'partial'};
  h.routes['source-captures']={schema:'ames-local-source-capture-v1',metadata_only:true,
    local_only:true,source_complete:false,...scope,items:[record],next_cursor:null};
  const beforeState=JSON.stringify(h.store.agent());
  const data=await h.client.sourceCaptures({...scope,source_view:'3074'});
  assert.equal(data.items.length,1);
  const q=new URL(h.calls.at(-1).url).searchParams;
  assert.equal(q.get('snapshot_id'),'19');
  assert.equal(q.get('line'),'TAN10103');
  assert.equal(q.get('snapshot_revision'),'2');
  assert.equal(q.get('content_hash'),'a'.repeat(64));
  assert.equal(q.get('source_view'),'3074');
  assert.equal(JSON.stringify(h.store.agent()),beforeState);
  h.routes['source-captures'].items=[{...record,result:{private_at:'should-not-enter'}}];
  await assert.rejects(h.client.sourceCaptures(scope),/incompatível|inesperados/);
  h.routes['source-captures'].items=[{...record,unreviewed_raw:{personal:'NOPE'}}];
  await assert.rejects(h.client.sourceCaptures(scope),/inesperados/);
  h.routes['source-captures'].items=[{...record,source_view:'3012'}];
  await assert.rejects(h.client.sourceCaptures(scope),/incompatível|inesperados/);
  h.routes['source-captures'].items=[record];
  h.routes['source-captures'].content_hash='b'.repeat(64);
  await assert.rejects(h.client.sourceCaptures(scope),/incompatível/);
  const count=h.calls.length;
  await assert.rejects(h.client.sourceCaptures({...scope,line_id:'OTHER'}),/inválida/);
  await assert.rejects(h.client.sourceCaptures({...scope,source_view:'3012'}),/inválida/);
  assert.equal(h.calls.length,count);
  h.client.clear();
});
