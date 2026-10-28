import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyFailureRows,filterDailyFailureRows,productionMetrics,rankDailyFailures,dailyFailureHourCoverage,createDailyFailureAnalytics} from '../ames/daily-failure-analytics.mjs';
import {aggregatePcbas,componentGroup,reuseKpis,reuseLinks} from '../ames/data/reuse-analysis.mjs';
import {pcbaReuseCategoryMap} from '../ames/reuse-table-view.mjs';
import {reuseGroup,reuseCriteriaEvidence} from '../ames/data/daily-reuse-evidence.mjs';

test('ranking counts occurrences but deduplicates affected PCBAs',()=>{
  const rows=[
    {pcba:'P1',defect_code:'D1',defect_desc:'Camera scratched',line:'TAN10101',production_shift:'1st Shift',reuse_with_failure:true,component_history_links:[{material:'M1'}]},
    {pcba:'P1',defect_code:'D1',defect_desc:'Camera scratched',line:'TAN10101',production_shift:'1st Shift',reuse_with_failure:true,component_history_links:[{material:'M2'}]},
    {pcba:'P2',defect_code:'D2',defect_desc:'LCD stain',line:'TAN10102',production_shift:'2nd Shift',reuse_with_failure:false,component_history_links:[]},
  ];
  const ranking=rankDailyFailures(rows);
  assert.equal(ranking[0].count,2);
  assert.equal(ranking[0].pcbas,1);
  assert.equal(ranking[0].reusePcbas,1);
  assert.equal(ranking[0].componentHistory,2);
  assert.equal(Math.round(ranking.at(-1).cumulative),100);
});

test('daily filters preserve shift and association semantics without inferring cause',()=>{
  const rows=[
    {pcba:'P1',line:'TAN10101',production_evidence_proven:true,production_shift:'1st Shift',product:'CPH2817',defect_code:'D1',defect_desc:'Camera scratched',repair_user:'U1',component_families:['Camera'],relations:['MESMA FALHA'],reuse_present:true,reuse_with_failure:true,pcba_prior_failure:false,component_history_count:1,production_operational_date:'2026-10-13'},
    {pcba:'P2',line:'TAN10101',production_evidence_proven:true,production_shift:'2nd Shift',product:'CPH2817',defect_code:'D2',defect_desc:'LCD stain',repair_user:'U2',component_families:['Screen / LCD'],relations:['OUTRA FALHA'],reuse_present:false,reuse_with_failure:false,pcba_prior_failure:false,component_history_count:0,production_operational_date:'2026-10-13'},
  ];
  assert.deepEqual(filterDailyFailureRows(rows,{shift:'1st Shift'}).map(r=>r.pcba),['P1']);
  assert.deepEqual(filterDailyFailureRows(rows,{reuse:'with_failure'}).map(r=>r.pcba),['P1']);
  assert.deepEqual(filterDailyFailureRows(rows,{relation:'MESMA FALHA'}).map(r=>r.pcba),['P1']);
});

test('production rate fails closed when temporal denominator does not match the filter scope',()=>{
  const snapshot={line_id:'TAN10101',snapshot_id:1,revision:1,
    summary:{quantity:100,check_fpy:96.5,period:{start_at:'2026-10-13T07:00:00-03:00',end_at:'2026-10-14T07:00:00-03:00'}},
    coverage:{defects:{source_complete:true,transport_complete:true}},occurrences:[]};
  const store={read:()=>({snapshot}),occurrences:()=>({rows:[],coverage:{status:'partial'}})};
  const rows=[{line:'TAN10101',production_evidence_proven:true,production_operational_date:'2026-10-13',failure_record_date:'2026-10-13',defect_time:'2026-10-13T09:00:00'}];
  const proven=productionMetrics(store,{line:'TAN10101',from:'2026-10-13',to:'2026-10-13'},rows);
  assert.equal(proven.quantity,100);assert.equal(proven.checkFpy,96.5);assert.equal(proven.denominatorProven,true);
  assert.equal(productionMetrics(store,{line:'TAN10101',shift:'1st Shift',from:'2026-10-13',to:'2026-10-13'},rows).quantity,null);
  assert.equal(productionMetrics(store,{line:'TAN10101',hour:'09:00',from:'2026-10-13',to:'2026-10-13'},rows).quantity,null);
  assert.equal(productionMetrics(store,{line:'TAN10101',from:'2026-10-12',to:'2026-10-12'},rows).quantity,null);
  assert.equal(productionMetrics(store,{line:'TAN10101',from:'2026-10-12',to:'2026-10-13'},rows).quantity,null);
  assert.equal(productionMetrics(store,{line:'TAN10101'},rows).quantity,null);
  assert.equal(productionMetrics(store,{line:'TAN10101',from:'2026-99-99',to:'2026-99-99'},rows).quantity,null);
  const wrongPeriod={...snapshot,summary:{...snapshot.summary,period:{start_at:'2026-10-12T07:00:00-03:00',end_at:'2026-10-13T07:00:00-03:00'}}};
  assert.equal(productionMetrics({...store,read:()=>({snapshot:wrongPeriod})},{line:'TAN10101',from:'2026-10-13',to:'2026-10-13'},rows).quantity,null);
  const partial={...snapshot,coverage:{defects:{source_complete:false,transport_complete:true}}};
  assert.equal(productionMetrics({...store,read:()=>({snapshot:partial})},{line:'TAN10101',from:'2026-10-13',to:'2026-10-13'},rows).quantity,null);
  const unavailable={...snapshot,summary:{...snapshot.summary,quantity:null,check_fpy:null}};
  const missingStore={...store,read:()=>({snapshot:unavailable})};
  const absent=productionMetrics(missingStore,{line:'TAN10101',from:'2026-10-13',to:'2026-10-13'},rows);
  assert.equal(absent.denominatorProven,false);
  assert.equal(absent.quantity,null,'missing production denominator cannot become numeric zero');
});

