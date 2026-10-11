import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorLeaseObserver,COLLECTOR_LEASE_OBSERVER_SCHEMA} from '../ames/collector-lease-observer.mjs';
import {COLLECTOR_LEASE_SCHEMA,fencingToken} from '../ames/data/collector-authority.mjs';

const line='TAN10101';
const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const lease=(overrides={})=>({
  schema:COLLECTOR_LEASE_SCHEMA,
  line_id:line,
  owner_uid:'A',
  workstation_id:wsA,
  generation:4,
  status:'active',
  owned_by_this_session:true,
  fence:fencingToken({line,generation:4,workstationId:wsA}),
  ...overrides
});

function rig({value=lease(),error=null}={}){
  let statusCalls=0,claimCalls=0;
  const leaseClient={
    async status(requested){statusCalls++;assert.equal(requested,line);if(error)throw error;return value;},
    async claim(){claimCalls++;throw new Error('observer must never claim');}
  };
  const seen=[];
  const observer=createCollectorLeaseObserver({leaseClient,onObservation:x=>seen.push(x)});
  return {observer,seen,statusCalls:()=>statusCalls,claimCalls:()=>claimCalls};
}

test('vacant lease is observed without acquiring generation one',async()=>{
  const h=rig({value:null});
  const result=await h.observer.observe(line);
  assert.deepEqual(result,{schema:COLLECTOR_LEASE_OBSERVER_SCHEMA,mode:'observe_only',line_id:line,status:'vacant',authoritative:false,publication_fence:null,reason:'no_remote_lease'});
  assert.equal(h.statusCalls(),1);assert.equal(h.claimCalls(),0);
});

test('matching session/workstation produces diagnostic candidate only, never publication authority',async()=>{
  const h=rig();
  const result=await h.observer.observe(line);
  assert.equal(result.status,'same_workstation_candidate');
  assert.equal(result.authoritative,false);
  assert.equal(result.publication_fence,null);
  assert.equal(result.reason,'ownership_matches_but_server_expiry_not_proven_by_read');
  assert.deepEqual(result.candidate_fence,{
    schema:'central-mes-publication-fence-v1',line_id:line,owner_uid:'A',workstation_id:wsA,generation:4,fence:`${line}:4:${wsA}`
  });
  assert.equal(h.claimCalls(),0);
});

test('lease owned by another collector does not expose holder identity or fence',async()=>{
  const h=rig({value:lease({owner_uid:'B',workstation_id:wsB,owned_by_this_session:false,fence:`${line}:4:${wsB}`})});
  const result=await h.observer.observe(line);
  assert.equal(result.status,'held_by_other');
  assert.equal(result.publication_fence,null);
  assert.equal('candidate_fence' in result,false);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('owner_uid'),false);
  assert.equal(serialized.includes(wsB),false);
  assert.equal(h.claimCalls(),0);
});

test('read errors fail open for existing publication path and do not echo raw error details',async()=>{
  const secret='SECRET-FIRESTORE-DETAIL';
  const h=rig({error:new Error(secret)});
  const result=await h.observer.observe(line);
  assert.equal(result.status,'unavailable');
  assert.equal(result.authoritative,false);
  assert.equal(result.publication_fence,null);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(h.claimCalls(),0);
});

test('observer callback cannot break observation and observer exposes no claim/takeover API',async()=>{
  const leaseClient={status:async()=>null,claim:async()=>{throw new Error('must not run');}};
  const observer=createCollectorLeaseObserver({leaseClient,onObservation(){throw new Error('diagnostic sink failed');}});
  assert.equal(typeof observer.claim,'undefined');
  assert.equal(typeof observer.takeover,'undefined');
  assert.equal(typeof observer.renew,'undefined');
  assert.equal(typeof observer.release,'undefined');
  assert.equal(observer.activation,'observe_only_no_claim_no_publication_fence_no_enforcement');
  assert.equal((await observer.observe(line)).status,'vacant');
});

test('invalid line fails before any remote read',async()=>{
  let calls=0;
  const observer=createCollectorLeaseObserver({leaseClient:{status:async()=>{calls++;return null;}}});
  await assert.rejects(()=>observer.observe('Linha 1'),/Linha MES inválida/);
  assert.equal(calls,0);
});
