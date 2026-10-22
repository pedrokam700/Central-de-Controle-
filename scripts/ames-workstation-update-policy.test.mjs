import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyWorkstationReady,workstationUpdateNotice,PAIRING_CONTRACT_REVISION} from '../ames/data/workstation-update-policy.mjs';
const base={ok:true,ready:true,agent_version:'0.5.23',agent_build:'CANONICAL-R11-BATCH',
  pid:15212,workstation_pairing_flow:3};
test('real 0.5.36 flow=3 still requires a safe update; web SHA alone is not agent version',()=>{
  assert.deepEqual(classifyWorkstationReady(base),{state:'outdated',reason:'pairing_contract'});
  assert.equal(workstationUpdateNotice(classifyWorkstationReady(base)).required,true);
  assert.equal(PAIRING_CONTRACT_REVISION,4);
});
test('0.5.39 contract explicitly confirms corrected pairing, without requiring zip on a UI-only change',()=>{
  const probe=classifyWorkstationReady({...base,workstation_pairing_revision:4});
  assert.deepEqual(probe,{state:'detected'});
  assert.deepEqual(workstationUpdateNotice(probe),{kind:'agent_compatible',required:false,detail:''});
});
test('missing or unreachable loopback is NOT proof of old agent or data loss',()=>{
  for(const input of [null,{}, {ok:false}, {...base,pid:0}, {...base,agent_build:'FORGED'}]){
    assert.deepEqual(classifyWorkstationReady(input),{state:'unknown'});
    assert.equal(workstationUpdateNotice(classifyWorkstationReady(input)).required,false);
  }
});
test('public ready contract and live UI never offer an unverified browser update action',()=>{
  const py=fs.readFileSync('ames/agent/agent_hardened_entry.py','utf8');
  const prep=fs.readFileSync('ames/console-preparation.mjs','utf8');
  const client=fs.readFileSync('ames/agent-client.mjs','utf8');
  assert.match(py,/"workstation_pairing_revision": 4/);
  assert.match(prep,/data-agent-update-notice/);
  assert.match(prep,/client\.detectInstalled/);
  assert.match(prep,/OFFICIAL_UPDATE_HELP/);
  assert.match(client,/classifyWorkstationReady\(ready\)/);
  assert.doesNotMatch(prep,/client\.auxiliary\(['"]update['"]\)/);
  assert.doesNotMatch(prep,/Stop-Process|TerminateProcess|Reset-SQLite/);
});