test('daily occurrence preserves loaded AT repair fields without falsely claiming 3012',()=>{
  const snapshot={snapshot_id:7,occurrences:[{pcba_sn:'P1',defect_key:'K1',defect_code:'D1',defect_desc:'Camera scratched',defect_time:'2026-10-13T09:15:00',product_key:'CPH2817',repair_user:'AT01',repair_comment:'camera replaced',repair_time:'2026-10-13T09:40:00',repair_code:'RC1',repair_source:'3028-repair-refresh',repair_evidence_3012:[]}],process_timeline:{contexts:[]},pcba_history:{records:[]},insights:{drilldowns:{}},material_trace:{records:[]}};
  const store={read:line=>({snapshot:line==='TAN10101'?snapshot:null})};
  const rows=buildDailyFailureRows(store);
  assert.equal(rows.length,1);
  assert.equal(rows[0].repair_user,'AT01');
  assert.equal(rows[0].repair_comment,'camera replaced');
  assert.equal(rows[0].repair_code,'RC1');
  assert.equal(rows[0].repair_source,'3028-repair-refresh');
  assert.equal(rows[0].repair_rows.length,0);
});

test('a material from PCBA context never inherits an unrelated 3028 occurrence',()=>{
  const events=[
    {pcba_sn:'P1',defect_key:'K1',defect_code:'CAM',defect_time:'2026-10-22T10:00:00-03:00'},
    {pcba_sn:'P1',defect_key:'K2',defect_code:'LCD',defect_time:'2026-10-22T11:00:00-03:00'},
  ];
  const trace=[
    {current_pcba_sn:'P1',current_defect_key:'K1',item_sn:'MAT-EXACT',item_type:'Rear Camera',
      known_use_count:2,previous_pcbas:['OLD']},
    {current_pcba_sn:'P1',item_sn:'MAT-CONTEXT',item_type:'Screen',
      known_use_count:2,previous_pcbas:['OLD']},
    {current_pcba_sn:'P1',current_defect_key:'K1',item_sn:'MAT-NEW-CYCLE',item_type:'Rear Camera',
      bind_time_utc:'2026-10-22T14:30:00Z',known_use_count:2,previous_pcbas:['OLD']},
  ];
  const snapshot={line_id:'TAN10101',occurrences:events,material_trace:{records:trace},
    process_timeline:{contexts:[]},pcba_history:{records:[]},insights:{drilldowns:{}}};
  const rows=buildDailyFailureRows({read:line=>({snapshot:line==='TAN10101'?snapshot:null})});
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0].component_links_exact.map(x=>x.material),['MAT-EXACT']);
  assert.equal(rows[0].component_links_count,3,'PCBA context remains visible, not attributed');
  assert.equal(rows[1].component_links_exact.length,0);
  assert.equal(reuseGroup(rows[0]),'material_only');
  assert.equal(reuseGroup(rows[1]),'no_reuse_evidence');
  assert.equal(reuseCriteriaEvidence(rows[1]).material_reused,false);
});

