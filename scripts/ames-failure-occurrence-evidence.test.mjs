import test from 'node:test';
import assert from 'node:assert/strict';
import {failureOccurrenceEvidence,renderFailureOccurrenceEvidence} from '../ames/console-failure-evidence.mjs';

const occurrence={
  pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-17T10:00:00-03:00',line_id:'TAN10101',product_model:'CPH2817',repair_status:'Y',repair_user:'BRM00075',repair_time:'2026-10-17T11:00:00-03:00',repair_code:'MB_REPAIR',repair_comment:'Comentário completo do AT',defect_reason_desc:'MainBoard repair',
};

function snapshot(){
  return {
    snapshot_id:'snap-1',collected_at:'2026-10-17T12:00:00-03:00',line_id:'TAN10101',occurrences:[occurrence],
    process_timeline:{contexts:[{
      pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-17T10:00:00-03:00',production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A5100',reference_operation_name:'OQC',reference_event_time:'2026-10-17T09:40:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-10-17',return_station_code:'A5400',return_operation_name:'RF TEST',return_event_time:'2026-10-17T11:30:00-03:00',
    }]},
    pcba_history:{records:[{pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-10T08:00:00-03:00'}]},
    material_trace:{records:[{current_pcba_sn:'PCB-A',item_sn:'LCM-1',item_type:'LCM',known_use_count:2,previous_pcbas:['PCB-OLD'],current_defect_key:null}]},
    insights:{drilldowns:{
      pcba_second_use:[{PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-17T10:00:00-03:00'}],
      pcba_3plus_use:[],
      pcba_same_failure:[{PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-17T10:00:00-03:00'}],
      pcba_same_family:[],
      material_analysis:[{ 'PCBA atual':'PCB-A','Material SN':'LCM-1','Tipo material':'LCM','Usos conhecidos material':2,'PCBAs desvinculadas':['PCB-OLD'],'PCBAs com mesma falha':1}],
      correlation_same_failure:[{'PCBA atual':'PCB-A','Material SN':'LCM-1','PCBA desvinculada':'PCB-OLD','Classificação desta PCBA':'MESMA_FALHA','Defect Code antigo':'F1','Defect Description antigo':'LCD LEAK','Defect Time antigo':'2026-10-09T10:00:00-03:00'}],
    }},
  };
}

test('failure occurrence is enriched from 3028 through available 2114/3074/3022/3012 evidence',()=>{
  const snap=snapshot();
  const evidence=failureOccurrenceEvidence(snap,occurrence);
  assert.equal(evidence.production.trusted,true);
  assert.equal(evidence.production.station,'A5100');
  assert.equal(evidence.history.available,true);
  assert.equal(evidence.history.rows.length,1);
  assert.ok(evidence.reuse.matches.length>=1);
  assert.ok(evidence.relations.matches.length>=1);
  assert.ok(evidence.materials.rows.length>=1);
  assert.equal(evidence.repair.present,true);
  const html=renderFailureOccurrenceEvidence(evidence,'pt-BR',{snapshot:snap,source:'local',freshness:'fresh'});
  assert.match(html,/3028/);
  assert.match(html,/2114 1/);
  assert.match(html,/PCBA 2º\+/);
  assert.match(html,/Item 2º\+/);
  assert.match(html,/Correlação/);
  assert.match(html,/3022 A5100/);
  assert.match(html,/3012/);
  assert.match(html,/Comentário completo do AT/);
  assert.match(html,/snap-1 · local/);
});

test('missing later source remains unknown and never erases the proven 3028 occurrence',()=>{
  const snap={snapshot_id:'snap-min',collected_at:'2026-10-17T12:00:00-03:00',occurrences:[occurrence],insights:{drilldowns:{}}};
  const evidence=failureOccurrenceEvidence(snap,{...occurrence,repair_user:null,repair_time:null,repair_code:null,repair_comment:null,defect_reason_desc:null});
  assert.equal(evidence.production.trusted,false);
  assert.equal(evidence.history.available,false);
  assert.equal(evidence.materials.available,false);
  assert.equal(evidence.repair.present,false);
  const html=renderFailureOccurrenceEvidence(evidence,'pt-BR',{snapshot:snap,source:'local',freshness:'partial'});
  assert.match(html,/3028/);
  assert.match(html,/Ver cadeia de evidências · parcial/);
  assert.match(html,/2114<\/small><b>—/);
  assert.match(html,/3074<\/small><b>—/);
  assert.match(html,/3022<\/small><b>—/);
  assert.match(html,/3012<\/small><b>—/);
  assert.match(html,/Fonte posterior ausente não apaga evidência já comprovada/);
  assert.doesNotMatch(html,/>0<\/b>/);
});

test('process context from another failure cannot enrich this occurrence',()=>{
  const snap=snapshot();
  snap.process_timeline.contexts=[{...snap.process_timeline.contexts[0],defect_code:'F2'}];
  const evidence=failureOccurrenceEvidence(snap,occurrence);
  assert.equal(evidence.production.trusted,false);
  const html=renderFailureOccurrenceEvidence(evidence,'pt-BR',{snapshot:snap,source:'local',freshness:'fresh'});
  assert.doesNotMatch(html,/3022 A5100/);
});

test('evidence chain is bilingual without rewriting MES identifiers',()=>{
  const snap=snapshot(),evidence=failureOccurrenceEvidence(snap,occurrence);
  const html=renderFailureOccurrenceEvidence(evidence,'en-US',{snapshot:snap,source:'local',freshness:'fresh'});
  assert.match(html,/View evidence chain/);
  assert.match(html,/Previous history/);
  assert.match(html,/Reused components/);
  assert.match(html,/Proven process/);
  assert.match(html,/A5100/);
  assert.match(html,/BRM00075/);
  assert.match(html,/F1/);
});
