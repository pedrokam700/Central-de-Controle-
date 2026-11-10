import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReuseCohorts,summarizeReusePopulation,boardHistSeqRecurrence,board2114Timeline} from '../ames/data/reuse-cohorts.mjs';
import {renderComponentComparisonTable,renderBoardComparisonTable,compact2114Analysis,compact3012CandidateCells,enrichReuseRepairTechnicians,matchCached3012Repairs} from '../ames/console-reuse-cohorts.mjs';
const event={pcba_sn:'P1',defect_code:'D1',defect_time:'2026-10-19 10:00:00',defect_key:'K1',record_id:'D1',product_key:'CPH1',failure_family:'DISPLAY'};
function fixture(){return {source_id:'A',snapshot_id:'S',revision:2,line_id:'TAN10101',occurrences:[event],
 pcba_history:{records:[{pcba_sn:'P1',defect_code:'D1',defect_time:'2026-10-17 08:00:00',failure_family:'DISPLAY',record_id:'H1'},
 {pcba_sn:'OLD',defect_code:'D1',defect_time:'2026-10-17 09:00:00',record_id:'H2'},
 {pcba_sn:'OLD',defect_code:'FUTURE',defect_time:'2026-10-20 09:00:00',record_id:'H3'}]},
 material_trace:{records:[{current_pcba_sn:'P1',item_sn:'M1',item_type:'generic',current_defect_key:'K1',part_number:'PN1',previous_pcbas_json:'["OLD"]',record_id:'M1'}]},
 insights:{drilldowns:{pcba_analysis:[{PCBA:'P1','Defect Code':'D1','Defect Time':event.defect_time,'Uso da PCBA na falha':'2º uso'}],
 material_analysis:[{'PCBA atual':'P1','Material SN':'M1','Tipo material':'generic','Defect Code atual':'D1','Defect Time atual':event.defect_time,'Uso material na falha':'3º uso'}]}}};}
