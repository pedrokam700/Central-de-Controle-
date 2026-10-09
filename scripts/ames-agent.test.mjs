import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {collectionScope,normalizeAgentRead,SCHEDULER_POLICY} from '../ames/data/agent-contract.mjs';
import {productFixture} from './ames-fixtures.mjs';

const line='TAN10101',scope={lines:[line],performance:'fast',max_failures:0,max_pcbas:0,defect_codes:[]};
function fixture(){
  const legacy=productFixture().payload;
  legacy.defects.forEach(row=>row.snapshot_id=legacy.summary.snapshot_id);
  return {schema:'central-agent-read-v1',legacy,datasets:{pcba_history:[{line,snapshot_id:legacy.summary.snapshot_id,pcba_sn:'P',defect_code:'D1'}],material_reuse:[],history_contexts:[]},insights:{schema:'ames-insights-v1',line,snapshot_id:legacy.summary.snapshot_id,ready:true,pcba_kpis:[['PCBAs',1]],component_types:[{'Tipo material':'RAM'}],drilldowns:{pcbas:[{PCBA:'P',cookie:'secret'}]}}};
}
export function harness(){
  const store=createAmesStore(),f=fixture(),calls=[],pending=[];let clock=10000;
  const routes={health:{agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY},engine_found:true},config:{configured_lines:[line],performance:'fast'},monitor:{enabled:0},'team-dashboard':{snapshot_ids:{[line]:f.legacy.summary.snapshot_id},lines:[{...f.legacy.summary,metrics:f.legacy.summary}]},insights:f.insights,'deep-trace':{id:'J',status:'queued'},runs:{id:'J',status:'queued'},'jobs/J':{id:'J',status:'running',stage_progress:{'3074':{line,current:1,total:3,line_percent:33}},partial_refresh:0},'jobs/J/cancel':{ok:true},'monitor/start':{enabled:true,interval_minutes:5},'monitor/stop':{enabled:false}};
  const fetcher=async(url,options)=>{
    const u=new URL(url),key=u.pathname.replace('/api/v1/','');calls.push({key,body:options.body&&JSON.parse(options.body),options,url});
    if(key==='base')return {ok:true,json:async()=>({rows:u.searchParams.get('dataset')==='defects'?f.legacy.defects:(f.datasets[u.searchParams.get('dataset')]||[])})};
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
test('old agent blocked before commands; real scheduler health required',async()=>{
  const h=harness();h.routes.health.mes_scheduler={};await assert.rejects(h.client.connect(),/patch/);assert.equal(h.store.agent().status,'disconnected');assert.equal(h.calls.length,1);
});
test('real payloads, persistent config, 850ms progress and >2200ms changed partial refresh',async()=>{
  const h=harness();await h.client.connect();assert.equal(h.store.read(line).source,'local');
  await h.client.saveConfig({...scope,lines:[line,'TAN10102']});assert.deepEqual(h.calls.find(c=>c.key==='config'&&c.body).body,{configured_lines:[line,'TAN10102'],performance:'fast'});
  await h.client.collect('deep',{...scope,defect_codes:['D1','D2']});assert.deepEqual(h.calls.find(c=>c.key==='deep-trace').body,{...scope,defect_codes:['D1','D2']});assert.equal(h.pending[0].ms,850);
  const count=()=>h.calls.filter(c=>c.key==='team-dashboard').length,before=count();await h.tick();assert.equal(count(),before);assert.equal(h.store.agent().job.stage_progress['3074'].current,1);
  h.routes['jobs/J'].partial_refresh=1;await h.tick(2300);assert.equal(count(),before+2);await h.tick(3000);assert.equal(count(),before+2);
  h.routes['jobs/J'].status='done';await h.tick();assert.equal(h.pending.length,0);
  await h.client.collect('today',scope);assert.deepEqual(h.calls.find(c=>c.key==='runs').body,{preset:'today',lines:[line],performance:'fast'});
  await h.client.cancel();assert(h.calls.some(c=>c.key==='jobs/J/cancel'));h.client.clear();assert.equal(h.pending.length,0);
});
test('monitor is explicit; original Excel bytes pass through without regenerating',async()=>{
  const h=harness();await h.client.connect();await h.client.monitor(true,{...scope,interval_minutes:5});assert.deepEqual(h.calls.find(c=>c.key==='monitor/start').body,{mode:'today',lines:[line],performance:'fast',interval_minutes:5});
  await h.client.monitor(false,scope);assert.equal(h.store.agent().monitor.enabled,false);assert.equal(await (await h.client.excel()).text(),'PKoriginal');
  assert(h.calls.every(c=>!c.key.includes('3022')&&c.options.credentials==='omit'));
});
test('snapshot replacement while reading is rejected, old read remains intact',async()=>{
  const h=harness();await h.client.connect();const old=h.store.read(line).snapshot;let n=0;
  h.routes['team-dashboard']=()=>({ok:true,json:async()=>({snapshot_ids:{},lines:[{...h.f.legacy.summary,snapshot_id:++n}]})});
  await assert.rejects(h.client.refresh(),/Snapshot mudou/);assert.equal(h.store.read(line).snapshot,old);
});
test('logout aborts pending request, no late data or errors enter next session',async()=>{
  const h=harness();let finish;h.routes.health=()=>new Promise(resolve=>finish=resolve);const pending=h.client.connect();h.client.clear();h.store.clear();finish({ok:true,json:async()=>({agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY}})});await assert.rejects(pending,{name:'AbortError'});assert.equal(h.store.agent().status,'disconnected');assert.equal(h.store.agent().error,'');assert.equal(h.store.read(line).snapshot,null);
});
