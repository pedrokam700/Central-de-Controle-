import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {snLiveSummaryEvidence,renderSnCompactContext} from '../ames/console-sn-live-context.mjs';
import {renderSnCorrelationAlerts} from '../ames/evidence-view.mjs';

function baseResult(){
  return {
    sn:'PCB-X',detected_type:'PCBA',
    trace_2114:{
      status:'complete',
      current_failure:{pcba_sn:'PCB-X',defect_code:'F1',defect_desc:'FAIL',defect_time:'2026-10-17 10:30:00',manual_or_auto:'Manual'}
    },
    trace_3074:{status:'complete',reused_components:[]},
    trace_3022:{status:'complete',process_passages:[]},
    local_snapshot:{process_contexts:[]},
  };
}

test('SN summary preserves live 2114 Defect Time and Manual/Automatic even without previous_failures array',()=>{
  const evidence=snLiveSummaryEvidence(baseResult());
  assert.equal(evidence.has2114,true);
  assert.equal(evidence.current.defect_time,'2026-10-17 10:30:00');
  assert.equal(evidence.current.manual_or_auto,'Manual');
  assert.equal(evidence.previous.length,0);
});

test('exact 3022 reference_process context is selected for the current failure occurrence',()=>{
  const result=baseResult();
  result.local_snapshot.process_contexts=[
    {pcba_sn:'PCB-OTHER',defect_code:'F1',defect_time:'2026-10-17 10:30:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'WRONG',production_event_time:'2026-10-17T11:00:00-03:00',production_shift:'2nd Shift'},
    {pcba_sn:'PCB-X',defect_code:'F1',defect_time:'2026-10-17 10:30:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A1600',production_event_time:'2026-10-17T10:00:00-03:00',production_shift:'1st Shift'}
  ];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.production.trusted,true);
  assert.equal(evidence.production.station,'A1600');
  assert.equal(evidence.production.shift,'1st Shift');
});

test('trusted-looking 3022 context from another occurrence is not promoted',()=>{
  const result=baseResult();
  result.local_snapshot.process_contexts=[{pcba_sn:'PCB-X',defect_code:'F1',defect_time:'2026-10-17 09:00:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A1600',production_event_time:'2026-10-17T08:30:00-03:00',production_shift:'1st Shift'}];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.production.trusted,false);
  assert.equal(evidence.production.station,null);
  assert.equal(evidence.production.event_time,null);
});

test('absence remains unknown and materials story data survives the summary bridge',()=>{
  const result=baseResult();
  delete result.trace_2114.current_failure;
  result.trace_2114.previous_failures=[];
  result.trace_3074.reused_components=[{item_sn:'MAT-1',item_type:'CAMERA',previous_pcbas:['PCB-OLD'],relation_to_current_failure:'FALHA_DIFERENTE'}];
  const evidence=snLiveSummaryEvidence(result);
  assert.equal(evidence.has2114,true);
  assert.equal(evidence.current,null);
  assert.equal(evidence.production.trusted,false);
  assert.equal(evidence.model.materials.length,1);
  assert.equal(evidence.model.materials[0].item_sn,'MAT-1');
});