test('raw matching defect code and instant can anchor material without a defect key',()=>{
  const defect={pcba_sn:'P2',defect_key:'K3',defect_code:'D3',defect_time:'2026-10-22T10:00:00-03:00'};
  const earlier={pcba_sn:'P2',defect_key:'K2',defect_code:'OTHER',defect_time:'2026-10-22T09:00:00-03:00'};
  const material={current_pcba_sn:'P2',item_sn:'MAT-1',item_type:'LCM',
    'Defect Code atual':'D3','Defect Time atual':'2026-10-22T13:00:00Z',
    known_use_count:2,previous_pcbas:['OLD']};
  const snapshot={line_id:'TAN10101',occurrences:[earlier,defect],
    material_trace:{records:[material]},pcba_history:{records:[]},
    process_timeline:{contexts:[]},insights:{drilldowns:{}}};
  const rows=buildDailyFailureRows({read:line=>({snapshot:line==='TAN10101'?snapshot:null})});
  assert.equal(rows[0].component_links_exact.length,0);
  assert.deepEqual(rows[1].component_links_exact.map(x=>x.material),['MAT-1']);
});

test('PCBA same/family recurrence only consults 2114 history before the 3028 event',()=>{
  const snapshot={line_id:'TAN10101',occurrences:[{
    pcba_sn:'P4',defect_key:'K4',defect_code:'CAM-A',defect_desc:'Front camera failed',
    defect_time:'2026-10-22T10:00:00-03:00'}],
  material_trace:{records:[]},process_timeline:{contexts:[]},
  pcba_history:{records:[
    {pcba_sn:'P4',defect_code:'CAM-B',defect_desc:'Front camera not working',defect_time:'2026-10-21T09:00:00-03:00'},
    {pcba_sn:'P4',defect_code:'CAM-A',defect_desc:'Front camera failed',defect_time:'2026-10-23T10:00:00-03:00'},
    {pcba_sn:'P4',defect_code:'CAM-A',defect_desc:'Front camera failed',defect_time:'invalid'},
    {pcba_sn:'OTHER',defect_code:'CAM-A',defect_desc:'Front camera failed',defect_time:'2026-10-21T09:00:00-03:00'}]},
  insights:{drilldowns:{pcba_second_use:[{PCBA:'P4'}],pcba_reused_with_prior_failure:[{PCBA:'P4'}]}}};
  const [row]=buildDailyFailureRows({read:line=>({snapshot:line==='TAN10101'?snapshot:null})});
  assert.equal(row.pcba_prior_events.length,1);
  assert.equal(row.pcba_prior_events[0].defect_code,'CAM-B');
  const flags=reuseCriteriaEvidence(row);
  assert.equal(flags.pcba_prior_family,true);
  assert.equal(flags.pcba_prior_same,false,'future same code cannot become prior evidence');
});

test('three reuse granularities never turn three material links into three PCBAs',()=>{
  const links=['M1','M2','M3'].map(material=>({pcba:'P1',line:'TAN10103',material,component_group:'DISPLAY_SET',family:'Screen / LCD',relations:'MESMA FALHA'}));
  const grouped=aggregatePcbas(links),kpi=reuseKpis(links);
  assert.equal(grouped.length,1);
  assert.equal(grouped[0].materials,3);
  assert.equal(grouped[0].component_groups,1);
  assert.equal(grouped[0].links,3);
  assert.equal(kpi.pcbas,1);
  assert.equal(kpi.materials,3);
  assert.equal(kpi.groups,1);
  assert.equal(kpi.links,3);
  assert.equal(componentGroup({assembly_group:'DISPLAY_SET',item_type:'Speaker'}),'DISPLAY_SET');
});

test('reuse chart categories are mutually exclusive at PCBA level',()=>{
  const rows=[
    {pcba:'P1',material:'M1',history_code:null,history_desc:null},
    {pcba:'P1',material:'M2',history_code:'D1',history_desc:'Camera fail'},
    {pcba:'P2',material:'M3',history_code:null,history_desc:null},
    {pcba:'P3',material:'M4',historical_evidence:[{pcba:'OLD3',defect_code:'D3'}]},
  ];
  const categories=pcbaReuseCategoryMap(rows,new Set(['P2','P3']));
  assert.equal(categories.size,3);
  assert.equal(categories.get('P1'),'component_failure');
  assert.equal(categories.get('P2'),'pcba_failure');
  assert.equal(categories.get('P3'),'both');
  assert.equal([...categories.values()].filter(v=>v==='reuse_only').length,0);
});

