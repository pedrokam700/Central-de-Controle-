import test from 'node:test';
import assert from 'node:assert/strict';
import {failureOccurrenceEvidence,renderFailureOccurrenceEvidence} from '../ames/console-failure-evidence.mjs';
import {parseFailureInstant} from '../ames/data/production-evidence.mjs';
import fs from 'node:fs';

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

test('undated, future or other-PCBA 2114 evidence is not labelled an earlier failure',()=>{
  const snap=snapshot();
  snap.pcba_history.records=[
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-09T08:00:00-03:00'},
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:null},
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'garbled'},
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-20T08:00:00-03:00'},
    {pcba_sn:'PCB-OTHER',defect_code:'F1',defect_time:'2026-10-09T08:00:00-03:00'},
  ];
  const evidence=failureOccurrenceEvidence(snap,occurrence);
  assert.equal(evidence.history.rows.length,1,'only proven prior event for this PCBA qualifies');
  assert.equal(evidence.history.rows[0].defect_time,'2026-10-09T08:00:00-03:00');
  const missingFailureTime=failureOccurrenceEvidence(snap,{...occurrence,defect_time:null});
  assert.equal(missingFailureTime.history.available,false);
  assert.equal(missingFailureTime.history.rows.length,0);
});

test('correlation badges need exact PCBA+defect code+failure time but board reuse is PCBA-level',()=>{
  const snap=snapshot();
  snap.insights.drilldowns.pcba_same_failure=[
    { 'Defect Code atual':'F1','Defect Time atual':occurrence.defect_time },
    { PCBA:'PCB-OTHER','Defect Code atual':'F1','Defect Time atual':occurrence.defect_time },
    { PCBA:'PCB-A','Defect Code atual':'F1' },
    { PCBA:'PCB-A','Defect Time atual':occurrence.defect_time },
    { PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-16T10:00:00-03:00' },
    { PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':occurrence.defect_time },
  ];
  snap.insights.drilldowns.pcba_second_use=[{PCBA:'PCB-A'}];
  const evidence=failureOccurrenceEvidence(snap,occurrence);
  assert.equal(evidence.relations.matches.length,1,'do not correlate partial identity with wrong occurrence');
  assert.equal(evidence.reuse.matches.length,1,'board-level reuse remains valid');
  const html=renderFailureOccurrenceEvidence(evidence,'pt-BR',{snapshot:snap,source:'local'});
  assert.match(html,/PCBA 2º\+/);
  assert.match(html,/Correlação/);
});

test('partial-only correlation identities never promote a badge across occurrences',()=>{
  const snap=snapshot();
  snap.insights.drilldowns.pcba_same_failure=[{PCBA:'PCB-A','Defect Code atual':'F1'}];
  snap.insights.drilldowns.pcba_second_use=[];
  const evidence=failureOccurrenceEvidence(snap,occurrence);
  assert.equal(evidence.relations.matches.length,0,'the PCBA-level occurrence correlation must fail closed');
  assert.equal(evidence.reuse.matches.length,0);
  const validMaterial=renderFailureOccurrenceEvidence(evidence,'pt-BR',{snapshot:snap,source:'local'});
  assert.match(validMaterial,/<span class="status warn">Correlação<\/span>/,'independently proven component correlation must be preserved');
  // Isolate occurrence drilldowns from unrelated, valid material evidence.
  snap.material_trace.records=[];
  snap.insights.drilldowns.material_analysis=[];
  snap.insights.drilldowns.correlation_same_failure=[];
  const isolated=failureOccurrenceEvidence(snap,occurrence);
  const html=renderFailureOccurrenceEvidence(isolated,'pt-BR',{snapshot:snap,source:'local'});
  assert.equal(isolated.relations.matches.length,0);
  assert.doesNotMatch(html,/<span class="status warn">Correlação<\/span>/);
});

test('factory-local 2114 timestamps compare to explicit UTC timestamps without shifting a failure into the past',()=>{
  const snap=snapshot();
  const at={...occurrence,defect_time:'2026-10-17T13:00:00Z'};
  snap.pcba_history.records=[
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-17 09:50:00'}, // 12:50Z: earlier
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-17 10:10:00'}, // 13:10Z: later
    {pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-17'},          // date only: unknown
  ];
  const evidence=failureOccurrenceEvidence(snap,at);
  assert.equal(evidence.history.rows.length,1,'factory-local 10:10 is NOT before 13:00Z');
  assert.equal(evidence.history.rows[0].defect_time,'2026-10-17 09:50:00');
  assert.equal(parseFailureInstant('2026-10-17 10:00:00'),parseFailureInstant('2026-10-17T13:00:00Z'));
  assert.equal(parseFailureInstant('2026-10-17'),null,'date only cannot prove order');
});

test('exact occurrence drilldown accepts identical UTC and factory wall time, rejects unknown times',()=>{
  const snap=snapshot(),list=snap.insights.drilldowns;
  list.pcba_same_failure=[
    {PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-17T13:00:00Z'},
    {PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-17'},
  ];
  const found=failureOccurrenceEvidence(snap,{...occurrence,defect_time:'2026-10-17 10:00:00'});
  assert.equal(found.relations.matches.length,1,'UTC and naive factory time refer to the same instant');
  const unknown=failureOccurrenceEvidence(snap,{...occurrence,defect_time:'2026-10-17'});
  assert.equal(unknown.relations.matches.length,0);
});

test('rendered row mapping requires all three event identity fields and a unique occurrence',()=>{
  const source=fs.readFileSync(new URL('../ames/console-failure-evidence.mjs',import.meta.url),'utf8');
  assert.match(source,/const candidates=rows\.filter\(row=>same\(row\.pcba_sn,pcba\)&&same\(row\.defect_code,code\)&&sameInstant\(row\.defect_time,at\)\)/);
  assert.match(source,/const occurrence=candidates\.length===1\?candidates\[0\]:null/);
  assert.doesNotMatch(source,/Date\.parse\(text\(row\.defect_time\)\)/);
});