test('hardened agent installs the live SN production-context bridge and its focused Python contract passes',()=>{
  const source=fs.readFileSync(new URL('../ames/agent/agent_hardened_entry.py',import.meta.url),'utf8');
  assert.match(source,/import sn_lookup_context/);
  assert.match(source,/sn_lookup_context\.install\(entry\.a\)/);
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(python,['scripts/agent-sn-lookup-context.test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,(result.stdout||'')+(result.stderr||''));
});

test('live material view shows only defect-time selection, including not-reused items',()=>{
 const result=baseResult();
 result.trace_3074={
   status:'complete',
   material_selection:{status:'selected_at_latest_2114_candidate',scanned_components:2,
     historical_components_ignored:3,temporal_unknown:1},
   component_usage:[
     {item_sn:'MAT-AT-FAILURE',item_type:'Camera',previous_pcbas:['OLD-PCBA'],
       known_use_count:2,reuse_count:1,is_reused:true,current_pcba_confirmed:true},
     {item_sn:'MAT-FIRST-USE',item_type:'Screen',previous_pcbas:[],
       known_use_count:1,reuse_count:0,is_reused:false,current_pcba_confirmed:true}
   ],
   reused_components:[
     {item_sn:'MAT-AT-FAILURE',item_type:'Camera',previous_pcbas:['OLD-PCBA'],
       relation_to_current_failure:'FALHA_DIFERENTE'},
     {item_sn:'UNRELATED-HISTORICAL',item_type:'Other',previous_pcbas:['OLDER']}
   ]
 };
 const model=snLiveSummaryEvidence(result).model;
 assert.deepEqual(model.materials.map(x=>x.item_sn),['MAT-AT-FAILURE','MAT-FIRST-USE']);
 assert.equal(model.materials[0].previous_pcbas[0],'OLD-PCBA');
 assert.equal(model.materials[1].reuse_count,0);
 assert.equal(model.material_selection.temporal_unknown,1);
});
test('no valid failure anchor must not reintroduce all previously linked components',()=>{
 const result=baseResult();
 result.trace_3074={
   status:'partial',
   material_selection:{status:'no_defect_anchor',scanned_components:0,
      historical_components_ignored:3,temporal_unknown:3},
   component_usage:[],
   reused_components:[]
 };
 const model=snLiveSummaryEvidence(result).model;
 assert.deepEqual(model.materials,[]);
 assert.equal(model.material_selection.status,'no_defect_anchor');
});

test('raw 2114 Manual/Automatic alias and 3012 Defect Time provenance survive the live SN model',()=>{
 const r=baseResult();
 r.trace_2114.current_failure={
  'Defect Code':'CAM','Defect Description':'Camera impurity',
  'TestTools Auto Defect Or Defect By Hand':'Manual',
  'Defect Time':'2026-10-19 10:30:00',
  'Defect Time Source':'3012'
 };
 const model=snLiveSummaryEvidence(r).model;
 assert.equal(model.current.manual_or_auto,'Manual');
 assert.equal(model.current.defect_time,'2026-10-19 10:30:00');
 assert.equal(model.current.defect_time_source,'3012');
});

test('SN compact summary has prior exact antenna fault, analysis type and observed 3022 without inventing production time',()=>{
 const result={sn:'PCB-X',trace_3022:{process_passages:[{pcba_sn:'PCB-X',station:'A6900',operation_name:'Export Repair',event_time:'2026-10-20 12:00',operator_id:'BRM00061',operator_name:'Técnico Teste'}]}};
 const model={current_pcba:'PCB-X',current:{defect_time:'2026-10-21 10:00'},own_history:[{pcba_sn:'PCB-X',hist_seq:0,defect_code:'GN01-TX01',defect_desc:'Antenna test failed',defect_time:'2026-10-20 10:00',defect_type:'Phone Disassembly',repairs:[{pcba_sn:'PCB-X',defect_code:'GN01-TX01',repair_user:'BRM00061',association:'exact_occurrence',repair_time:'2026-10-20 11:00',repair_comment:'Validated antenna connector'}]}],process:[{pcba_sn:'PCB-X',station:'A6900',operation_name:'Export Repair',event_time:'2026-10-20 12:00'}]};
 const html=renderSnCompactContext(model,result,'pt-BR');
 assert.match(html,/Antenna test failed/);assert.match(html,/Phone Disassembly/);
 assert.match(html,/Técnico Teste/);assert.match(html,/Validated antenna connector/);
 assert.match(html,/A6900/);assert.match(html,/Passagens não provam/);
});
test('single alert includes name from 3022 Tran User without presenting uncertain 3012 as a proven intervention',()=>{
 const failure={pcba_sn:'PCB-X',defect_code:'ANT-1',defect_desc:'Antenna',defect_type:'Phone Disassembly',repair_status:'Y',hist_seq:0};
 const current={...failure,hist_seq:1,defect_type:'MainBoard'};
 const candidate={pcba_sn:'PCB-X',defect_code:'ANT-1',repair_user:'BRM00061',repair_comment:'Check connector and antenna <no repair>',repair_time:'2026-10-21 09:15',association:'same_pcba_candidate'};
 const model={query_sn:'PCB-X',current_pcba:'PCB-X',operator_source_3022:{rows:[{'PCBA':'PCB-X','Tran User ID':'BRM00061','Tran User':'Técnico Teste'}]},alerts:[{kind:'PCBA_SAME_FAILURE',severity:'high',pcba_sn:'PCB-X',evidence:{failure,current_failure:current,candidates_3012:[candidate],order_basis:'hist_seq_only'}}]};
 const html=renderSnCorrelationAlerts(model,'pt-BR');
 assert.match(html,/Técnico Teste/);assert.match(html,/Check connector and antenna &lt;no repair&gt;/);
 assert.match(html,/Phone Disassembly/);assert.match(html,/MainBoard/);
 assert.match(html,/ocorrência não atribuída/);assert.doesNotMatch(html,/Check connector and antenna <no repair>/);
});
