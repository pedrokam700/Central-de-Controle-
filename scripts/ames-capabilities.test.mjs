import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENT_CAPABILITIES, traceDimensions } from '../ames/data/capabilities.mjs';
import { readRelease } from '../ames/data/onboarding.mjs';
import { createAmesStore } from '../ames/data/store.mjs';
import { productFixture } from './ames-fixtures.mjs';
const release=JSON.parse(fs.readFileSync('ames/releases/latest/release.json','utf8'));

test('runtime documentado identifica somente o agente e nunca concede capacidade por localização', () => {
  const m=readRelease(release);
  // GitHub Release was published with the SHA/ZIP verified; it does not grant
  // agent capabilities or MES network access to a viewing workstation.
  assert.equal(m.package_available,true);
  assert.equal(m.validated_sha,'e60cef8d4f033c4654b3fb730573e1ecfdd174bd');
  assert.equal(m.download_url,'https://github.com/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.25-factory-20261020/AMES_Central_CLEAN_e60cef8d.zip');
  assert.match(m.sha256,/^[a-f0-9]{64}$/);
  assert.equal(m.local_runtime.agent_health_url,'http://127.0.0.1:8765/api/v1/health');
  assert.equal(m.local_runtime.start_file,'INICIAR_POSTO_CENTRAL_V2.bat');
  assert.equal(AGENT_CAPABILITIES.reference_version,'0.5.23');
  assert.equal(AGENT_CAPABILITIES.collection_blocker,'requires_fifo_monitor_skip_v1_agent');
  for(const key of ['can_detect','can_collect','can_configure','can_read_progress'])assert.equal(AGENT_CAPABILITIES[key],false);

  for(const agent_health_url of [
    'https://example.com/',
    'http://127.0.0.1:8765/',
    'http://127.0.0.1:8765/api/v1',
    'http://user:pw@127.0.0.1:8765/api/v1/health',
    'http://127.0.0.1:8765/api/v1/health?secret=x'
  ]) assert.throws(()=>readRelease({...release,local_runtime:{...release.local_runtime,agent_health_url}}));

  assert.equal(readRelease({...release,local_runtime:undefined}).local_runtime,null);
  const sanitized=readRelease({...release,local_runtime:{...release.local_runtime,endpoint:'/invented',password:'secret'}}).local_runtime;
  assert.equal(sanitized.endpoint,undefined);assert.equal(sanitized.password,undefined);
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
