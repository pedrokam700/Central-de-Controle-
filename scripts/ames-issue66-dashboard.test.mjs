import test from 'node:test';
import assert from 'node:assert/strict';
import {observedReuseDashboard,reuseGroup,theoreticalReuseSensitivity,
  reuseCriteriaEvidence,filterReuseCriteria} from '../ames/data/daily-reuse-evidence.mjs';

const occurrence=(pcba,day,patch={})=>({line:'L3',pcba,defect_code:'CAM',
  defect_time:`2026-10-${day} 10:00:00`,failure_record_date:`2026-10-${day}`,
  pcba_reused:false,component_links:[],...patch});
test('union, intersection and exclusive groups never double count an observed defect',()=>{
 const rows=[occurrence('P1','22',{pcba_reused:true,component_links:[{material:'M1'}]}),
   occurrence('P2','22',{pcba_reused:true}),occurrence('P3','23',{component_links:[{material:'M2'}]}),
   occurrence('P4','23')];
 const data=observedReuseDashboard([...rows,{...rows[0]}]);
 assert.equal(data.total,4);
 assert.equal(data.pcba.length,2);assert.equal(data.material.length,2);
 assert.equal(data.union.length,3);assert.equal(data.intersection.length,1);
 assert.deepEqual(Object.fromEntries(Object.entries(data.groups).map(([k,v])=>[k,v.length])),
   {pcba_only:1,material_only:1,both:1,no_reuse_evidence:1});
 assert.deepEqual(data.bins.map(b=>[b.key,b.total,b.both]),[['2026-10-22',2,1],['2026-10-23',2,0]]);
 assert.equal(data.population_complete,false);
 assert.equal(data.basis,'observed_3028_occurrences');
});

test('line view and missing identity stay distinct; no proof is not proof of first use',()=>{
 const first=occurrence('P1','22'),second={...first,line:'L2'};
 const data=observedReuseDashboard([first,second,occurrence('','22'),occurrence('','22')],'line');
 assert.equal(data.total,4);
 assert.deepEqual(data.bins.map(b=>[b.key,b.total]),[['L2',1],['L3',3]]);
 assert.equal(reuseGroup(first),'no_reuse_evidence');
 assert.equal(data.groups.no_reuse_evidence.length,4);
});

test('a material matched only by PCBA cannot contaminate a different 3028 defect',()=>{
 const unrelated=occurrence('P1','22',{component_links:[{material:'M1'}],component_links_exact:[]});
 assert.equal(reuseGroup(unrelated),'no_reuse_evidence');
 const exact={...unrelated,component_links_exact:[{material:'M1',defect_code:'CAM'}]};
 assert.equal(reuseGroup(exact),'material_only');
});

test('1600 production, 57 observed defects and 10 flagged implies only theoretical scale',()=>{
 const rows=Array.from({length:57},(_,i)=>occurrence('P'+i,'22',{
   pcba_reused:i<10,production_evidence_proven:true,
   production_operational_date:'2026-10-22'}));
 const model=observedReuseDashboard(rows);
 const p=theoreticalReuseSensitivity(model,model.union,{
   quantity:1600,denominatorProven:true,operationalDate:'2026-10-22'});
 assert.equal(Number(p.share_of_observed_pct.toFixed(2)),17.54);
 assert.equal(Number(p.theoretical_scale_pp.toFixed(3)),0.625);
 assert.equal(p.check_fpy_gain,null);
 assert.equal(p.root_cause_confirmed,false);
 const missing=theoreticalReuseSensitivity(model,model.union,{quantity:1600,
   denominatorProven:false,operationalDate:'2026-10-22'});
 assert.equal(missing.theoretical_scale_pp,null);
 const duplicate=theoreticalReuseSensitivity(model,[...model.union,model.union[0]],{
   quantity:1600,denominatorProven:true,operationalDate:'2026-10-22'});
 assert.equal(duplicate.theoretical_scale_pp,null);
});

test('configurable OR/AND uses exact material evidence and keeps candidates separate',()=>{
 const a=occurrence('P1','22',{pcba_reused:true,pcba_prior_failure:true});
 const b=occurrence('P2','22',{component_links_exact:[{material:'CAM2',item_type:'Rear Camera Secondary',
   historical_evidence:[{pcba:'OLD',defect_code:'OTHER'}]}],
   defect_desc:'Rear secondary camera no image'});
 const c=occurrence('P3','22',{pcba_reused:true,component_links_exact:[{material:'SCREEN',
   item_type:'Screen'}]});
 const rows=[a,b,c];
 assert.equal(filterReuseCriteria(rows,['pcba_reused','material_reused'],'or').length,3);
 assert.deepEqual(filterReuseCriteria(rows,['pcba_reused','material_reused'],'and').map(r=>r.pcba),['P3']);
 assert.deepEqual(filterReuseCriteria(rows,['material_type_candidate'],'or').map(r=>r.pcba),['P2']);
 assert.equal(reuseCriteriaEvidence(b).material_prior_candidate,true);
 assert.deepEqual(filterReuseCriteria(rows,['pcba_prior_history','material_type_candidate'],'and'),[]);
 assert.deepEqual(filterReuseCriteria(rows,[],'or'),[]);
});

test('same defect differs from same operational family; material histories remain candidates',()=>{
 const row=occurrence('BOARD','22',{defect_code:'CAM-01',defect_desc:'Front camera failed',
   pcba_reused:true,pcba_prior_failure:true,
   pcba_prior_events:[{defect_code:'CAM-01',defect_desc:'Front camera failed'},
     {defect_code:'CAM-02',defect_desc:'Front camera not working'}],
   component_links_exact:[{material:'PHYS-CAM',item_type:'Front Camera',
     historical_evidence:[{pcba:'BOARD-OLD',defect_code:'CAM-01',defect_desc:'Front camera failed'},
       {pcba:'BOARD-OLDER',defect_code:'CAM-03',defect_desc:'Front camera not working'}]}]});
 const proof=reuseCriteriaEvidence(row);
 for(const key of ['pcba_prior_same','pcba_prior_family','material_prior_same_candidate',
   'material_prior_family_candidate'])assert.equal(proof[key],true,key);
 assert.equal(filterReuseCriteria([row],['pcba_prior_same','material_prior_same_candidate'],'and').length,1);
 const ambiguous={...row,pcba_prior_events:[{defect_code:'CAM-01, CAM-02',defect_desc:'Front camera failed'}],
   component_links_exact:[{material:'PHYS-CAM',historical_evidence:[{
     defect_code:'CAM-01 | CAM-03',defect_desc:'Front camera failed'}]}]};
 assert.equal(reuseCriteriaEvidence(ambiguous).pcba_prior_same,false);
 assert.equal(reuseCriteriaEvidence(ambiguous).material_prior_same_candidate,false);
 const unrelated=occurrence('NEXT','22',{pcba_reused:true,pcba_prior_failure:true,
   pcba_prior_events:[{defect_code:'LCD-01',defect_desc:'Screen black spot'}]});
 assert.equal(reuseCriteriaEvidence(unrelated).pcba_prior_same,false);
 assert.equal(reuseCriteriaEvidence(unrelated).pcba_prior_family,false);
});
