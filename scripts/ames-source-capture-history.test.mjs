import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceCaptureEligibility,validateSourceCapturePage} from '../ames/console-source-capture-history.mjs';

const origin='ORIGIN-A',hash='c'.repeat(64);
const period={mode:'custom',start_at:'2026-10-16T07:00',end_at:'2026-10-17T07:00'};
const payload={line_id:'TAN10103',source_id:origin,snapshot_id:'17',
  snapshot_revision:2,content_hash:hash,summary:{period}};
const entry={line_id:'TAN10103',source_id:origin,snapshot_id:17,
  snapshot_revision:2,history_source:'local'};
const agent={status:'connected',capabilities:{source_id:origin}};
const identity=sourceCaptureEligibility(payload,entry,agent);

test('only exact immutable selected revision from matching local agent may list captures',()=>{
  assert.equal(identity.state,'ready');
  assert.deepEqual(identity.params,{snapshot_id:17,line_id:'TAN10103',
    snapshot_revision:2,content_hash:hash});
});
test('shared, offline or mismatched workstation cannot read a different localhost',()=>{
  assert.equal(sourceCaptureEligibility(payload,{...entry,history_source:'shared'},agent).state,'shared');
  assert.equal(sourceCaptureEligibility(payload,entry,{status:'disconnected'}).state,'offline');
  assert.equal(sourceCaptureEligibility(payload,entry,{status:'connected',capabilities:{source_id:'B'}}).state,'foreign');
});
test('bad snapshot, revision, hash, line or missing time scope is blocked',()=>{
  for(const bad of [{...payload,snapshot_id:'wrong'},{...payload,snapshot_revision:0},
    {...payload,content_hash:'bad'},{...payload,line_id:'OTHER'},
    {...payload,summary:{period:{}}}]){
    assert.equal(sourceCaptureEligibility(bad,entry,agent).state,'invalid');
  }
  assert.equal(sourceCaptureEligibility(payload,{...entry,source_id:'B'},agent).state,'invalid');
});
test('metadata response must match immutable source, period and false completeness',()=>{
  const row={source_id:origin,source_view:'3074',source_status:'partial',
    period_start:period.start_at,period_end:period.end_at,period_mode:period.mode,
    local_only:true,source_complete:false,population_complete:false};
  const page={schema:'ames-local-source-capture-v1',source_id:origin,
    metadata_only:true,local_only:true,source_complete:false,period,items:[row]};
  assert.equal(validateSourceCapturePage(page,identity),page);
  for(const bad of [
    {...page,source_id:'B'},{...page,period:{...period,start_at:'2026-10-18T07:00'}},
    {...page,items:[{...row,population_complete:true}]},
    {...page,items:[{...row,source_id:'B'}]},
    {...page,items:[{...row,source_view:'3012'}]},
    {...page,metadata_only:false}]){
    assert.throws(()=>validateSourceCapturePage(bad,identity),/capture_identity_mismatch/);
  }
});
test('an empty metadata page is not proof of no failed materials',()=>{
  const p={schema:'ames-local-source-capture-v1',source_id:origin,
    metadata_only:true,local_only:true,source_complete:false,period,items:[]};
  assert.equal(validateSourceCapturePage(p,identity).items.length,0);
  assert.equal(p.source_complete,false);
});
