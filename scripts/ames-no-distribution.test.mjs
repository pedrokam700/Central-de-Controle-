import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoDistribution} from './audit/no-distribution-guard.mjs';
test('test guard refuses builder invocations before launching any child process',()=>{
 for(const script of ['scripts/build-static.mjs','scripts/build-r12-migration-bundle.py','scripts/stage-vercel.mjs','tools/ames-workstation/capture-r12-engine.py']){
  assert.throws(()=>assertNoDistribution('python3',[script]),/NO_DISTRIBUTION/);
 }
 assert.doesNotThrow(()=>assertNoDistribution('python3',['scripts/agent-canonical.test.py']));
});