test('material reuse preserves exact prior-PCBA to prior-failure evidence',()=>{
  const snapshot={
    line_id:'TAN10101',
    occurrences:[{pcba_sn:'CUR1',defect_key:'NOW',defect_code:'NOW-D',defect_desc:'Current failure'}],
    material_trace:{records:[{current_pcba_sn:'CUR1',current_defect_key:'NOW',item_sn:'MAT1',item_type:'Front Camera',known_use_count:3,previous_pcbas_json:JSON.stringify(['OLD1','OLD2'])}]},
    pcba_history:{records:[
      {pcba_sn:'OLD1',defect_code:'D1',defect_desc:'Camera fail',defect_time:'2026-02-10T10:00:00',repair_evidence_3012:[{repair_user:'AT01',repair_comment:'camera replaced'}]},
      {pcba_sn:'OLD2',defect_code:'D2',defect_desc:'Connector fail',defect_time:'2026-03-11T11:00:00'}
    ]},
    process_timeline:{events:[{pcba_sn:'OLD1',event_time:'2026-02-10T09:30:00',station:'A5162',process:'Camera test'}]},
    insights:{drilldowns:{
      material_analysis:[],
      correlation_same_failure:[{'Material SN':'MAT1','PCBA atual':'CUR1','PCBA desvinculada':'OLD1','Defect Code antigo':'D1','Defect Description antigo':'Camera fail','Classificação desta PCBA':'MESMA FALHA'}],
      correlation_same_family:[{'Material SN':'MAT1','PCBA atual':'CUR1','PCBA desvinculada':'OLD2','Defect Code antigo':'D2','Defect Description antigo':'Connector fail','Classificação desta PCBA':'MESMA FAMÍLIA'}]
    }}
  };
  const links=reuseLinks(snapshot);
  assert.equal(links.length,1);
  const evidence=links[0].historical_evidence;
  assert.equal(evidence.length,2);
  const old1=evidence.find(e=>e.pcba==='OLD1'),old2=evidence.find(e=>e.pcba==='OLD2');
  assert.equal(old1.defect_code,'D1');
  assert.equal(old1.defect_desc,'Camera fail');
  assert.equal(old1.relation,'MESMA FALHA');
  assert.equal(old1.repair_user,'AT01');
  assert.equal(old1.station,'A5162');
  assert.equal(old2.defect_code,'D2');
  assert.equal(old2.defect_desc,'Connector fail');
  assert.equal(old2.relation,'MESMA FAMÍLIA');
  assert.match(links[0].history_desc,/OLD1: Camera fail/);
  assert.match(links[0].history_desc,/OLD2: Connector fail/);
});


test('daily dashboard refreshes same snapshot number on new revision or collector',()=>{
  const previousDocument=globalThis.document;
  globalThis.document={documentElement:{lang:'pt-BR'}};
  let snapshot={line_id:'TAN10101',source_id:'POST-A',snapshot_id:14,snapshot_revision:1,content_hash:'a'.repeat(64),
    summary:{quantity:100,check_fpy:97},
    occurrences:[{pcba_sn:'P1',defect_key:'K1',defect_code:'CAM',defect_desc:'Camera scratched',defect_time:'2026-10-22T10:00:00-03:00'}],
    process_timeline:{contexts:[]},pcba_history:{records:[]},insights:{drilldowns:{}},material_trace:{records:[]}};
  let writes=0,html='';
  const root={classList:{add(){}},querySelectorAll:()=>[],querySelector:()=>null,
    set innerHTML(value){writes++;html=value;},get innerHTML(){return html;}};
  const store={read:line=>({snapshot:line==='TAN10101'?snapshot:null}),
    occurrences:()=>({rows:snapshot.occurrences,coverage:{status:'partial'}})};
  try{
    const view=createDailyFailureAnalytics(root,store);
    view.render();view.render();assert.equal(writes,1,'unchanged polling must not render again');
    snapshot={...snapshot,snapshot_revision:2,occurrences:[{...snapshot.occurrences[0],defect_desc:'Screen black spot'}]};
    view.render();assert.equal(writes,2,'new immutable revision must replace old evidence');
    assert.match(html,/Screen black spot/);assert.doesNotMatch(html,/Camera scratched/);
    snapshot={...snapshot,source_id:'POST-B'};
    view.render();assert.equal(writes,3,'same snapshot/revision number on another collector is distinct');
    snapshot={...snapshot,content_hash:'b'.repeat(64)};
    view.render();assert.equal(writes,4,'verified content identity participates in refresh');
  }finally{globalThis.document=previousDocument;}
});


