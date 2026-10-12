import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSessionFlight,AUTH_SESSION_FLIGHT_SCHEMA} from '../core/auth-session-flight.mjs';

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

test('same UID shares one exact in-flight initialization',async()=>{
  const flight=createAuthSessionFlight();
  const gate=deferred();
  let runs=0;
  const first=flight.run('uid-a',async()=>{runs++;return gate.promise;});
  const second=flight.run('uid-a',async()=>{runs++;return 'duplicate';});
  assert.equal(first,second);
  assert.equal(runs,0,'task begins on the next microtask');
  await Promise.resolve();
  assert.equal(runs,1);
  assert.deepEqual(flight.status(),{schema:AUTH_SESSION_FLIGHT_SCHEMA,active:true});
  gate.resolve('ready');
  assert.equal(await first,'ready');
  assert.equal(flight.status().active,false);
});

test('older UID settling cannot clear a newer active session flight',async()=>{
  const flight=createAuthSessionFlight();
  const oldGate=deferred();
  const newGate=deferred();
  const old=flight.run('uid-old',()=>oldGate.promise);
  const current=flight.run('uid-new',()=>newGate.promise);
  assert.notEqual(old,current);
  oldGate.resolve('old-ready');
  assert.equal(await old,'old-ready');
  assert.equal(flight.status().active,true,'old completion must not clear newer flight');
  const duplicateCurrent=flight.run('uid-new',()=>Promise.resolve('must-not-run'));
  assert.equal(duplicateCurrent,current);
  newGate.resolve('new-ready');
  assert.equal(await current,'new-ready');
  assert.equal(flight.status().active,false);
});

test('rejection clears only its own active flight and allows retry',async()=>{
  const flight=createAuthSessionFlight();
  await assert.rejects(flight.run('uid-a',()=>Promise.reject(new Error('profile failed'))),/profile failed/);
  assert.equal(flight.status().active,false);
  assert.equal(await flight.run('uid-a',()=>Promise.resolve('retry-ok')),'retry-ok');
});

test('invalid UID or task fails closed before starting work',()=>{
  const flight=createAuthSessionFlight();
  assert.throws(()=>flight.run('',()=>{}),/non-empty uid/);
  assert.throws(()=>flight.run('uid-a',null),/task function/);
  assert.equal(flight.status().active,false);
});
