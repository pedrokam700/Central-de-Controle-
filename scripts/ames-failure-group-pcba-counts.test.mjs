import test from 'node:test';
import assert from 'node:assert/strict';
import {failureGroupReuseSummaries,evidenceCountLabel} from '../ames/failure-group-evidence.mjs';
const d='GN01-TX02',now='2026-10-29T12:00:00-03:00';
const fail=(n,code=d)=>({pcba_sn:'B'+n,defect_code:code,defect_desc:code,defect_time:now,line_id:'TAN10103'});
const item=(n,i,extra={})=>({current_pcba_sn:'B'+n,item_sn:'M'+n+'-'+i,material_use_index:2,
 defect_code:d,defect_time:now,bind_time_utc:'2026-10-29T10:00:00-03:00',
 previous_pcbas_json:JSON.stringify(['OLD'+n]),...extra});
test('15 failures, 7 boards with 6 reused components each -> 7 affected PCBAs, never 42 material SNs',()=>{
 const events=Array.from({length:15},(_,i)=>fail(i));
 const materials=Array.from({length:7},(_,n)=>Array.from({length:6},(_,i)=>item(n,i))).flat();
 const history=Array.from({length:7},(_,i)=>({pcba_sn:'OLD'+i,defect_code:d,defect_time:'2026-10-28T09:00:00-03:00'}));
 const source={material_trace:{records:materials},pcba_history:{records:history},
  insights:{drilldowns:{pcba_analysis:[{pcba_sn:'B0',pcba_use_index:2},{pcba_sn:'B1',pcba_use_index:3},{pcba_sn:'B2',pcba_use_index:4}]}}};
 const result=failureGroupReuseSummaries(source,events,()=>d)[d];
 assert.equal(result.pcbaReuse.count,3);
 assert.equal(result.componentAffected.count,7);
 assert.equal(result.componentSameFailureAffected.count,7);
 assert.equal(result.pcbaSameFailure.count,0);
});
test('2nd, 3rd and 4th use share one reuse column; first-use and other failure excluded',()=>{
 const snap={material_trace:{records:[item(1,0,{material_use_index:4}),item(1,1,{material_use_index:1}),
  item(1,2,{defect_code:'OTHER'}),item(1,3,{unbind_time_utc:'2026-10-29T11:00:00-03:00'})]}};
 const m=failureGroupReuseSummaries(snap,[fail(1)],()=>d)[d];
 assert.equal(m.componentAffected.count,1);
 assert.equal(m.componentSameFailureAffected.count,0);
});
test('an older EXACT board failure counts once; future/unrelated do not',()=>{
 const snap={insights:{drilldowns:{pcba_analysis:[{pcba_sn:'B2',pcba_use_index:3}]}},
  pcba_history:{records:[{pcba_sn:'B2',defect_code:d,defect_time:'2026-10-28T12:00:00-03:00'},
  {pcba_sn:'B2',defect_code:'OTHER',defect_time:'2026-10-28T12:00:00-03:00'},
  {pcba_sn:'B2',defect_code:d,defect_time:'2026-10-30T12:00:00-03:00'}]}};
 const m=failureGroupReuseSummaries(snap,[fail(2),fail(2)],()=>d)[d];
 assert.equal(m.pcbaReuse.count,1);
 assert.equal(m.pcbaSameFailure.count,1);
});
test('unknown coverage uses dash, never treats missing evidence as proven zero',()=>{
 const m=failureGroupReuseSummaries({},[fail(9)],()=>d)[d];
 assert.equal(evidenceCountLabel(m.componentAffected),'—');
 assert.equal(evidenceCountLabel(m.componentSameFailureAffected),'—');
});
