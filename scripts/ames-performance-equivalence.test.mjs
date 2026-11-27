import test from 'node:test';
import assert from 'node:assert/strict';
import {reference89} from './audit/reference89.mjs';
import {board2114Timeline,buildReuseCohorts,filterReuseCohorts} from '../ames/data/reuse-cohorts.mjs';
import {renderBoardComparisonTable} from '../ames/console-reuse-cohorts.mjs';
import {multi} from './audit/performance90.mjs';
const base=await reference89('ames/data/reuse-cohorts.mjs');
const descriptions=['Camera impurity','Front camera failed','Rear camera failed','No fault camera',
 'Camera frontal traseira','Light sensor failed','Proximity sensor failed','WiFi failed','GPS failed','Screen failed','UNKNOWN',''];
const codes=['D','D2','UNKNOWN','N/A','-','',null];
let seed=90289;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
// The operator contract changed the current-failure classification and
// prior-evidence eligibility. Keep the PR89 comparison for all other fields.
function preservedPopulation(model){
 for(const name of ['pcbas','components']){
  const population=model[name];
  for(const row of population.rows){
   delete row.current_failure_relations;delete row.same_failure;delete row.same_family;
   delete row.prior_events;
  }
  for(const metric of ['same_failure','same_family','prior_failure']){
   delete population.counts[metric];delete population.metrics[metric];
  }
 }
 return model;
}
test('historical projections equal PR89 including partial/conflicting scopes, missing clocks and independent actors',()=>{
 for(let run=0;run<24;run++){
  const rows=Array.from({length:40},(_,i)=>({pcba_sn:i%11?'P':'OTHER',source_view:'2114',hist_seq:i%13?random(12):null,
   defect_code:codes[random(codes.length)],defect_desc:descriptions[random(descriptions.length)],defect_time:i%5?'2026-11-01 08:00:00':null,
   defect_user_name:'Autor '+i,repair_comment:'Comentário '+i,usage_status:i%2?'Y':'N',
   ...[{}, {source_id:'A'}, {source_id:'B',line:'TAN10101'}, {snapshot_id:'1',snapshot_revision:2},
    {revision:'2',period:{start_at:'A'}}, {line_id:'TAN10102',snapshot_revision:3},
    {line:'TAN10101',line_id:'TAN10102'}, {revision:2,snapshot_revision:3}][random(8)]}));
  rows.push(structuredClone(rows[1]),{...rows[1],defect_user_name:'Autor divergente'});
  const original=structuredClone(rows),expected=base.board2114Timeline('P',rows),actual=board2114Timeline('P',rows);
  assert.deepEqual(actual,expected,'seed run '+run);assert.deepEqual(rows,original);
  assert.equal(renderBoardComparisonTable({sn:'P',history_2114:actual}),renderBoardComparisonTable({sn:'P',history_2114:expected}));
 }
});
test('many distinct codes/descriptions retain exact, similar and unknown classifications',()=>{
 const rows=Array.from({length:120},(_,i)=>({pcba_sn:'P',hist_seq:i,
  defect_code:i%4?'D'+i:codes[i%codes.length],defect_desc:descriptions[i%descriptions.length]+' '+i,
  source_view:'2114',snapshot_id:'1',revision:i%9?2:undefined,defect_user_name:'Pessoa '+i}));
 assert.deepEqual(board2114Timeline('P',rows),base.board2114Timeline('P',rows));
});
test('multi-PCBA/component populations preserve complete rows, identity, counts and filters',()=>{
 for(const size of [40,80,120]){
  const snapshot=multi(size);snapshot.pcba_history.records.push({...snapshot.pcba_history.records[0],snapshot_revision:13,defect_user_name:'Revisão antiga'});
  const original=structuredClone(snapshot);
  for(const filters of [{},{sn:'SYNTH-1'},{item_type:'Camera'},{product:'OTHER'},{part_number:'UNKNOWN'}]){
   assert.deepEqual(preservedPopulation(buildReuseCohorts(snapshot,filters)),preservedPopulation(base.buildReuseCohorts(snapshot,filters)));
   assert.deepEqual(preservedPopulation(filterReuseCohorts(buildReuseCohorts(snapshot),filters)),preservedPopulation(base.buildReuseCohorts(snapshot,filters)));
  }
  assert.deepEqual(snapshot,original);
 }
});
test('proof indexes retain trimmed legacy board identities and alias order',()=>{
 const snapshot=multi(40),sn=snapshot.occurrences[0].pcba_sn;
 snapshot.pcba_history.records.push({pcba_sn:' '+sn+' ',defect_type:'MainBoard',defect_time:'2026-11-02 08:00:00'});
 snapshot.process_timeline={events:[{pcba_sn:' '+sn+' ',station:'A5162',event_time:'2026-11-03T12:00:00Z'}],contexts:[]};
 assert.deepEqual(preservedPopulation(buildReuseCohorts(snapshot)),preservedPopulation(base.buildReuseCohorts(snapshot)));
});
test('dense partial legacy lineages retain all observations with bounded index memory',()=>{
 const rows=Array.from({length:300},(_,i)=>({pcba_sn:'P',source_view:'2114',hist_seq:i,
  defect_code:'D',defect_desc:'Camera impurity',defect_user_name:'Autor '+i,
  ...(i%2?{source_id:'SOURCE-'+i}:{period:{mode:'PERIOD-'+i}})}));
 assert.deepEqual(board2114Timeline('P',rows),base.board2114Timeline('P',rows));
});
test('independent faults retain last-winning prior annotations, all actors, clocks and duplicate identity rules',()=>{
 for(let run=0;run<12;run++){
  const history=Array.from({length:24},(_,i)=>({pcba_sn:'P',hist_seq:i%19,record_id:'H'+i,
   defect_code:i%4?'D':'D2',defect_desc:i%3?'Camera impurity':'WiFi failed',
   defect_time:i%3?new Date(Date.UTC(2026,10,3,8,i)).toISOString():null,
   defect_user_name:'Pessoa '+i,repair_comment:'Observação '+i,repair_status:i%2?'Y':'N'}));
  const occurrences=Array.from({length:12},(_,i)=>({pcba_sn:'P',line_id:'TAN10101',
   defect_code:i%4?'D':'D2',defect_desc:i%3?'Camera impurity':'WiFi failed',
   defect_key:'K'+i,defect_time:new Date(Date.UTC(2026,10,3,8,(i*7+run)%60)).toISOString()}));
  if(run%2)occurrences.reverse();
  const snapshot={line_id:'TAN10101',source_id:'SOURCE',snapshot_id:'S',revision:14,
   occurrences,pcba_history:{records:history},process_timeline:{
    events:run%3?[{pcba_sn:'P',station:'A5162',event_time:'2026-11-03T09:00:00Z'}]:[],contexts:[]}};
  const original=structuredClone(snapshot);
  assert.deepEqual(preservedPopulation(buildReuseCohorts(snapshot)),preservedPopulation(base.buildReuseCohorts(snapshot)),'independent run '+run);
  assert.deepEqual(snapshot,original);
 }
});
