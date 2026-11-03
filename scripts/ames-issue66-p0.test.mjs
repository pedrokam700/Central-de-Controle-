import test from 'node:test';
import assert from 'node:assert/strict';
import {exactTraceTargets,traceTargetForLine} from '../ames/data/trace-targets.mjs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';

const L1='TAN10101',L2='TAN10102',L3='TAN10103';
const period={mode:'previous_day',start_at:'2026-10-22T07:00:00-03:00',end_at:'2026-10-23T07:00:00-03:00'};
function historicalStore(){
  const revisions=new Map([[L3,{source:'local',snapshot:{canonical:{source_id:'factory-A',snapshot_id:14,
    snapshot_revision:1,content_hash:'f'.repeat(64),summary:{period}}}}]]);
  return {read:line=>revisions.get(line)||{source:'none',snapshot:null},
    agent:()=>({capabilities:{source_id:'factory-A',exact_trace_targets:true}}),revisions};
}

test('last production day L3 snapshot 14 is independent of absent L1/L2',()=>{
  const store=historicalStore();
  assert.equal(traceTargetForLine(store,L1).available,false);
  assert.equal(traceTargetForLine(store,L3).available,true);
  assert.deepEqual(exactTraceTargets(store,[L3]),{[L3]:{
    source_id:'factory-A',snapshot_id:14,snapshot_revision:1,content_hash:'f'.repeat(64),period}});
  assert.throws(()=>exactTraceTargets(store,[L1,L3]),/TAN10101: Sem revisão 3028/);
  assert.throws(()=>exactTraceTargets(store,[L3,L3]),/distintas/);
});

test('historical trace admission refuses remote origin and incomplete identity',()=>{
  const store=historicalStore(),read=store.revisions.get(L3);
  read.source='remote';assert.equal(traceTargetForLine(store,L3).available,false);
  read.source='local';read.snapshot.canonical.source_id='factory-B';
  assert.equal(traceTargetForLine(store,L3).available,false);
  read.snapshot.canonical.source_id='factory-A';read.snapshot.canonical.snapshot_revision=null;
  assert.equal(traceTargetForLine(store,L3).available,false);
});

const base={sn:'PCBA-DEMO',detected_type:'PCBA',trace_2114:{status:'complete',current_failure:{
  'Defect Code':'CAM','Defect Time':'2026-10-22 10:30:00'},previous_failures:[]}};
test('3074 successful grid with zero classified materials is collected, not missing',()=>{
  const query={rows:[{'Barcode':'CAMERA-1','Sn Type':'Rear Camera'}],no_data:false};
  const trace_3074={query,reused_components:[],component_usage:[],material_selection:{
    status:'selected_at_latest_2114_candidate',temporal_unknown:0}};
  const model=buildLiveSnForensics({...base,trace_3074});
  assert.equal(model.source_states['3074'],'ok');
  assert.equal(model.materials.length,0);
  const unknown=buildLiveSnForensics({...base,trace_3074:{...trace_3074,
    material_selection:{...trace_3074.material_selection,temporal_unknown:1}}});
  assert.equal(unknown.source_states['3074'],'partial');
});

test('3074 confirmed empty, absent, and errored remain distinct',()=>{
  const zero=buildLiveSnForensics({...base,trace_3074:{status:'complete',query:{rows:[],no_data:true},
    reused_components:[]}});
  assert.equal(zero.source_states['3074'],'zero');
  assert.equal(buildLiveSnForensics(base).source_states['3074'],'not_collected');
  const broken=buildLiveSnForensics({...base,trace_3074:{status:'error',error:'timeout',
    reused_components:[]}});
  assert.equal(broken.source_states['3074'],'error');
});

test('new cycle model investigates current items and keeps candidates separate',()=>{
  const trace_3074={status:'complete',query:{rows:[{Barcode:'NOW',"Sn Type":'Camera'}]},
    material_selection:{status:'current_mounting_new_cycle',cycle_state:'current_new_cycle',temporal_unknown:1},
    component_usage:[{item_sn:'NOW',item_type:'Rear Camera',known_use_count:2,reuse_count:1,
      previous_pcbas:['PREVIOUS'],current_pcba_confirmed:true}],
    candidate_components:[{item_sn:'MAYBE',item_type:'Screen',temporal_reason:'missing_bind_time'}],
    reused_components:[{item_sn:'NOW',item_type:'Rear Camera',known_use_count:2,
      reuse_count:1,previous_pcbas:['PREVIOUS'],relation_to_current_failure:'SEM_FALHA_ATUAL'}]};
  const model=buildLiveSnForensics({...base,trace_3074});
  assert.deepEqual(model.materials.map(m=>m.item_sn),['NOW']);
  assert.equal(model.candidate_materials[0].item_sn,'MAYBE');
  assert.equal(model.source_states['3074'],'partial');
});
