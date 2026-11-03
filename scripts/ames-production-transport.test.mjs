import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {projectAgentRows} from '../ames/data/agent-contract.mjs';
import {publication} from '../ames/sync.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
import {buildReuseCohorts} from '../ames/data/reuse-cohorts.mjs';

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

test('period revision preserves proven 3074 material use and part number in Falhas and Reuso',async()=>{
  const line='TAN10103',source=productFixture(line,1),old=canonicalAgentFixture(source);
  old.summary.period={mode:'custom',start_at:'2026-10-30T07:00-03:00',end_at:'2026-10-31T07:00-03:00'};
  const defect=old.datasets.defects[0];defect.defect_key='PROVEN-DEFECT';
  const material={line,line_id:line,snapshot_id:old.snapshot_id,snapshot_revision:1,
    record_id:'PROVEN-3074',source_view:'3074',current_pcba_sn:defect.pcba_sn,
    current_defect_key:defect.defect_key,item_sn:'PHYSICAL-LCD',item_type:'LCD',
    part_number:'LCD-REAL-PN',previous_pcbas_json:'["PREVIOUS-BOARD"]',
    material_use_index:2};
  old.datasets.material_reuse.push(material);
  old.coverage.material_reuse.stored_total=1;
  const newer=structuredClone(old);newer.snapshot_revision=2;newer.content_hash='2'.repeat(64);
  for(const rows of Object.values(newer.datasets))for(const row of rows)row.snapshot_revision=2;
  old.datasets.material_reuse[0].material_use_index=undefined;

  const store=createAmesStore();
  store.selectReadingPeriod('custom',{start:'2026-10-30T07:00',end:'2026-10-31T07:00'});
  assert(store.installHistoricalSnapshot(old,{source:'local'}));
  assert.equal(buildReuseCohorts(store.read(line).snapshot).components.counts.reused,0);
  assert(store.installHistoricalSnapshot(newer,{source:'local'}));
  const read=store.read(line),snapshot=read.snapshot,cohorts=buildReuseCohorts(snapshot);
  assert.equal(snapshot.canonical.snapshot_revision,2);
  assert.equal(snapshot.occurrences.length,1,'Falhas keeps the selected 3028 occurrence');
  assert.equal(snapshot.material_trace.records[0].material_use_index,2);
  assert.equal(snapshot.material_trace.records[0].part_number,'LCD-REAL-PN');
  assert.equal(cohorts.components.counts.observed,1);
  assert.equal(cohorts.components.counts.second_use,1,'Reuso reads the same selected revision');
  assert.equal(cohorts.components.rows[0].evidence[0].snapshot_revision,2);
  assert.equal(buildReuseCohorts(snapshot,{part_number:'WRONG'}).components.counts.observed,0);
  assert.equal(buildReuseCohorts(snapshot,{part_number:'LCD-REAL-PN'}).components.counts.observed,1);
  assert.equal(store.read(line).reading_period.mode,'custom');
  const published=await publication('synthetic-user',newer),transmitted=JSON.parse(published.parts.join(''));
  const otherWorkstation=createAmesStore();
  otherWorkstation.selectReadingPeriod('custom',{start:'2026-10-30T07:00',end:'2026-10-31T07:00'});
  assert(otherWorkstation.installHistoricalSnapshot(transmitted,{source:'remote'}));
  assert.equal(buildReuseCohorts(otherWorkstation.read(line).snapshot).components.counts.second_use,1,
    'The same material ordinal must survive the shared immutable revision');
  assert.equal(otherWorkstation.read(line).snapshot.occurrences.length,1);
  // This is an observed component, not proof of a complete 3074 population.
  assert.equal(cohorts.components.population_coverage,'unproven');
});
