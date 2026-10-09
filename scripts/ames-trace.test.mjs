import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAmesStore } from '../ames/data/store.mjs';
import { selectTrace } from '../ames/data/trace.mjs';
import { productFixture } from './ames-fixtures.mjs';

const line = 'TAN10101';
function setup() { const store=createAmesStore();store.replaceRemoteDocuments([productFixture(),productFixture('TAN10102')]);return store; }
test('trace requires line, exact CPH and PCBA; same SN on another line stays separate',()=>{
  const s=setup(),r=s.read(line).snapshot.occurrences[0];
  const q={line_id:line,product:r.product_key,pcba_sn:r.pcba_sn,evidence_ref:r.evidence_ref};
  assert.throws(()=>selectTrace(s,{...q,line_id:''}),/line/);
  const m=selectTrace(s,q);assert.equal(m.rows.length,1);assert(m.rows.every(x=>x.line_id===line));
  assert.equal(r.product_key,'CPH2859V');
  assert.equal(selectTrace(s,{...q,product:'CPH2859'}).rows.length,0);
  assert.equal(selectTrace(s,{...q,line_id:'TAN10102'}).status,'reference_unavailable');
  assert.equal(selectTrace(s,{...q,pcba_sn:'MATERIAL-SN'}).rows.length,0);
});
test('trace exposes unavailable dimensions, never reuse from summary or Batch Count',()=>{
  const s=setup(),r=s.read(line).snapshot.occurrences[0];
  const m=selectTrace(s,{line_id:line,product:r.product_key,pcba_sn:r.pcba_sn});
  assert.equal(m.coverage.status,'partial');assert.equal(m.material_sn,null);
  assert.equal(m.pcba_reuse,null);assert.equal(m.component_reuse,null);
  assert.deepEqual(m.dimensions.map(x=>x.status),['partial','unavailable','unavailable','not_collected']);
  assert.equal(m.process_rule,'last_valid_event_time_lte_defect_time');assert.equal(m.persistent_link_allowed,false);
});
test('trace invalidates even same-ID corrections and logout removes evidence',()=>{
  const s=setup(),before=s.read(line).snapshot,r=before.occurrences[0];
  const q={line_id:line,product:r.product_key,pcba_sn:r.pcba_sn,evidence_ref:r.evidence_ref};
  s.replaceRemoteDocuments([productFixture()]);
  assert.equal(selectTrace(s,q,before).status,'invalidated');assert.equal(selectTrace(s,q,before).rows.length,0);
  s.clear();assert.equal(selectTrace(s,{...q,evidence_ref:undefined}).status,'unavailable');
});
