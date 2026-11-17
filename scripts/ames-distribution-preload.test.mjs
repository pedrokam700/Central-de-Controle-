// Never launch a builder: replace the underlying launcher with a sentinel
// BEFORE importing the preload, then invoke only an imaginary builder path.
import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
test('required distribution preload is already active in this process',()=>{
 assert.equal(globalThis[Symbol.for('central.no-distribution.active')],true,
  'RED: distribution preload is not demonstrably active');
});
test('active preload rejects a nonexistent simulated builder without launching it',()=>{
 assert.equal(globalThis[Symbol.for('central.no-distribution.active')],true,'preload missing; do not launch any process');
 assert.throws(()=>cp.spawnSync('node',['/synthetic-never-created/build-simulated.mjs']),/NO_DISTRIBUTION/);
});
test('preload blocks a simulated builder before it reaches the launcher',async()=>{
 const original=cp.spawnSync;let calls=0;
 cp.spawnSync=()=>{calls++;throw Error('SENTINEL_NO_PROCESS_LAUNCHED');};
 syncBuiltinESMExports();
 try{
  await import('./audit/no-distribution-guard.mjs?sentinel='+Date.now());
  assert.throws(()=>cp.spawnSync('node',['/synthetic-never-created/build-simulated.mjs']),/NO_DISTRIBUTION/);
  assert.equal(calls,0);
 }finally{cp.spawnSync=original;syncBuiltinESMExports();}
});