test('main PCBA own use and physical component association are independent, auditable populations',()=>{
 const s=fixture(),copy=structuredClone(s),m=buildReuseCohorts(s);
 assert.equal(m.pcbas.counts.second_use,1);assert.equal(m.pcbas.counts.failed,1);assert.equal(m.pcbas.counts.same_failure,1);
 assert.equal(m.components.counts.third_plus_use,1);assert.equal(m.components.counts.associated,1);
 assert.equal(m.components.counts.failed,0);assert.equal(m.components.counts.unknown_outcome,1);
 assert.equal(m.components.rows[0].prior_events.length,1);assert.equal(m.components.rows[0].evidence[0].source_id,'A');
 assert.equal(m.components.rows[0].evidence[0].snapshot_revision,2);
 assert.equal(m.pcbas.failure_rate,null);assert.equal(m.components.failure_rate,null);
 assert.equal(m.pcbas.counts.verified_no_failure,null);assert.equal(m.components.counts.verified_no_failure,null);
 assert.deepEqual(s,copy);
});
test('kit duplicates deduplicate by physical SN and type, never by part number',()=>{
 const s=fixture();s.material_trace.records.push({...s.material_trace.records[0],record_id:'duplicate'},
 {...s.material_trace.records[0],item_sn:'M2',record_id:'M2'}, {...s.material_trace.records[0],item_type:'other',record_id:'other'});
 const m=buildReuseCohorts(s);assert.equal(m.components.counts.observed,3);assert.equal(m.components.rows.find(r=>r.sn==='M1'&&r.item_type==='generic').evidence.length,3);
 assert.equal(buildReuseCohorts(s,{part_number:'PN1'}).components.counts.observed,3);
 assert.equal(buildReuseCohorts(s,{item_type:'generic',sn:'M2'}).components.counts.observed,1);
});
test('unknown use is not first use; own reuse never inferred from reused parts or history counts',()=>{
 const s=fixture();s.insights.drilldowns.pcba_analysis=[{PCBA:'P1','Usos conhecidos da PCBA':0,'Falhas anteriores 2114':8}];
 const m=buildReuseCohorts(s);assert.equal(m.pcbas.counts.unknown_use,1);assert.equal(m.pcbas.counts.first_use,0);assert.equal(m.pcbas.counts.reused,0);
});
test('SN alone, ambiguous defect keys, future bindings and wrong lines cannot prove an association',()=>{
 const s=fixture();s.insights=null;s.material_trace.records[0].bind_time_utc='2026-10-20T12:00:00Z';
 assert.equal(buildReuseCohorts(s).components.rows[0].events.length,0);
 delete s.material_trace.records[0].bind_time_utc;delete s.material_trace.records[0].current_defect_key;
 assert.equal(buildReuseCohorts(s).components.rows[0].events.length,0);
 s.material_trace.records[0].current_defect_key='K1';s.occurrences.push({...event,defect_time:'2026-10-19 11:00:00'});
 assert.equal(buildReuseCohorts(s).components.rows[0].events.length,0);
 s.material_trace.records[0].line='TAN10102';assert.equal(buildReuseCohorts(s).components.counts.observed,0);
});
test('different use indices remain explicit conflicts, not artificially chosen latest or maximum',()=>{
 const s=fixture();s.insights.drilldowns.pcba_analysis.push({...s.insights.drilldowns.pcba_analysis[0],'Uso da PCBA na falha':'3º uso'});
 assert.equal(buildReuseCohorts(s).pcbas.rows[0].use_conflict,true);assert.equal(buildReuseCohorts(s).pcbas.counts.unknown_use,1);
});
test('rates require complete population identities AND all independently evidenced outcomes',()=>{
 const rows=[{id:'A',reused:true,use_index:2,outcome:'failed',outcome_evidence_id:'f1',prior_events:[]},
 {id:'B',reused:true,use_index:2,outcome:'verified_no_failure',outcome_evidence_id:'q2',prior_events:[]}];
 const proof={population_complete:true,evidence_id:'whole-cohort',item_ids:['A','B']};
 assert.equal(summarizeReusePopulation(rows).failure_rate,null);
 assert.equal(summarizeReusePopulation(rows).counts.verified_no_failure,null);
 assert.equal(summarizeReusePopulation(rows,{...proof,item_ids:['A']}).failure_rate,null);
 assert.equal(summarizeReusePopulation(rows,{...proof,item_ids:['A','A']}).failure_rate,null);
 assert.equal(summarizeReusePopulation(rows,proof).failure_rate,.5);
 assert.equal(summarizeReusePopulation(rows,proof).counts.verified_no_failure,1);
 assert.equal(summarizeReusePopulation([{...rows[0],outcome:'failed'}, {...rows[1],outcome:'failed'}],proof).counts.verified_no_failure,0,'zero is valid only for a proven full cohort');
 assert.equal(summarizeReusePopulation([{...rows[0],outcome_evidence_id:null},rows[1]],proof).failure_rate,null);
 assert.equal(summarizeReusePopulation([], {...proof,item_ids:[]}).failure_rate,null);
});
test('complete transport or complete source does not assert population completeness',()=>{
 const s=fixture();s.coverage={defects:{source_complete:true,transport_complete:true}};s.population_complete=true;
 assert.equal(buildReuseCohorts(s).pcbas.population_coverage,'unproven');
});

test('summary cannot bypass a future canonical binding; missing type resolves only when unique',()=>{
 const s=fixture();s.material_trace.records[0].bind_time_utc='2026-10-20T12:00:00Z';
 assert.equal(buildReuseCohorts(s).components.rows[0].events.length,0);
 delete s.material_trace.records[0].bind_time_utc;delete s.material_trace.records[0].item_type;
 assert.equal(buildReuseCohorts(s).components.counts.observed,1);
});

