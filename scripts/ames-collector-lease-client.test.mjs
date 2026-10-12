import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorLeaseClient} from '../ames/collector-lease-client.mjs';
import {COLLECTOR_LEASE_SCHEMA} from '../ames/data/collector-authority.mjs';

const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const line='TAN10101';
const TS=Symbol('serverTimestamp');

function snapshot(data){return {exists:()=>data!==null&&data!==undefined,data:()=>data};}

function harness({current=null,uid='A',workstationId=wsA,failures=[]}={}){
  const writes=[],refs=[],calls=[];
  let remote=current,attempt=0;
  const api={
    doc(_db,collection,id){const ref={collection,id};refs.push(ref);return ref;},
    serverTimestamp(){return TS;},
    async getDoc(){return snapshot(remote);},
    async runTransaction(_db,callback){
      const index=attempt++;
      let proposed;
      const tx={
        async get(){return snapshot(remote);},
        set(_ref,payload){proposed=payload;writes.push(payload);}
      };
      const result=await callback(tx);
      calls.push(result);
      const failure=failures[index];
      if(failure)throw failure;
      if(proposed){
        remote={...proposed,acquired_at:proposed.acquired_at===TS?`server-acquired-${index}`:proposed.acquired_at,renewed_at:`server-renewed-${index}`};
      }
      return result;
    },
    db:{id:'db'},
    currentUid:()=>uid,
    workstationId,
    writes,refs,calls,
    remote:()=>remote,
    attempts:()=>attempt
  };
  api.client=createCollectorLeaseClient(api);
  return api;
}

const permissionDenied=()=>Object.assign(new Error('denied'),{code:'permission-denied'});
const lease=(overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:line,owner_uid:'A',workstation_id:wsA,generation:4,acquired_at:'server-acquired-old',renewed_at:'server-renewed-old',status:'active',...overrides});

test('vacant lease acquires generation one with server timestamps and deterministic fence',async()=>{
  const h=harness();
  const result=await h.client.claim(line);
  assert.deepEqual(result,{action:'acquire',generation:1,line_id:line,owner_uid:'A',workstation_id:wsA,fence:`${line}:1:${wsA}`});
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].schema,COLLECTOR_LEASE_SCHEMA);
  assert.equal(h.writes[0].acquired_at,TS);
  assert.equal(h.writes[0].renewed_at,TS);
  assert.equal(h.writes[0].generation,1);
});

test('same collector renews without changing generation or acquired_at',async()=>{
  const h=harness({current:lease()});
  const result=await h.client.claim(line);
  assert.equal(result.action,'renew');
  assert.equal(result.generation,4);
  assert.equal(h.writes[0].acquired_at,'server-acquired-old');
  assert.equal(h.writes[0].renewed_at,TS);
});

test('different collector proposes generation plus one takeover and Rules remain authority',async()=>{
  const h=harness({current:lease(),uid:'B',workstationId:wsB});
  const result=await h.client.claim(line);
  assert.equal(result.action,'takeover');
  assert.equal(result.generation,5);
  assert.equal(result.fence,`${line}:5:${wsB}`);
  assert.equal(h.writes[0].generation,5);
  assert.equal(h.writes[0].acquired_at,TS);
});

test('permission denied takeover becomes explicit lease-unavailable without retry loop',async()=>{
  const denied=permissionDenied();
  const h=harness({current:lease(),uid:'B',workstationId:wsB,failures:[denied]});
  await assert.rejects(()=>h.client.claim(line),error=>error.code==='collector/lease-unavailable'&&error.cause===denied);
  assert.equal(h.attempts(),1);
});

test('expired same-workstation renewal denied by server retries exactly once as generation+1 takeover',async()=>{
  const h=harness({current:lease(),failures:[permissionDenied(),null]});
  const result=await h.client.claim(line);
  assert.equal(h.attempts(),2);
  assert.equal(h.writes[0].generation,4);
  assert.equal(h.writes[1].generation,5);
  assert.equal(h.writes[1].acquired_at,TS);
  assert.equal(result.action,'takeover');
  assert.equal(result.generation,5);
});

test('permission denied on retry is surfaced as lease-unavailable and no third attempt occurs',async()=>{
  const second=permissionDenied();
  const h=harness({current:lease(),failures:[permissionDenied(),second]});
  await assert.rejects(()=>h.client.claim(line),error=>error.code==='collector/lease-unavailable'&&error.cause===second);
  assert.equal(h.attempts(),2);
});

test('non-permission transaction error is never converted or retried',async()=>{
  const boom=Object.assign(new Error('network down'),{code:'unavailable'});
  const h=harness({current:lease(),failures:[boom]});
  await assert.rejects(()=>h.client.claim(line),error=>error===boom);
  assert.equal(h.attempts(),1);
});

test('remote lease schema and generation fail closed before claiming authority',async()=>{
  const badSchema=harness({current:{...lease(),schema:'other'}});
  await assert.rejects(()=>badSchema.client.claim(line),/incompatível/);
  const badGeneration=harness({current:{...lease(),generation:0}});
  await assert.rejects(()=>badGeneration.client.claim(line),/Geração remota/);
});

test('status reports ownership and fence without mutating lease',async()=>{
  const h=harness({current:lease()});
  const state=await h.client.status(line);
  assert.equal(state.owned_by_this_session,true);
  assert.equal(state.fence,`${line}:4:${wsA}`);
  assert.equal(h.writes.length,0);
  const other=harness({current:lease({owner_uid:'B',workstation_id:wsB}),uid:'A',workstationId:wsA});
  assert.equal((await other.client.status(line)).owned_by_this_session,false);
});

test('client exposes activation state proving MES head enforcement is still disabled',()=>{
  const h=harness();
  assert.equal(h.client.activation,'lease-client-ready-head-enforcement-disabled');
});
