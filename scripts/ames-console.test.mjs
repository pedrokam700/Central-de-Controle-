import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAmesStore} from '../ames/data/store.mjs';
import {projectLegacy} from '../ames/data/projection.mjs';
import {occurrenceList} from '../ames/failure-view.mjs';
import {r12CompatibleBuild} from '../ames/data/agent-contract.mjs';
import {productFixture} from './ames-fixtures.mjs';

const line_id='TAN10101';
function setup(){const store=createAmesStore();return {store};}

test('console investigation isolates exact CPH, PCBA, line and source states', () => {
  const store=createAmesStore();
  store.replaceRemoteSnapshots([
    productFixture(line_id,1,{product:'CPH2859',pcba:'SN-A'}),
    productFixture('TAN10102',2,{product:'CPH2859V',pcba:'SN-A'}),
  ]);
  assert.equal(store.read(line_id).snapshot.occurrences[0].product_key,'CPH2859');
  assert.equal(store.read('TAN10102').snapshot.occurrences[0].product_key,'CPH2859V');
  assert.notEqual(store.read(line_id).snapshot.occurrences[0].row_ref,store.read('TAN10102').snapshot.occurrences[0].row_ref);
});

test('console filtered KPIs resolve only loaded references and never assert completeness', () => {
  const store=createAmesStore();store.replaceRemoteSnapshots([productFixture(line_id,2,{product:'CPH2859V'})]);
  const snapshot=store.read(line_id).snapshot;
  assert.equal(snapshot.coverage.status,'partial');
  assert.equal(snapshot.occurrences.length,2);
  assert(snapshot.occurrences.every(row=>row.product_key==='CPH2859V'));
});

test('source Defect Type stays escaped observation, not cause or material reuse',()=>{
  const legacy=productFixture(line_id,1).payload;
  legacy.defects[0]['Defect Type']='<img onerror=bad>';
  const payload=projectLegacy(legacy);const row=payload.occurrences[0];
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
  for(const label of ['Monitoramento','Falhas do dia & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento']) assert.match(source,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
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
    {line:'TAN10102',snapshot_id:sid,pcba_sn:'FOREIGN',operation_code:'A5162',operation_name:'Other',event_time:'2026-10-08T10:01:00',event_group:'assembly'},
  ],process_defect_contexts:[
    {line:line_id,snapshot_id:sid,pcba_sn:'SYNTHETIC-PCBA-0',defect_code:'D001',defect_time:'2026-10-08T10:02:00',reference_station_code:'A5162',reference_event_time:'2026-10-08T10:00:00',status:'OK'},
    {line:'TAN10102',snapshot_id:sid,pcba_sn:'FOREIGN',defect_code:'D001',defect_time:'2026-10-08T10:02:00',reference_station_code:'A5162',reference_event_time:'2026-10-08T10:01:00',status:'OK'},
  ]}};
  const projected=projectLegacy(payload.legacy,payload.datasets);
  assert.equal(projected.process_timeline.events.length,1);assert.equal(projected.process_timeline.events[0].pcba_sn,'SYNTHETIC-PCBA-0');
  assert.equal(projected.process_timeline.contexts.length,1);assert.equal(projected.process_timeline.contexts[0].pcba_sn,'SYNTHETIC-PCBA-0');
});

test('legacy R12 keeps operational failure fields already collected by 3028/repair refresh',()=>{
  const legacy=productFixture(line_id,1).payload;
  Object.assign(legacy.defects[0],{repair_user:'BRM00068',repair_time:'2026-10-08T10:30:00',repair_comment:'AT observada',defect_type:'incoming batch abnormal'});
  const projected=projectLegacy(legacy);
  assert.equal(projected.occurrences[0].repair_user,'BRM00068');
  assert.equal(projected.occurrences[0].repair_comment,'AT observada');
  assert.equal(projected.occurrences[0].defect_type,'incoming batch abnormal');
});