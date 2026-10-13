import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDailyFailureRows,rankDailyFailures} from '../ames/daily-failure-analytics.mjs';
import {aggregatePcbas,componentGroup,reuseKpis,reuseLinks} from '../ames/data/reuse-analysis.mjs';
import {pcbaReuseCategoryMap} from '../ames/reuse-table-view.mjs';

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
    {pcba:'P1',line:'TAN10101',production_shift:'1st Shift',product:'CPH2817',defect_code:'D1',defect_desc:'Camera scratched',repair_user:'U1',component_families:['Camera'],relations:['MESMA FALHA'],reuse_present:true,reuse_with_failure:true,pcba_prior_failure:false,component_history_count:1,production_operational_date:'2026-10-13'},
    {pcba:'P2',line:'TAN10101',production_shift:'2nd Shift',product:'CPH2817',defect_code:'D2',defect_desc:'LCD stain',repair_user:'U2',component_families:['Screen / LCD'],relations:['OUTRA FALHA'],reuse_present:false,reuse_with_failure:false,pcba_prior_failure:false,component_history_count:0,production_operational_date:'2026-10-13'},
  ];
  assert.deepEqual(filterDailyFailureRows(rows,{shift:'1st Shift'}).map(r=>r.pcba),['P1']);
  assert.deepEqual(filterDailyFailureRows(rows,{reuse:'with_failure'}).map(r=>r.pcba),['P1']);
  assert.deepEqual(filterDailyFailureRows(rows,{relation:'MESMA FALHA'}).map(r=>r.pcba),['P1']);
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