test('3012 contradicted and exact-identity candidates never become the current occurrence AT',()=>{
  const candidate={pcba_sn:'P1',defect_code:'OTHER',defect_time:'2026-10-21T09:00:00-03:00',
    repair_user:'OLD-AT',repair_comment:'Older unrelated analysis',
    association:'distinct_occurrence_candidate',occurrence_match:'contradicted',
    candidate_for_occurrence:false,repair_confirmed:false};
  const snapshot={line_id:'TAN10101',snapshot_id:14,summary:{},
    occurrences:[{pcba_sn:'P1',defect_key:'NOW',defect_code:'CAM',defect_time:'2026-10-22T10:00:00-03:00',repair_evidence_3012:[candidate]}],
    material_trace:{records:[]},pcba_history:{records:[]},process_timeline:{contexts:[]},insights:{drilldowns:{}}};
  const read=()=>buildDailyFailureRows({read:line=>({snapshot:line==='TAN10101'?snapshot:null})})[0];
  let row=read();
  assert.equal(row.repair_user,null);assert.equal(row.repair_comment,null);
  assert.notEqual(row.repair_source,'3012');
  assert.equal(row.repair_candidates[0].repair_comment,candidate.repair_comment);
  snapshot.occurrences[0].repair_evidence_3012=[{...candidate,defect_code:'CAM',
    defect_time:'2026-10-22T10:00:00-03:00',association:'exact_identity_candidate',
    occurrence_match:'candidate',candidate_for_occurrence:true}];
  row=read();assert.equal(row.repair_user,null,'exact identity is still not proof of performed repair');
  assert.equal(row.repair_candidates.length,1);
  snapshot.occurrences[0].repair_user='DIRECT-3028-AT';
  snapshot.occurrences[0].repair_comment='Original occurrence comment';
  row=read();assert.equal(row.repair_user,'DIRECT-3028-AT');
  assert.equal(row.repair_comment,'Original occurrence comment');
  assert.equal(row.repair_candidates.length,1,'keep candidate separate from original occurrence evidence');
  const previousDocument=globalThis.document;
  globalThis.document={documentElement:{lang:'pt-BR'}};
  const mode={dataset:{dfaMode:'occurrences'}};
  const root={classList:{add(){}},querySelectorAll:q=>q==='[data-dfa-mode]'?[mode]:[],querySelector:()=>null,innerHTML:''};
  const store={read:line=>({snapshot:line==='TAN10101'?snapshot:null}),occurrences:()=>({rows:snapshot.occurrences,coverage:{status:'partial'}})};
  snapshot.occurrences[0].repair_evidence_3012[0].repair_comment='Preserve full <script>candidate</script>';
  try{
    const view=createDailyFailureAnalytics(root,store);view.render();mode.onclick();
    assert.match(root.innerHTML,/Histórico 3012 · associação não comprovada/);
    assert.match(root.innerHTML,/Candidato não confirmado/);
    assert.match(root.innerHTML,/Preserve full &lt;script&gt;candidate&lt;\/script&gt;/);
    assert.doesNotMatch(root.innerHTML,/<script>candidate/);
    assert.match(root.innerHTML,/Original occurrence comment/);
    globalThis.document.documentElement.lang='en-US';view.render();
    assert.match(root.innerHTML,/3012 history · unproven association/);
    assert.doesNotMatch(root.innerHTML,/Candidato não confirmado/);
  }finally{globalThis.document=previousDocument;}
});


test('seven 3028 occurrences remain visible when only two have proven 3022 generation',()=>{
  const rows=Array.from({length:7},(_,i)=>({
    defect_time:'2026-10-27T'+String(9+i).padStart(2,'0')+':15:00Z',
    production_event_time:i<2?'2026-10-27T'+String(10+i).padStart(2,'0')+':05:00Z':null,
    production_evidence_proven:i<2,
  }));
  const result=dailyFailureHourCoverage(rows);
  assert.equal(result.total,7);
  assert.equal(result.recorded.reduce((n,[,count])=>n+count,0),7);
  assert.equal(result.produced.reduce((n,[,count])=>n+count,0),2);
  assert.equal(result.missingRecorded,0);
  assert.equal(result.missingProduced,5,'missing 3022 is not zero 3028 events');
});

test('no proven 3022 still retains all available 3028 record times',()=>{
  const rows=[{defect_time:'2026-10-27T11:25:00Z'},
    {defect_time:'2026-10-27T11:45:00Z'},
    {defect_time:'invalid'}];
  const result=dailyFailureHourCoverage(rows);
  assert.deepEqual(result.recorded,[['08:00',2]]);
  assert.deepEqual(result.produced,[]);
  assert.equal(result.missingProduced,3);
  assert.equal(result.missingRecorded,1);
});
