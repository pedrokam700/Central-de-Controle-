import test from 'node:test';
import assert from 'node:assert/strict';
import {createMesSync,indexedQueue} from '../ames/sync.mjs';

const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function fixture(queue,remote={watch:()=>()=>{}}){
  let status={sync:{}};
  const store={
    agent:()=>status,
    updateAgent:patch=>{status={...status,...patch};},
    localCanonical:()=>[],
    replaceSyncedSnapshots:()=>{},
  };
  return createMesSync(store,remote,{queue,online:()=>true,schedule:()=>0,unschedule:()=>{}});
}

test('read-only outbox audit counts pending evidence across all users, without publishing',async()=>{
  let writes=0,enumerations=0;
  const sync=fixture({
    countAll:async()=>{enumerations++;return 3;},
    put:async()=>{writes++;},remove:async()=>{writes++;},list:async()=>[],
  });
  const report=await sync.inspectUpdateReadiness();
  assert.equal(enumerations,1);
  assert.equal(writes,0);
  assert.equal(report.pending_entries,3);
  assert.equal(report.reason,'pending_outbox_evidence');
  assert.equal(report.advisory_no_pending,false);
  assert.equal(report.update_authorized,false);
  assert.equal(report.multi_tab_attested,false);
  assert.equal(report.other_browser_profiles_attested,false);
});

test('zero entries is advisory only, never a multi-tab lease or install permission',async()=>{
  const sync=fixture({countAll:async()=>0});
  const report=await sync.inspectUpdateReadiness();
  assert.equal(report.pending_entries,0);
  assert.equal(report.advisory_no_pending,true);
  assert.equal(report.exclusive_lease_held,false);
  assert.equal(report.update_authorized,false);
  assert.equal(report.multi_tab_attested,false);
});

test('unavailable/unsupported/invalid IndexedDB observation fails closed',async()=>{
  for(const queue of [{},{countAll:async()=>{throw Error('permission-denied');}},{countAll:async()=>-1},{countAll:async()=>NaN}]){
    const result=await fixture(queue).inspectUpdateReadiness();
    assert.equal(result.pending_entries,null);
    assert.equal(result.reason,'browser_outbox_unavailable');
    assert.equal(result.advisory_no_pending,false);
    assert.equal(result.update_authorized,false);
  }
});

test('sign-out cannot hide an in-flight Firestore upload during the observation',async()=>{
  const held=deferred();
  let entered=0;
  const queue={
    countAll:async()=>0,
    list:async()=>[{id:'previous-uid-evidence',head:{snapshot_num:1,snapshot_revision:1},parts:['{}']}],
  };
  const remote={watch:()=>()=>{},putPart:async()=>{entered++;await held.promise;}};
  const sync=fixture(queue,remote);
  sync.start('old-user');
  for(let i=0;i<15&&!entered;i++)await wait();
  assert.equal(entered,1);
  sync.stop();
  const during=await sync.inspectUpdateReadiness();
  assert.equal(during.uploads_inflight,1);
  assert.equal(during.advisory_no_pending,false);
  held.resolve();
  for(let i=0;i<15;i++)await wait();
  const after=await sync.inspectUpdateReadiness();
  assert.equal(after.uploads_inflight,0);
  assert.equal(after.update_authorized,false);
});

test('sign-out cannot hide an in-flight capture waiting to finish',async()=>{
  const held=deferred();
  let listed=0;
  const queue={
    countAll:async()=>0,
    list:async()=>{listed++;return listed===1?[]:held.promise;},
  };
  const sync=fixture(queue);
  sync.start('previous-user');
  for(let i=0;i<10&&listed===0;i++)await wait();
  const capture=sync.capture();
  for(let i=0;i<10&&listed<2;i++)await wait();
  assert.equal(listed,2);
  sync.stop();
  const during=await sync.inspectUpdateReadiness();
  assert.equal(during.captures_inflight,1);
  assert.equal(during.advisory_no_pending,false);
  held.resolve([]);
  await capture;
  assert.equal((await sync.inspectUpdateReadiness()).captures_inflight,0);
});

test('session transition during async audit invalidates its stable observation',async()=>{
  const held=deferred();
  const sync=fixture({countAll:()=>held.promise,list:async()=>[]});
  const inspection=sync.inspectUpdateReadiness();
  sync.start('A');sync.stop();
  held.resolve(0);
  const result=await inspection;
  assert.equal(result.observation_stable,false);
  assert.equal(result.reason,'session_or_activity_changed_during_observation');
  assert.equal(result.advisory_no_pending,false);
  assert.equal(result.update_authorized,false);
});

test('cooperative fence refuses unsupported browsers without touching IndexedDB or pending evidence',async()=>{
  const queue=indexedQueue({lockManager:null});
  const result=await queue.withCooperativeMaintenanceFence();
  assert.equal(result.cooperative_fence_observed,false);
  assert.equal(result.reason,'browser_web_locks_unavailable');
  assert.equal(result.pending_entries,null);
  assert.equal(result.update_authorized,false);
  assert.equal(result.multi_tab_attested,false);
  assert.equal(result.other_browser_profiles_attested,false);
});

test('cooperative fence refuses a busy writer immediately and never runs an observer',async()=>{
  let requests=0,observations=0;
  const queue=indexedQueue({lockManager:{request:async(name,options,callback)=>{
    requests++;
    assert.equal(name,'central-ames-outbox-v2-cooperative-writer-v1');
    assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
    return callback(null);
  }}});
  const result=await queue.withCooperativeMaintenanceFence(async()=>{observations++;});
  assert.equal(requests,1);
  assert.equal(observations,0);
  assert.equal(result.reason,'cooperative_outbox_writer_busy');
  assert.equal(result.cooperative_fence_observed,false);
  assert.equal(result.update_authorized,false);
});
