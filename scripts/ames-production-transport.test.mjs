import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {projectAgentRows} from '../ames/data/agent-contract.mjs';
import {publication} from '../ames/sync.mjs';
import {createAmesStore} from '../ames/data/store.mjs';

test('real SQLite revision survives API projection, publication and second-PC normalization',async()=>{
  const script=fileURLToPath(new URL('./agent-production-trust.test.py',import.meta.url));
  const payload=JSON.parse(execFileSync(process.env.PYTHON_BIN||'python',[script,'--json'],{encoding:'utf8'}));
  const ctx=payload.process_contexts[0];
  const projected=projectAgentRows([ctx],payload.line_id,payload.snapshot_id)[0];
  assert.equal(projected.production_shift_source,'3022');
  assert.equal(projected.return_station_code,'A5240');
  payload.process_contexts[0]={...ctx,raw:{sensitive:'DO_NOT_SHARE'},details_json:'DO_NOT_SHARE',cookie:'DO_NOT_SHARE',token:'DO_NOT_SHARE',cdp:'DO_NOT_SHARE',wifi:'DO_NOT_SHARE'};
  const published=await publication('synthetic-user',payload);
  const wire=published.parts.join('');
  assert(!wire.includes('DO_NOT_SHARE'));
  const received=JSON.parse(wire),remote=createAmesStore();
  assert.deepEqual(remote.replaceLocalSnapshots([received]),[]);
  const normalized=normalizeCanonical(received);
  assert.equal(normalized.process_timeline.contexts[0].return_station_code,'A5240');
  assert.equal(normalized.occurrences[0].production_shift,'2nd Shift');
  assert.equal(normalized.occurrences[0].repair_evidence_3012[0].repair_comment,'Updated comment');
  assert.equal(received.datasets.defects[0].raw_ref,payload.datasets.defects[0].raw_ref);
  assert.equal(received.source_id,payload.source_id);
  assert.equal(received.snapshot_revision,payload.snapshot_revision);
  for(const mutation of [{line:'TAN10102'},{snapshot_id:'999'},{snapshot_revision:999}]){
    const invalid=structuredClone(received);Object.assign(invalid.process_contexts[0],mutation);
    assert.throws(()=>normalizeCanonical(invalid),/Mixed process context identity/);
  }
});