test('physical case 002527005C0535F300007060: same 2114 defect Hist Seq 0 and 1 prove board recurrence without defect time',()=>{
 const pcba='002527005C0535F300007060',code='GN01-TX02',desc='Antenna: ANT1 test failed';
 const s={source_id:'FACTORY',snapshot_id:'TEST',revision:4,line_id:'TAN10103',
  occurrences:[{pcba_sn:pcba,defect_key:'D1',defect_code:code,defect_desc:desc,defect_time:'2026-10-28T13:00:00-03:00',product_key:'CPH2819BR'}],
  pcba_history:{records:[
    {pcba_sn:pcba,hist_seq:0,defect_code:code,defect_desc:desc,defect_type:'MainBoard'},
    {pcba_sn:pcba,hist_seq:1,defect_code:code,defect_desc:desc,defect_type:'MainBoard'},
    {pcba_sn:'OTHER',hist_seq:0,defect_code:code,defect_desc:desc}
  ]},material_trace:{records:[]},
  insights:{drilldowns:{pcba_analysis:[{PCBA:pcba,'Defect Code':code,
     'Defect Time':'2026-10-28T13:00:00-03:00','Uso da PCBA na falha':'2º uso'}]}}};
 const m=buildReuseCohorts(s);
 assert.equal(m.pcbas.counts.second_use,1);
 assert.equal(m.pcbas.counts.same_failure,1,'same failure must not disappear merely because 2114 lacks Defect Time');
 assert.equal(m.pcbas.metrics.same_failure[0].prior_events[0].history_order_basis,'HIST_SEQ_ONLY');
 assert.equal(m.pcbas.metrics.same_failure[0].prior_events[0].defect_time,undefined);
 const changed=structuredClone(s);changed.pcba_history.records[1].defect_code='OTHER-FAIL';
 assert.equal(boardHistSeqRecurrence(s.occurrences[0],changed.pcba_history.records).length,0);
 const one=structuredClone(s);one.pcba_history.records=one.pcba_history.records.filter(r=>r.hist_seq!==1||r.pcba_sn==='OTHER');
 assert.equal(buildReuseCohorts(one).pcbas.counts.same_failure,0);
});

test('physical 086822: four 2114 entries and repeated WIFI remain visible without inventing assembly uses',()=>{
 const id='00252700662035F300086822';
 const s={source_id:'FACTORY',snapshot_id:'captured',line_id:'TAN10103',
  occurrences:[{pcba_sn:id,defect_code:'GN11-WX02',defect_desc:'Wireless connection: GPS/WIFI failed',
   defect_time:'2026-10-30 08:00:00',defect_key:'D1'}],
  pcba_history:{records:[
   {pcba_sn:id,hist_seq:0,defect_code:'GN01-IR02',defect_desc:'Sensor: Infrared sensor test failed',defect_type:'MainBoard',repair_status:'Y'},
   {pcba_sn:id,hist_seq:1,defect_code:'GN11-WX02',defect_desc:'Wireless connection: GPS/WIFI failed',defect_type:'Phone Disassembly',repair_status:'Y'},
   {pcba_sn:id,hist_seq:2,defect_code:'GN11-WX02',defect_desc:'Wireless connection: GPS/WIFI failed',defect_type:'MainBoard',repair_status:'Y'},
   {pcba_sn:id,hist_seq:3,defect_code:'GN11-WX02',defect_desc:'Wireless connection: GPS/WIFI failed',defect_type:'MainBoard',repair_status:'N'},
   ]},
  insights:{drilldowns:{pcba_analysis:[]}},material_trace:{records:[]}};
 const actual=buildReuseCohorts(s);
 const board=actual.pcbas.rows[0];
 assert.equal(actual.pcbas.counts.unknown_use,1,'failure count alone does not prove a second mounting');
 assert.deepEqual(board.history_2114.map(h=>h.hist_seq),[0,1,2,3]);
 assert.equal(board.history_2114_repeats,2);
 assert.equal(board.history_2114[1].defect_type,'Phone Disassembly');
 assert.equal(board.history_2114[2].defect_type,'MainBoard');
 assert.equal(board.history_2114[3].repair_status,'N');
 assert.equal(actual.pcbas.counts.same_failure,1,'current failure matches latest 2114 and earlier WIFI');
 const mismatch=structuredClone(s);
 mismatch.occurrences[0].defect_code='OTHER',mismatch.occurrences[0].defect_desc='Another failure';
 const other=buildReuseCohorts(mismatch);
 assert.equal(other.pcbas.counts.same_failure,0,'do not reclassify unrelated current 3028 defect');
 assert.equal(other.pcbas.rows[0].history_2114_repeats,2,'full intrinsic 2114 repetition remains inspectable');
});
test('duplicate same Hist Seq and missing sequence do not fabricate recurrence order',()=>{
 const id='PCB';
 const timeline=board2114Timeline(id,[
  {pcba_sn:id,hist_seq:0,defect_code:'WIFI',defect_desc:'Wireless connection: GPS/WIFI failed'},
  {pcba_sn:id,hist_seq:0,defect_code:'WIFI',defect_desc:'Wireless connection: GPS/WIFI failed'},
  {pcba_sn:id,defect_code:'WIFI',defect_desc:'Wireless connection: GPS/WIFI failed'},
 ]);
 assert.equal(timeline.length,2);
 assert.equal(timeline[0].hist_seq,0);
 assert.equal(timeline[0].repeat_exact_prior_count,0);
 assert.equal(timeline[1].history_order_proven,false);
 assert.equal(timeline[1].repeat_exact_prior_count,0);
});

