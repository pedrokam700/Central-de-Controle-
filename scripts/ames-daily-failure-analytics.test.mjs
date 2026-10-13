import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDailyFailureRows,rankDailyFailures} from '../ames/daily-failure-analytics.mjs';
import {aggregatePcbas,componentGroup,reuseKpis} from '../ames/data/reuse-analysis.mjs';

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
