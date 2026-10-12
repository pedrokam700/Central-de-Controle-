import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorFenceConfirmation,COLLECTOR_FENCE_CONFIRMATION_SCHEMA} from '../ames/collector-fence-confirmation.mjs';

const line='TAN10101',ws='ws_'+'a'.repeat(32);
const observation=status=>({line_id:line,status,authoritative:false,publication_fence:null});

function rig({confirmResult=null,confirmError=null}={}){
  let confirms=0,claims=0,takeovers=0;
  const leaseClient={
    async confirmOwned(requested){confirms++;assert.equal(requested,line);if(confirmError)throw confirmError;return confirmResult||{action:'confirm',authoritative:true,line_id:line,owner_uid:'A',workstation_id:ws,generation:4,fence:`${line}:4:${ws}`};},
    async claim(){claims++;throw new Error('must not claim');},
    async takeover(){takeovers++;throw new Error('must not takeover');}
  };
  return {coordinator:createCollectorFenceConfirmation({leaseClient}),confirms:()=>confirms,claims:()=>claims,takeovers:()=>takeovers};
}

test('only same_workstation_candidate invokes confirmOwned',async()=>{
  for(const status of ['vacant','held_by_other','unavailable']){
    const h=rig();const out=await h.coordinator.confirm(observation(status));
    assert.equal(out.schema,COLLECTOR_FENCE_CONFIRMATION_SCHEMA);
    assert.equal(out.status,'not_candidate');assert.equal(out.authoritative,false);assert.equal(out.publication_fence,null);
    assert.equal(h.confirms(),0);assert.equal(h.claims(),0);assert.equal(h.takeovers(),0);
  }
});

test('server-confirmed same workstation returns normalized authoritative publication fence',async()=>{
  const h=rig();const out=await h.coordinator.confirm(observation('same_workstation_candidate'));
  assert.equal(h.confirms(),1);assert.equal(h.claims(),0);assert.equal(h.takeovers(),0);
  assert.equal(out.status,'confirmed');assert.equal(out.authoritative,true);
  assert.deepEqual(out.publication_fence,{schema:'central-mes-publication-fence-v1',line_id:line,owner_uid:'A',workstation_id:ws,generation:4,fence:`${line}:4:${ws}`});
});

test('not-current and not-owned responses never yield a fence and do not retry',async()=>{
  for(const code of ['collector/lease-not-current','collector/lease-not-owned']){
    const h=rig({confirmError:Object.assign(new Error('denied'),{code})});
    const out=await h.coordinator.confirm(observation('same_workstation_candidate'));
    assert.equal(out.status,'not_confirmed');assert.equal(out.authoritative,false);assert.equal(out.publication_fence,null);
    assert.equal(h.confirms(),1);assert.equal(h.claims(),0);assert.equal(h.takeovers(),0);
  }
});

test('infrastructure confirmation failure is sanitized and never leaks error details',async()=>{
  const secret='SECRET-FIRESTORE-DETAIL';
  const h=rig({confirmError:Object.assign(new Error(secret),{code:'unavailable'})});
  const out=await h.coordinator.confirm(observation('same_workstation_candidate'));
  assert.equal(out.status,'unavailable');assert.equal(out.publication_fence,null);
  assert.equal(JSON.stringify(out).includes(secret),false);
  assert.equal(h.confirms(),1);assert.equal(h.claims(),0);assert.equal(h.takeovers(),0);
});

test('malformed confirmation fence fails closed as unavailable',async()=>{
  const h=rig({confirmResult:{action:'confirm',authoritative:true,line_id:line,owner_uid:'A',workstation_id:ws,generation:4,fence:'tampered'}});
  const out=await h.coordinator.confirm(observation('same_workstation_candidate'));
  assert.equal(out.status,'unavailable');assert.equal(out.publication_fence,null);assert.equal(out.authoritative,false);
});

test('coordinator exposes no acquisition API and remains runtime-dormant',()=>{
  const h=rig();
  assert.equal(typeof h.coordinator.claim,'undefined');assert.equal(typeof h.coordinator.takeover,'undefined');assert.equal(typeof h.coordinator.renew,'undefined');
  assert.equal(h.coordinator.activation,'gated_same_workstation_confirmation_no_claim_no_takeover_runtime_not_wired');
});
