import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DATASETS} from '../ames/data/canonical.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {fencingToken,COLLECTOR_LEASE_SCHEMA} from '../ames/data/collector-authority.mjs';
import {
  PUBLICATION_FENCE_SCHEMA,normalizePublicationFence,publicationFenceStatus,publicationFenceContract
} from '../ames/data/publication-fence.mjs';
import {publication,createMesSync} from '../ames/sync.mjs';

const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const fence=(generation=4,overrides={})=>({
  line_id:'TAN10101',owner_uid:'A',workstation_id:wsA,generation,
  fence:fencingToken({line:'TAN10101',generation,workstationId:wsA}),
  ...overrides
});
const lease=(generation=4,overrides={})=>({
  schema:COLLECTOR_LEASE_SCHEMA,line_id:'TAN10101',owner_uid:'A',workstation_id:wsA,generation,renewed_at_ms:10_000,
  ...overrides
});
function canonicalFixture(){
  const line='TAN10101',product='CPH2859V';
  const p={schema:'central-ames-v2',schema_version:2,source_id:'source',snapshot_id:'1',snapshot_revision:1,content_hash:'hash',line_id:line,collected_at:'2026-10-09T10:00:00Z',source_view:'3028',summary:{line,snapshot_id:'1',collected_at:'2026-10-09T10:00:00Z',defect_rows:1},datasets:Object.fromEntries(DATASETS.map(n=>[n,[]])),coverage:{},capabilities:{process_timeline:false}};
  const common={line,line_id:line,snapshot_id:'1',snapshot_revision:1,pcba_sn:'P',product,raw_ref:'sqlite:record',provenance:{contexts:[{line_id:line,pcba_sn:'P',product}],line_candidates:[line]}};
  p.datasets.defects=[{...common,record_id:'D1',occurrence_id:'O1',product_model:product,defect_code:'D',defect_time:p.collected_at}];
  for(const name of DATASETS)p.coverage[name]={stored_total:p.datasets[name].length,transport_complete:true,source_complete:false,status:name==='process_timeline'?'not_collected':'partial'};
  return p;
}

test('publication fence binds exact line owner workstation generation and deterministic token',()=>{
  const normalized=normalizePublicationFence(fence(),{line:'TAN10101',ownerUid:'A'});
  assert.equal(normalized.schema,PUBLICATION_FENCE_SCHEMA);
  assert.equal(normalized.line_id,'TAN10101');
  assert.equal(normalized.owner_uid,'A');
  assert.equal(normalized.workstation_id,wsA);
  assert.equal(normalized.generation,4);
  assert.equal(normalized.fence,`TAN10101:4:${wsA}`);
  assert.throws(()=>normalizePublicationFence(fence(4,{line_id:'TAN10102'}),{line:'TAN10101',ownerUid:'A'}),/outra linha/);
  assert.throws(()=>normalizePublicationFence(fence(4,{owner_uid:'B'}),{line:'TAN10101',ownerUid:'A'}),/outro usuário/);
  assert.throws(()=>normalizePublicationFence(fence(4,{workstation_id:'invalid'}),{line:'TAN10101',ownerUid:'A'}),/workstation_id/);
  assert.throws(()=>normalizePublicationFence(fence(4,{fence:'tampered'}),{line:'TAN10101',ownerUid:'A'}),/divergente/);
});

test('fence status distinguishes unfenced unknown current and stale without enforcing transport',()=>{
  assert.deepEqual(publicationFenceStatus(null,lease(),{ownerUid:'A'}),{status:'unfenced',authoritative:false,reason:'publication_has_no_fence'});
  const unknown=publicationFenceStatus(fence(),null,{ownerUid:'A'});assert.equal(unknown.status,'unknown');assert.equal(unknown.authoritative,false);
  const current=publicationFenceStatus(fence(),lease(),{ownerUid:'A'});assert.equal(current.status,'current');assert.equal(current.authoritative,true);
  const old=publicationFenceStatus(fence(4),lease(5),{ownerUid:'A'});assert.equal(old.status,'stale');assert.equal(old.authoritative,false);
  const otherWs=publicationFenceStatus(fence(4),lease(4,{workstation_id:wsB}),{ownerUid:'A'});assert.equal(otherWs.status,'stale');
  const otherOwner=publicationFenceStatus(fence(4),lease(4,{owner_uid:'B'}),{ownerUid:'A'});assert.equal(otherOwner.status,'stale');
  assert.equal(publicationFenceContract().activation,'metadata_ready_runtime_enforcement_disabled');
});

test('unfenced publication remains backward-compatible while fenced generations get distinct identities',async()=>{
  const payload=canonicalFixture();
  const legacyA=await publication('A',payload),legacyB=await publication('A',payload);
  assert.equal(legacyA.id,legacyB.id);assert.equal(legacyA.head.collector_fence,undefined);
  const generation4=await publication('A',payload,{collectorFence:fence(4)});
  const generation4Again=await publication('A',payload,{collectorFence:fence(4)});
  const generation5=await publication('A',payload,{collectorFence:fence(5)});
  assert.equal(generation4.id,generation4Again.id);
  assert.notEqual(generation4.id,legacyA.id);
  assert.notEqual(generation4.id,generation5.id);
  assert.equal(generation4.head.collector_fence.generation,4);
  assert.equal(generation5.head.collector_fence.generation,5);
  assert.throws(()=>publication('A',payload,{collectorFence:fence(4,{line_id:'TAN10102'})}),/outra linha/);
});

test('optional sync fence provider recaptures unchanged MES content when authority generation changes',async()=>{
  const pending=new Map();let generation=4;
  const queue={put:async e=>pending.set(e.id,e),list:async uid=>[...pending.values()].filter(e=>e.uid===uid),remove:async id=>pending.delete(id)};
  const remote={watch:()=>()=>{},putPart:async()=>{},commitHead:async()=>{},getPart:async()=>{throw new Error('not used');}};
  const store=createAmesStore();store.replaceLocalSnapshots([canonicalFixture()]);store.setLocalConnected(true);
  const sync=createMesSync(store,remote,{queue,online:()=>false,collectorFenceForLine:async line=>fence(generation,{line_id:line})});
  sync.start('A');await sync.capture();
  assert.equal(pending.size,1);const first=[...pending.values()][0];assert.equal(first.head.collector_fence.generation,4);
  await sync.capture();assert.equal(pending.size,1);
  generation=5;await sync.capture();assert.equal(pending.size,2);
  const generations=[...pending.values()].map(x=>x.head.collector_fence.generation).sort();assert.deepEqual(generations,[4,5]);
  sync.stop();
});

test('offline shell precaches publication fence imported by sync',()=>{
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(sw,/ames\/data\/publication-fence\.mjs/);
});
