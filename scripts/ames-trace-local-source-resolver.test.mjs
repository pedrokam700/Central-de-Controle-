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
test('same source, line, snapshot and period: use already verified local head, not shared display',()=>{
 const state=traceTargetForLine(harness(),LINE);
 assert.equal(state.available,true);
 assert.equal(state.target.snapshot_revision,2);
 assert.equal(state.proof,'local_current');
});
test('shared copy from matching connected source is provisionally eligible for authenticated local-history check',()=>{
 const state=traceTargetForLine(harness({local:null}),LINE);
 assert.equal(state.available,true);
 assert.equal(state.proof,'requires_local_history_verification');
 assert.equal(state.target.source_id,'A');
 assert.equal(state.target.snapshot_id,'2');
});
test('shared copy from another agent source is never provisionally eligible',()=>{
 const state=traceTargetForLine(harness({shown:payload({source:'A'}),local:null,agentSource:'B'}),LINE);
 assert.equal(state.available,false);
 assert.equal(state.reason,'Revisão não pertence ao agente local conectado');
});
test('foreign workstation with colliding snapshot IDs must remain blocked',()=>{
 const state=traceTargetForLine(harness({shown:payload({source:'B'})}),LINE);
 assert.equal(state.available,false);
 assert.throws(()=>exactTraceTargets(harness({shown:payload({source:'B'})}),[LINE]),/não pertence/);
});
test('do not substitute a local head with different snapshot ID',()=>{
 const state=traceTargetForLine(harness({local:payload({id:'3'})}),LINE);
 assert.equal(state.available,false);
});
test('do not substitute a local head with different operational period',()=>{
 const state=traceTargetForLine(harness({local:payload({periodValue:{...period,end_at:'2026-11-01T07:00'}})}),LINE);
 assert.equal(state.available,false);
});
test('same revision but changed content hash is rejected before MES dispatch',()=>{
 const original={...payload(),period},current={...payload(),content_hash:'c'.repeat(64)};
 assert.throws(()=>refreshedTraceTarget(original,current),/Revisão local inválida/);
});
test('recovered historical head remains blocked, despite local copy',()=>{
 const state=traceTargetForLine(harness({recovered:true}),LINE);
 assert.equal(state.available,false);
 assert.match(state.reason,/Revisão mais recente/);
});
test('explicit local source with owned identity remains available',()=>{
 const state=traceTargetForLine(harness({readSource:'local',local:null}),LINE);
 assert.equal(state.available,true);
 assert.equal(state.proof,'local_current');
});