test('component comparison replaces duplicate timestamp with genuine 2114 analysis, retaining time in source drilldown',()=>{
 const oldDocument=globalThis.document;
 globalThis.document={documentElement:{lang:'pt-BR'}};
 try{
  const obs=[
   {pcba_sn:'PCB-A',source_view:'2114',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',defect_type:'MainBoard',defect_time:'2026-10-22 08:07:30',hist_seq:1},
   {pcba_sn:'PCB-A',source_view:'2114',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',defect_type:'Phone Disassembly',defect_time:'2026-10-23 09:07:30',hist_seq:2},
   {pcba_sn:'PCB-A',source_view:'3028',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',defect_type:'Not a 2114 analysis',defect_time:'2026-11-09 10:00:38'},
  ];
  const groups=[{pcba_sn:'PCB-A',role:'investigated',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',recurrence_pcba_count:3,observations:obs}];
  const html=renderComponentComparisonTable(groups);
  assert.match(html,/Análise 2114/);
  assert.doesNotMatch(html,/Horário 2114 \/ 3028/);
  assert.match(html,/<td><span class="ames-reuse-time-line">MainBoard<\/span><span class="ames-reuse-time-line">Phone Disassembly<\/span><\/td>/);
  assert.match(html,/22\/10\/2026 08:07:30/);
  assert.match(html,/09\/11\/2026 10:00:38/);
  assert.ok(!compact2114Analysis([obs[2]]).includes('Not a 2114 analysis'));
  assert.match(compact2114Analysis([{source_view:'2114',defect_type:'<img src=x onerror=alert(1)>'}]),/&lt;img/);
 }finally{globalThis.document=oldDocument;}
});

test('reuse shows the real 3022 technician name only, keeping BRM ID in provenance',()=>{
 const oldDocument=globalThis.document;
 globalThis.document={documentElement:{lang:'pt-BR'}};
 try{
  const repairs=[{pcba_sn:'PCB-A',repair_user:'BRM00999',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception',defect_time:'2026-11-09 10:00:38',repair_time:'2026-11-09 11:00:38'}];
  const events=[{pcba_sn:'PCB-A',provenance:{adapter:{operator_evidence:{station:'A6900',event_time:'2026-11-09 10:35:38',operator_id:'BRM00123',operator_name:'TECNICA MES EXEMPLO'}}}}];
  const named=enrichReuseRepairTechnicians(repairs,events);
  assert.equal(named[0].a6900_technician_name,'TECNICA MES EXEMPLO');
  assert.equal(named[0].a6900_technician_id,'BRM00123','A6900 actor can differ from 3012 Repair User');
  const cell=compact3012CandidateCells(named).technician;
  assert.match(cell,/>TECNICA MES EXEMPLO<\/span>/);
  assert.doesNotMatch(cell,/>BRM00999<\/span>/);
  assert.match(cell,/title="TECNICA MES EXEMPLO · 3022 A6900: BRM00123"/);
  assert.equal(repairs[0].repair_technician_name,undefined,'original 3012 source remains immutable');
  assert.equal(enrichReuseRepairTechnicians(repairs,[{...events[0],pcba_sn:'PCB-B'}])[0].a6900_technician_name,null,'identity from another board cannot prove that the old board was handled by this operator');
  assert.equal(enrichReuseRepairTechnicians(repairs,[{provenance:{adapter:{operator_evidence:{station:'A6900',operator_id:'BRM00123',operator_name:'UNSCOPED'}}}}])[0].a6900_technician_name,null);
  assert.equal(enrichReuseRepairTechnicians(repairs,[events[0],{pcba_sn:'PCB-A',provenance:{adapter:{operator_evidence:{station:'A6900',event_time:'2026-11-09 10:42:38',operator_id:'BRM00124',operator_name:'OTHER PERSON'}}}}])[0].a6900_technician_name,null,'two people during one interval must remain ambiguous');
  assert.equal(enrichReuseRepairTechnicians(repairs,[events[0],{pcba_sn:'PCB-B',provenance:{adapter:{operator_evidence:{station:'A6900',event_time:'2026-11-09 10:42:38',operator_id:'BRM00124',operator_name:'OTHER PERSON'}}}}])[0].a6900_technician_name,'TECNICA MES EXEMPLO','other board does not change this evidence');
  const unnamed=compact3012CandidateCells(enrichReuseRepairTechnicians(repairs,[])).technician;
  assert.match(unnamed,/Técnico da falha não comprovado na estação A6900/);
  assert.doesNotMatch(unnamed,/>BRM00999<\/span>/);
  assert.equal(enrichReuseRepairTechnicians(repairs,[{pcba_sn:'PCB-A',raw:{'Working Oper Code':'A6900','Tran Time':'2026-11-09 10:45:38','Tran User Id':'BRM00123','Tran User':'TECNICA MES EXEMPLO'}}])[0].a6900_technician_name,'TECNICA MES EXEMPLO','old SQLite raw 3022 A6900 event is sufficient without MES recapture');
  assert.equal(enrichReuseRepairTechnicians(repairs,[{pcba_sn:'PCB-A',raw:{'Working Oper Code':'A6900','Tran Time':'2026-11-09 10:45:38','Tran User Id':'BRM00123','Other comment':'TECNICA MES EXEMPLO'}}])[0].a6900_technician_name,null,'names must come from an explicit name field');
  const matching=matchCached3012Repairs([{pcba_sn:'PCB-A',defect_code:'GN14-KZ01',defect_desc:'SIM card recognition exception'}],repairs);
  assert.equal(matching.length,1,'3012 exact candidate still resolves without altered matching contract');
 }finally{globalThis.document=oldDocument;}
});
test('the separate PCBA comparison also removes duplicate 3028/2114 time and keeps 2114 analysis',()=>{
 const prior=globalThis.document;globalThis.document={documentElement:{lang:'pt-BR'}};
 try{
  const html=renderBoardComparisonTable({sn:'PCB-A',events:[{pcba_sn:'PCB-A',defect_code:'GN-1',defect_time:'2026-11-09 08:00:00'}],prior_events:[{pcba_sn:'PCB-A',defect_code:'GN-1',defect_type:'MainBoard',defect_time:'2026-11-01 08:00:00'}]});
  assert.doesNotMatch(html,/Horário 3028 \/ 2114/);
  assert.match(html,/Análise 2114/);
  assert.match(html,/>MainBoard<\/span>/);
 }finally{globalThis.document=prior;}
});
