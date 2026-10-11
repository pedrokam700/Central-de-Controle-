import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedFirestoreClient,FIRESTORE_GUARDED_CLIENT_SCHEMA} from '../core/firestore-guarded-client.mjs';

const ref=path=>({path});
const caps=(level={})=>({active:true,...level});

function harness({actor='u1',capabilities=null}={}){
  const calls=[];
  let actorUid=actor,currentCapabilities=capabilities;
  const batchCalls=[];
  const rawBatch={
    set(...args){batchCalls.push(['set',...args]);return rawBatch;},
    update(...args){batchCalls.push(['update',...args]);return rawBatch;},
    delete(...args){batchCalls.push(['delete',...args]);return rawBatch;},
    commit(){batchCalls.push(['commit']);return Promise.resolve('committed');}
  };
  const client=createGuardedFirestoreClient({
    rawAddDoc:(...args)=>{calls.push(['addDoc',...args]);return 'add';},
    rawSetDoc:(...args)=>{calls.push(['setDoc',...args]);return 'set';},
    rawUpdateDoc:(...args)=>{calls.push(['updateDoc',...args]);return 'update';},
    rawDeleteDoc:(...args)=>{calls.push(['deleteDoc',...args]);return 'delete';},
    rawWriteBatch:database=>{calls.push(['writeBatch',database]);return rawBatch;},
    getActorUid:()=>actorUid,
    getCapabilities:()=>currentCapabilities
  });
  return {client,calls,batchCalls,setActor:value=>{actorUid=value;},setCapabilities:value=>{currentCapabilities=value;}};
}

test('client exposes stable schema and allows self profile bootstrap with null capabilities',()=>{
  const {client,calls}=harness();
  assert.equal(client.schema,FIRESTORE_GUARDED_CLIENT_SCHEMA);
  assert.equal(client.setDoc(ref('users/u1'),{name:'Pedro'}),'set');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'setDoc');
});

test('viewer is blocked from operational technical and admin writes before raw call',()=>{
  const {client,calls}=harness({capabilities:caps()});
  assert.throws(()=>client.addDoc(ref('reports'),{}),e=>e?.code==='app/capability-required'&&e.required_capability==='write_operational');
  assert.throws(()=>client.updateDoc(ref('products/p1'),{x:1}),e=>e?.required_capability==='write_technical');
  assert.throws(()=>client.deleteDoc(ref('workShifts/s1')),e=>e?.required_capability==='administer');
  assert.equal(calls.length,0);
});

test('operator engineer and admin preserve capability matrix and options',()=>{
  const h=harness({capabilities:caps({write_operational:true})});
  assert.equal(h.client.addDoc(ref('reports'),{x:1}),'add');
  assert.throws(()=>h.client.setDoc(ref('products/p1'),{x:1}),/write_technical/);
  h.setCapabilities(caps({write_operational:true,write_technical:true}));
  const options={merge:true};
  assert.equal(h.client.setDoc(ref('products/p1'),{x:2},options),'set');
  h.setCapabilities(caps({write_operational:true,write_technical:true,administer:true}));
  assert.equal(h.client.deleteDoc(ref('workShifts/s1')),'delete');
  assert.deepEqual(h.calls.at(-2),['setDoc',ref('products/p1'),{x:2},options]);
});

test('actor and capabilities are read dynamically rather than captured at construction',()=>{
  const h=harness({actor:'u1',capabilities:null});
  h.client.setDoc(ref('users/u1'),{name:'one'});
  h.setActor('u2');
  assert.throws(()=>h.client.setDoc(ref('users/u1'),{name:'two'}),/administer/);
  h.setCapabilities(caps({administer:true}));
  assert.equal(h.client.setDoc(ref('users/u1'),{name:'admin'}),'set');
});

test('unknown collections fail closed',()=>{
  const {client,calls}=harness({capabilities:caps({write_operational:true,write_technical:true,administer:true})});
  assert.throws(()=>client.setDoc(ref('unreviewed/x'),{}),/não registrada/);
  assert.equal(calls.length,0);
});

test('guarded batch checks every mutation, preserves fluent API and commits raw batch only after checks',async()=>{
  const h=harness({capabilities:caps({write_operational:true,write_technical:true})});
  const batch=h.client.writeBatch('db');
  assert.equal(batch.set(ref('reports/r1'),{x:1}),batch);
  assert.equal(batch.update(ref('products/p1'),{y:2}),batch);
  assert.throws(()=>batch.delete(ref('routineExecutions/e1')),/administer/);
  assert.equal(await batch.commit(),'committed');
  assert.deepEqual(h.batchCalls.map(x=>x[0]),['set','update','commit']);
});

test('invalid batch implementation fails closed',()=>{
  const client=createGuardedFirestoreClient({
    rawAddDoc(){},rawSetDoc(){},rawUpdateDoc(){},rawDeleteDoc(){},rawWriteBatch:()=>({}),
    getActorUid:()=> 'u1',getCapabilities:()=>caps({administer:true})
  });
  assert.throws(()=>client.writeBatch('db'),/invalid batch/);
});
