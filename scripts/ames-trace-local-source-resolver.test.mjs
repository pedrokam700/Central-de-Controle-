import test from 'node:test';
import assert from 'node:assert/strict';
import {traceTargetForLine,exactTraceTargets} from '../ames/data/trace-targets.mjs';

const LINE='TAN10103';
const period={mode:'previous_day',start_at:'2026-10-29T07:00',end_at:'2026-10-30T07:00'};
function payload({source='A',id='2',revision=1,line=LINE,periodValue=period}={}){
 return {source_id:source,snapshot_id:id,snapshot_revision:revision,line_id:line,
   content_hash:'b'.repeat(64),summary:{period:periodValue}};
}
function harness({shown=payload(),local=payload({revision:2}),readSource='remote',agentSource='A',recovered=false}={}){
 return {read:()=>({source:readSource,snapshot:{canonical:shown}}),
   localCanonical:()=>local?[local]:[],
   readingPeriod:()=>({mode:'previous',start:period.start_at,end:period.end_at}),
   agent:()=>({capabilities:{source_id:agentSource},
     period_read:{recovered_lines:recovered?[{line_id:LINE}]:[]}})};
}
test('same source, line, snapshot and operational period: use verified live local head instead of remote presentation',()=>{
 const target=traceTargetForLine(harness(),LINE);
 assert.equal(target.available,true);
 assert.equal(target.target.snapshot_revision,2);
 assert.equal(target.target.source_id,'A');
 assert.equal(target.target.snapshot_id,'2');
});
test('never borrow a local revision from different source even with colliding snapshot IDs',()=>{
 const source=traceTargetForLine(harness({shown:payload({source:'B'})}),LINE);
 assert.equal(source.available,false);
 assert.match(source.reason,/não pertence/);
 assert.throws(()=>exactTraceTargets(harness({shown:payload({source:'B'})}),[LINE]),/não pertence/);
});
test('never borrow a different local snapshot, even from same source',()=>{
 const result=traceTargetForLine(harness({local:payload({id:'3'})}),LINE);
 assert.equal(result.available,false);
});
test('never borrow a local revision from another operational period',()=>{
 const result=traceTargetForLine(harness({local:payload({periodValue:{...period,end_at:'2026-11-01T07:00'}})}),LINE);
 assert.equal(result.available,false);
});
test('recovered historical head remains protected even if local copy looks valid',()=>{
 const result=traceTargetForLine(harness({recovered:true}),LINE);
 assert.equal(result.available,false);
 assert.match(result.reason,/Revisão mais recente/);
});
test('normal selected local canonical with same source continues to work',()=>{
 const result=traceTargetForLine(harness({readSource:'local',shown:payload(),local:null}),LINE);
 assert.equal(result.available,true);
 assert.equal(result.target.snapshot_revision,1);
});
