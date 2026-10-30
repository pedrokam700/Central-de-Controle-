import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';
import {refreshedTraceTarget} from '../ames/data/trace-targets.mjs';

const line='TAN10103';
const period={mode:'previous_day',start_at:'2026-10-28T07:00:00',end_at:'2026-10-29T07:00:00'};
const names=['defects','pcba_history','material_reuse','history_contexts','process_timeline'];
function canonical(revision=1){return {
 schema:'central-ames-v2',schema_version:2,line_id:line,snapshot_id:'2',
 source_id:'local-workstation',snapshot_revision:revision,content_hash:'hash-'+revision,
 collected_at:'2026-10-29T10:00:00Z',
 summary:{line,snapshot_id:'2',collected_at:'2026-10-29T10:00:00Z',period},
 datasets:Object.fromEntries(names.map(name=>[name,[]])),
 coverage:Object.fromEntries(names.map(name=>[name,{transport_complete:true,stored_total:0}])),
 insights:null,capabilities:{}
};}
function rig(fresh=canonical(2),{source='local'}={}){
 let agent={status:'connected',capabilities:{source_id:'local-workstation',exact_trace_targets:true,process_timeline:true}};
 const calls=[],selected=canonical(1);
 const store={agent:()=>agent,updateAgent(patch){agent={...agent,...patch};},
  setLocalConnected(){},read:()=>({source,snapshot:{canonical:selected}}),
  readingPeriod:()=>({mode:'previous'}),localCanonical:()=>[]};
 const fetcher=async(url,opts)=>{const u=new URL(url);
  calls.push({path:u.pathname,body:opts.body?JSON.parse(opts.body):null});
  if(u.pathname.endsWith('/local-history'))return {ok:true,json:async()=>structuredClone(
   u.searchParams.has('snapshot_revision')?canonical(Number(u.searchParams.get('snapshot_revision'))):fresh
  )};
  if(u.pathname.endsWith('/deep-trace'))return {ok:true,json:async()=>({id:'J',kind:'deep_trace',status:'queued'})};
  throw Error('Unexpected '+u.pathname);
 };
 const client=createAgentClient(store,{fetcher,schedule:()=>1,unschedule:()=>{}});
 const scope={lines:[line],performance:'safe',max_failures:0,max_pcbas:0,defect_codes:[],trace_mode:'process_only'};
 return {client,scope,calls};
}
test('deep trace refreshes a stale r1 to r2 of the same local 3028 snapshot before MES dispatch',async()=>{
 const h=rig();await h.client.collect('deep',h.scope);
 assert.equal(h.calls[0].path.endsWith('/local-history'),true);
 const post=h.calls.find(x=>x.path.endsWith('/deep-trace'));
 assert.equal(post.body.snapshot_targets[line].snapshot_id,'2');
 assert.equal(post.body.snapshot_targets[line].snapshot_revision,2);
 assert.equal(post.body.snapshot_targets[line].content_hash,'hash-2');
 h.client.clear();
});
test('reloaded shared history of the SAME local agent and snapshot passes only after authenticated /local-history proof',async()=>{
 const h=rig(canonical(2),{source:'remote'});
 await h.client.collect('deep',h.scope);
 assert(h.calls.some(c=>c.path.endsWith('/local-history')),'must verify local SQLite revision before MES');
 assert(h.calls.some(c=>c.path.endsWith('/deep-trace')),'verified exact local snapshot may be collected');
 h.client.clear();
});
test('shared same-source copy without a matching local snapshot fails closed before /deep-trace',async()=>{
 // Exact immutable revision exists in the mock, but the local latest
 // belongs to a different snapshot: do not retarget or send a MES POST.
 const h=rig({...canonical(2),snapshot_id:'3'},{source:'remote'});
 await assert.rejects(h.client.collect('deep',h.scope),/revisão não comprovada no agente local/);
 assert(h.calls.some(c=>c.path.endsWith('/local-history')),'agent proof required');
 assert.equal(h.calls.some(c=>c.path.endsWith('/deep-trace')),false);
 h.client.clear();
});
test('wrong snapshot, line, workstation, period, and revision downgrade are rejected before MES dispatch',async()=>{
 const altered=[{...canonical(2),snapshot_id:'3'},
 {...canonical(2),line_id:'TAN10102'},
 {...canonical(2),source_id:'remote-workstation'},
 {...canonical(2),summary:{...canonical(2).summary,period:{...period,end_at:'2026-10-30T07:00:00'}}},
 canonical(0)];
 for(const payload of altered){const h=rig(payload);
  await assert.rejects(h.client.collect('deep',h.scope));
  assert.equal(h.calls.some(x=>x.path.endsWith('/deep-trace')),false);
  h.client.clear();}
});
test('pure target guard never changes the requested 3028 snapshot identity',()=>{
 const old={...canonical(1),period};
 const next=canonical(2);
 const out=refreshedTraceTarget(old,next);
 assert.equal(out.snapshot_id,old.snapshot_id);
 assert.equal(out.source_id,old.source_id);
 assert.deepEqual(out.period,old.period);
});
