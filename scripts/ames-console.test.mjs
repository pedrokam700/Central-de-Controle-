import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAmesStore } from '../ames/data/store.mjs';
import { selectDashboard } from '../ames/data/dashboard.mjs';
import { occurrenceList } from '../ames/evidence-view.mjs';
import { normalizeAgentRead, r12CompatibleBuild } from '../ames/data/agent-contract.mjs';
import { productFixture } from './ames-fixtures.mjs';
const line_id = 'TAN10101';
function setup() {
  const store = createAmesStore(), a = productFixture(), b = productFixture('TAN10102', 10);
  for (const doc of [a,b]) doc.payload.defects.forEach((row,i) => {
    row.repair_status_current = i % 2 ? 'OPEN' : 'CLOSED'; row.defect_type_current = i % 3 ? 'PROCESS' : 'MATERIAL';
  });
  store.replaceRemoteDocuments([a,b]); return { store, a, b };
}
test('console investigation isolates exact CPH, PCBA, line and source states', () => {
  const {store} = setup();
  let m = selectDashboard(store, {line_id,product:'2859v',pcba_sn:'SYNTHETIC-PCBA-0',repair_status:'CLOSED',defect_type:'MATERIAL'});
  assert.equal(m.rows.length,1); assert(m.rows.every(r=>r.line_id===line_id&&r.product_key==='CPH2859V'));
  assert.equal(m.scope.pcba_sn,'SYNTHETIC-PCBA-0'); assert(m.aggregates.every(k=>k.value===null));
  assert.equal(selectDashboard(store,{line_id,product:'CPH2859',pcba_sn:'SYNTHETIC-PCBA-0'}).rows.length,0);
  assert.equal(selectDashboard(store,{line_id,pcba_sn:'SYNTHETIC-PCBA'}).rows.length,0);
  assert.equal(selectDashboard(store,{line_id:'TAN10102'}).rows.length,10);
  assert.equal(selectDashboard(store,{line_id,repair_status:'OPEN',defect_type:'MATERIAL'}).rows.length,10);
  assert.throws(()=>selectDashboard(store,{}));
});
test('console filtered KPIs resolve only loaded references and never assert completeness', () => {
  const {store} = setup(); const m=selectDashboard(store,{line_id,defect_type:'MATERIAL'});
  assert.equal(m.coverage.status,'partial'); assert.equal(m.rows.length,20);
  assert.deepEqual(m.sample_metric.evidence_refs,m.rows.map(r=>r.evidence_ref));
  assert.equal(m.pareto[0].count,20); assert.equal(m.pareto[0].code,'D2');
  assert.equal(selectDashboard(store,{line_id,repair_status:'UNKNOWN'}).sample_metric.value,0);
  store.clear(); assert.equal(selectDashboard(store,{line_id}).sample_metric.value,null);
});
test('source Defect Type stays escaped observation, not cause or material reuse', () => {
  const {store,a}=setup(); a.payload.defects[0].defect_type_current='<img onerror=bad>';
  store.replaceRemoteDocuments([a]); const row=store.read(line_id).snapshot.occurrences[0];
  assert.equal(row.defect_type,'<img onerror=bad>'); assert.equal(row.occurrence_id,null);
  assert.match(occurrenceList([row]),/&lt;img onerror=bad&gt;/); assert.equal(row.material_sn,undefined);
});
test('console shell entry uses same store, guards session/view and reuses renderer', () => {
  const source=fs.readFileSync('app.js','utf8'); const {store}=setup(); let creates=0,renders=0;
  const context=vm.createContext({state:{ames:store},document:{querySelector:()=>({})},createConsoleView(_root,s){assert.equal(s,store);creates++;return {render(){renders++;}};}});
  vm.runInContext("let currentAuthUser=null,activeView='mesConsole',currentLanguage='pt-BR';"+source.slice(source.indexOf('    let consoleMesView;'),source.indexOf('    let dashboardMesView;'))+'renderConsoleMes();',context);
  assert.equal(creates,0); vm.runInContext("currentAuthUser={uid:'A'};activeView='home';renderConsoleMes();activeView='mesConsole';renderConsoleMes();renderConsoleMes();",context);
  assert.equal(creates,1);assert.equal(renders,2);
});

test('native Console preserves the nine canonical automation views and no iframe', () => {
  const source=fs.readFileSync('ames/console-view.mjs','utf8');
  for(const label of ['Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento']) assert.match(source,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(source,/<iframe|createElement\(['"]iframe/i);
  assert.match(source,/createAgentClient\(store/);
});

test('R12 local compatibility is explicit and does not accept arbitrary old agents', () => {
  const base={agent_version:'0.5.23',auto_3022_ready:true,mes_scheduler:{policy:'fifo-monitor-skip-v1'}};
  assert.equal(r12CompatibleBuild({...base,agent_build:'3022-R12'}),true);
  assert.equal(r12CompatibleBuild({...base,agent_build:'3022-R18'}),true);
  assert.equal(r12CompatibleBuild({...base,agent_build:'3022-R11'}),false);
  assert.equal(r12CompatibleBuild({...base,agent_build:'legacy'}),false);
  assert.equal(r12CompatibleBuild({...base,agent_build:'3022-R12',auto_3022_ready:false}),false);
});

test('legacy R12 projection keeps 3022 events and defect contexts isolated by line/snapshot', () => {
  const legacy=productFixture(line_id,2).payload,sid=String(legacy.summary.snapshot_id);
  const payload={legacy,datasets:{pcba_history:[],material_reuse:[],history_contexts:[],process_events:[
    {line:line_id,snapshot_id:sid,pcba_sn:'SYNTHETIC-PCBA-0',operation_code:'A5162',operation_name:'Camera clean',event_time:'2026-10-08T10:00:00',event_group:'assembly'},
    {line:'TAN10102',snapshot_id:sid,pcba_sn:'LEAK',operation_code:'A5700',event_time:'2026-10-08T11:00:00'}
  ],process_defect_contexts:[
    {line:line_id,snapshot_id:sid,pcba_sn:'SYNTHETIC-PCBA-0',defect_code:'D2',defect_time:'2026-10-08T12:00:00',registration_mode:'MANUAL',failure_family:'CAMERA',reference_station_code:'A5162',reference_event_time:'2026-10-08T10:00:00',status:'MAPPED'}
  ]},insights:null};
  const normalized=normalizeAgentRead(payload);
  assert.equal(normalized.process_timeline.status,'partial');
  assert.equal(normalized.process_timeline.events.length,1);
  assert.equal(normalized.process_timeline.events[0].operation_code,'A5162');
  assert.equal(normalized.process_timeline.contexts.length,1);
  assert.equal(normalized.process_timeline.contexts[0].registration_mode,'MANUAL');
});

test('agent client asks SN with 3022 and exposes full/process-only/reuse-only trace mode', () => {
  const source=fs.readFileSync('ames/agent-client.mjs','utf8');
  assert.match(source,/include_3022:true/);
  assert.match(source,/process_only/);
  assert.match(source,/reuse_only/);
  assert.match(source,/trace_mode/);
});
