import test from 'node:test';
import assert from 'node:assert/strict';
import {traceTargetForLine,exactTraceTargets,refreshedTraceTarget} from '../ames/data/trace-targets.mjs';

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
test('same source and snapshot: prefer local head with verified full identity',()=>{
 const state=traceTargetForLine(harness(),LINE);
 assert.equal(state.available,true);
 assert.equal(state.target.snapshot_revision,2);
 assert.equal(state.proof,'local_current');
});
test('historical shared copy from SAME agent is only a provisional target until local-history GET confirms it',()=>{
 const state=traceTargetForLine(harness({local:null}),LINE);
 assert.equal(state.available,true);
 assert.equal(state.proof,'requires_local_history_verification');
 assert.equal(state.target.snapshot_id,'2');
 assert.equal(state.target.source_id,'A');
});
test('foreign workstation never permitted even if snapshot numbers collide',()=>{
 const foreign=harness({shown:payload({source:'B'})});
 const state=traceTargetForLine(foreign,LINE);
 assert.equal(state.available,false);
 assert.match(state.reason,/origem/);
 assert.throws(()=>exactTraceTargets(foreign,[LINE]),/origem/);
});
test('different local snapshot must never silently replace the selected shared snapshot',()=>{
 const state=traceTargetForLine(harness({local:payload({id:'3'})}),LINE);
 assert.equal(state.proof,'requires_local_history_verification');
 assert.equal(state.target.snapshot_id,'2');
 assert.throws(()=>refreshedTraceTarget({...state.target,line_id:LINE},
    payload({id:'3',revision:2})),/Revisão local mudou/);
});
test('different period cannot be borrowed, and mismatch on GET is rejected',()=>{
 const state=traceTargetForLine(harness({local:payload({periodValue:{...period,end_at:'2026-11-01T07:00'}})}),LINE);
 assert.equal(state.proof,'requires_local_history_verification');
 assert.throws(()=>refreshedTraceTarget({...state.target,line_id:LINE},
    payload({revision:2,periodValue:{...period,end_at:'2026-11-01T07:00'}})),/Revisão local mudou/);
});
test('same revision cannot silently change its content hash',()=>{
 const state=traceTargetForLine(harness({local:null}),LINE);
 const changed={...payload(),content_hash:'c'.repeat(64)};
 assert.throws(()=>refreshedTraceTarget({...state.target,line_id:LINE},changed),/inválida ou anterior/);
});
test('previously recovered historical revision remains blocked before any MES job',()=>{
 const state=traceTargetForLine(harness({recovered:true}),LINE);
 assert.equal(state.available,false);
 assert.match(state.reason,/Revisão mais recente/);
});
test('already-selected local source path remains available',()=>{
 const state=traceTargetForLine(harness({readSource:'local',local:null}),LINE);
 assert.equal(state.available,true);
 assert.equal(state.target.snapshot_revision,1);
 assert.equal(state.proof,'local_current');
});
