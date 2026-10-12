import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorLeaseClient} from '../ames/collector-lease-client.mjs';
import {COLLECTOR_LEASE_SCHEMA} from '../ames/data/collector-authority.mjs';

const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32),line='TAN10101',TS=Symbol('serverTimestamp');
const lease=(overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:line,owner_uid:'A',workstation_id:wsA,generation:4,acquired_at:'server-acquired-old',renewed_at:'server-renewed-old',status:'active',...overrides});
const snapshot=data=>({exists:()=>data!==null&&data!==undefined,data:()=>data});
const denied=()=>Object.assign(new Error('server denied current lease'),{code:'permission-denied'});

function harness({current=lease(),uid='A',workstationId=wsA,failures=[]}={}){
  let remote=current,attempt=0;const writes=[];
  const api={
    doc(_db,collection,id){return {collection,id};},
    serverTimestamp(){return TS;},
    async getDoc(){return snapshot(remote);},
    async runTransaction(_db,callback){
      const index=attempt++;let proposed;
      const tx={
        async get(){return snapshot(remote);},
        set(_ref,payload){proposed=payload;writes.push(payload);}
      };
      const result=await callback(tx);
      if(failures[index])throw failures[index];
      if(proposed)remote={...proposed,renewed_at:`server-renewed-${index}`};
      return result;
    },
    db:{id:'db'},currentUid:()=>uid,workstationId,writes,attempts:()=>attempt,remote:()=>remote
  };
  api.client=createCollectorLeaseClient(api);
  return api;
}

test('confirmOwned renews only the same existing collector and preserves generation/acquired_at',async()=>{
  const h=harness();
  const result=await h.client.confirmOwned(line);
  assert.deepEqual(result,{action:'confirm',authoritative:true,generation:4,line_id:line,owner_uid:'A',workstation_id:wsA,fence:`${line}:4:${wsA}`});
  assert.equal(h.attempts(),1);assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].generation,4);
  assert.equal(h.writes[0].acquired_at,'server-acquired-old');
  assert.equal(h.writes[0].renewed_at,TS);
});

test('confirmOwned never creates a vacant lease',async()=>{
  const h=harness({current:null});
  await assert.rejects(()=>h.client.confirmOwned(line),error=>error.code==='collector/lease-not-owned'&&error.reason==='vacant');
  assert.equal(h.attempts(),1);assert.equal(h.writes.length,0);
});

test('confirmOwned never writes when owner or workstation differs',async()=>{
  for(const current of [lease({owner_uid:'B'}),lease({workstation_id:wsB})]){
    const h=harness({current});
    await assert.rejects(()=>h.client.confirmOwned(line),error=>error.code==='collector/lease-not-owned'&&error.reason==='different_collector');
    assert.equal(h.attempts(),1);assert.equal(h.writes.length,0);
  }
});

test('server rejection of same-generation renewal becomes not-current with no takeover retry',async()=>{
  const rejection=denied(),h=harness({failures:[rejection]});
  await assert.rejects(()=>h.client.confirmOwned(line),error=>error.code==='collector/lease-not-current'&&error.cause===rejection);
  assert.equal(h.attempts(),1);
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].generation,4);
  assert.equal(h.writes[0].acquired_at,'server-acquired-old');
});

test('confirmOwned has no path to generation+1 even when current lease could be expired',async()=>{
  const h=harness({failures:[denied()]});
  await assert.rejects(()=>h.client.confirmOwned(line),error=>error.code==='collector/lease-not-current');
  assert.equal(h.writes.some(x=>x.generation===5),false);
  assert.equal(h.attempts(),1);
});

test('non-permission infrastructure errors are not disguised as lease authority results',async()=>{
  const boom=Object.assign(new Error('network down'),{code:'unavailable'}),h=harness({failures:[boom]});
  await assert.rejects(()=>h.client.confirmOwned(line),error=>error===boom);
  assert.equal(h.attempts(),1);
});

test('client activation states confirmation is ready but runtime/head enforcement remains disabled',()=>{
  const h=harness();
  assert.equal(h.client.activation,'lease-client-confirm-own-ready-runtime-not-wired-head-enforcement-disabled');
});
