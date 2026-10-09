import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENT_CAPABILITIES, traceDimensions } from '../ames/data/capabilities.mjs';
import { readRelease } from '../ames/data/onboarding.mjs';
import { createAmesStore } from '../ames/data/store.mjs';
import { productFixture } from './ames-fixtures.mjs';
const release=JSON.parse(fs.readFileSync('ames/releases/latest/release.json','utf8'));
test('documented package location never grants transport or collection capabilities', () => {
  const m=readRelease(release);
  assert.equal(m.local_runtime.console_url,'http://127.0.0.1:8765/');
  assert.equal(m.local_runtime.start_file,'00_INICIAR_AQUI.bat');
  assert.equal(AGENT_CAPABILITIES.reference_version,'0.5.23');
  assert.equal(AGENT_CAPABILITIES.collection_blocker,'requires_fifo_monitor_skip_v1_agent');
  for(const key of ['can_detect','can_collect','can_configure','can_read_progress'])assert.equal(AGENT_CAPABILITIES[key],false);
  for(const console_url of ['https://example.com/','http://127.0.0.1:8765/api/v1','http://user:pw@127.0.0.1:8765/','http://127.0.0.1:8765/?secret=x'])assert.throws(()=>readRelease({...release,local_runtime:{...release.local_runtime,console_url}}));
  assert.equal(readRelease({...release,local_runtime:undefined}).local_runtime,null);
  assert.equal(readRelease({...release,local_runtime:{...release.local_runtime,endpoint:'/health',password:'secret'}}).local_runtime.endpoint,undefined);
});
test('3074/2114 remain unavailable despite counts, uncontracted rows and Batch Count', () => {
  const store=createAmesStore(), doc=productFixture();
  doc.payload.summary.material_reuse_count=300;doc.payload.summary.pcba_history_count=400;
  doc.payload.material_trace={records:[{material_sn:'M',batch_count:20}]};doc.payload.pcba_history={records:[{pcba_sn:'P'}]};
  store.replaceRemoteDocuments([doc]); const ds=traceDimensions(store.read(doc.line).snapshot);
  assert.equal(ds[1].reported_count,300);assert.equal(ds[2].reported_count,400);
  assert.equal(ds[1].status,'unavailable');assert.equal(ds[2].status,'unavailable');assert.equal(ds[3].status,'not_collected');
  store.clear();assert(traceDimensions(store.read(doc.line).snapshot).every(d=>d.reported_count===null));
});
