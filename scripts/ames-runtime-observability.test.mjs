import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeDiagnostics} from '../ames/console-monitor-runtime.mjs';

test('runtime observability summarizes only sanitized operational state',()=>{
  const result=runtimeDiagnostics({
    status:'connected',
    error:'',
    readiness:{python:true,dependencies:true,playwright:false,sqlite:true},
    runtime:{
      scheduler:{policy:'fifo-monitor-skip-v1'},
      setup_complete:true,
      candidate_version:'0.5.25-rc1',
      latest_snapshot_id:42,
      network_guardian:{status:'healthy'},
      secret_token:'must-not-appear'
    }
  },[
    {snapshot:'41',freshness:'fresh'},
    {snapshot:'42',freshness:'stale'},
    {snapshot:null,freshness:'unknown'},
  ]);
  assert.deepEqual(result,{
    scheduler:'fifo-monitor-skip-v1',
    preflight:{ok:3,known:4,total:4},
    setupComplete:true,
    candidateVersion:'0.5.25-rc1',
    latestSnapshotId:42,
    guardian:'healthy',
    freshLines:1,
    staleLines:1,
    missingLines:1,
    error:'',
  });
  assert.equal(JSON.stringify(result).includes('must-not-appear'),false);
});

test('runtime observability fails closed when health fields are unknown',()=>{
  const result=runtimeDiagnostics({status:'disconnected',readiness:null,runtime:null,error:'offline'},[
    {snapshot:null,freshness:'unknown'},
    {snapshot:null,freshness:'unknown'},
    {snapshot:null,freshness:'unknown'},
  ]);
  assert.equal(result.scheduler,null);
  assert.deepEqual(result.preflight,{ok:0,known:0,total:4});
  assert.equal(result.setupComplete,false);
  assert.equal(result.latestSnapshotId,null);
  assert.equal(result.guardian,null);
  assert.equal(result.freshLines,0);
  assert.equal(result.staleLines,0);
  assert.equal(result.missingLines,3);
  assert.equal(result.error,'offline');
});
