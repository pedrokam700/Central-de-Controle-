import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSnForensics,lastRecordedMaterialReference} from '../ames/data/sn-forensics.mjs';
import {operatorSummary} from '../ames/console-fastlane-sn-reuse.mjs';
import {buildSmartSnAlerts} from '../ames/console-sn-smart-alerts.mjs';

globalThis.document={documentElement:{lang:'pt-BR'}};

const BOARD='00252800680135A300157280';
const MATERIAL='C*611002000241G3J018357B100000000';
function fixture(){
  const oldFailure={defect_code:'GN14-KZ01',defect_desc:'SIM card: SIM card recognition exception',defect_time:'2026-10-22 08:07:30',hist_seq:1,relation_to_board_reference:'MESMA_FALHA'};
  return {sn:BOARD,detected_type:'PCBA',line:'TAN10102',product_model:'CPH2891BR',
    trace_2114:{status:'complete',current_failure:{'Defect Hist Seq':'1','Defect Code':'GN14-KZ01','Defect Description':'SIM card: SIM card recognition exception','Defect Time':'2026-11-09 10:00:38'},previous_failures:[]},
    trace_3074:{status:'complete',material_selection:{status:'indeterminate',cycle_state:'indeterminate'},
      query:{rows:[{'Barcode':BOARD,'Sn Type':'PCBA','Batch Id':'LAST-BATCH','Iss Status':'N'},
        {'Barcode':MATERIAL,'Sn Type':'Screen','Batch Id':'LAST-BATCH','Iss Status':'N','Bind Time':'2026-11-09T10:00:00Z','Unbind Time':'2026-11-09T15:00:00Z'}]},
      components:[],component_usage:[],reused_components:[],mounting_views:{
        current:{status:'not_proven',components:[]},last_failure:{status:'no_2114_anchor',components:[]},
        last_recorded:{status:'historical_batch_observed',batch_id:'LAST-BATCH',basis:'3074_pcba_self_batch_and_material_bind',pcba_last_bind_utc:'2026-11-09T10:00:00Z',
          components:[{item_sn:MATERIAL,item_type:'Screen',iss_status_now:'N',bind_time_utc:'2026-11-09T10:00:00Z',unbind_time_utc:'2026-11-09T15:00:00Z'}],
          component_usage:[{item_sn:MATERIAL,is_reused:true,current_pcba_link_proven:true,known_use_count_min:4,
            other_pcbas:['OLD-1','OLD-2','OLD-3'],previous_pcba_failures_2114:[
              {pcba_sn:'OLD-1',status:'COMPLETE',failures:[oldFailure]},
              {pcba_sn:'OLD-2',status:'COMPLETE',failures:[oldFailure]},
            ]}]}}},
    trace_3022:{rows:[],process_passages:[],operator_evidence:[]},trace_3012:{rows:[]}};
}

test('N-only latest proven board batch is shown in SN reuse KPIs and same-fault alert',()=>{
  const result=fixture();
  const selected=lastRecordedMaterialReference(result);
  assert.equal(selected.scope,'last_recorded_3074');
  assert.equal(selected.materials[0].known_use_count,4);
  const model=buildLiveSnForensics(result);
  assert.equal(model.material_reference_scope,'last_recorded_3074');
  assert.equal(model.materials.length,1);
  assert.equal(model.materials[0].previous_pcbas.length,3);
  assert.equal(model.materials[0].history.filter(h=>h.relation==='MESMA_FALHA').length,2);
  const html=operatorSummary(result,[]);
  assert.match(html,/Materiais 2º\+ uso<\/small><b>1<\/b>/);
  assert.match(html,/PCBAs anteriores<\/small><b>3<\/b>/);
  assert.match(html,/Material · mesma falha<\/small><b>1<\/b>/);
  assert(buildSmartSnAlerts(model,result).some(a=>a.id==='component-historical-same-failure'));
});

test('new Y mounting overrides the previous N links without mixing its reuse counters',()=>{
  const result=fixture();
  result.trace_3074.material_selection={status:'current_mounting_new_cycle',cycle_state:'current_new_cycle'};
  result.trace_3074.component_usage=[{item_sn:'NEW-LCD',item_type:'Screen',is_reused:false,
    current_pcba_confirmed:true,known_use_count:1,reuse_count:0,previous_pcbas:[]}];
  result.trace_3074.components=[{item_sn:'NEW-LCD'}];
  assert.equal(lastRecordedMaterialReference(result),null);
  const model=buildLiveSnForensics(result);
  assert.equal(model.material_reference_scope,'selected_mounting');
  assert.equal(model.materials.some(item=>item.item_sn===MATERIAL),false);
  assert.equal(model.alerts.some(item=>item.item_sn===MATERIAL),false);
});

test('ambiguous new Y cannot be silently replaced by the old N-link reference',()=>{
  const result=fixture();
  result.trace_3074.material_selection.basis='ambiguous_current_y';
  result.trace_3074.candidate_components=[{item_sn:'UNCERTAIN-NEW',iss_status_now:'Y'}];
  assert.equal(lastRecordedMaterialReference(result),null);
  assert.equal(buildLiveSnForensics(result).material_reference_scope,'selected_mounting');
});

test('unanchored historical batch or unproven material query cannot invent second use',()=>{
  const result=fixture();
  result.trace_3074.mounting_views.last_recorded.status='unverified';
  assert.equal(lastRecordedMaterialReference(result),null);
  result.trace_3074.mounting_views.last_recorded.status='historical_batch_observed';
  result.trace_3074.mounting_views.last_recorded.component_usage[0].source_partial=true;
  assert.equal(lastRecordedMaterialReference(result).materials.length,0);
  assert.equal(buildLiveSnForensics(result).materials.length,0);
});

test('3074 component-only grid still permits a proven last individual link, not a full assembly',()=>{
  const result=fixture();
  result.trace_3074.mounting_views.last_recorded={status:'unverified',components:[]};
  result.trace_3074.mounting_views.last_individual_links={
    ...result.trace_3074.mounting_views.last_recorded,
    status:'last_individual_links_observed',basis:'3074_component_batch_only',
    components:[{item_sn:MATERIAL,item_type:'Screen',iss_status_now:'N'}],
    component_usage:[{item_sn:MATERIAL,is_reused:true,current_pcba_link_proven:true,
      known_use_count_min:4,other_pcbas:['OLD-1','OLD-2','OLD-3'],
      previous_pcba_failures_2114:[{pcba_sn:'OLD-1',failures:[{
        defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',
        defect_time:'2026-10-22 08:07:30',relation_to_board_reference:'MESMA_FALHA',
      }]}]}],
  };
  const model=buildLiveSnForensics(result);
  assert.equal(model.last_recorded_reference.evidence_basis,'3074_component_batch_only');
  assert.equal(model.materials[0].known_use_count,4);
  assert.equal(model.materials[0].history[0].relation,'MESMA_FALHA');
});
