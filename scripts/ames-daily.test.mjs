import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAmesStore } from '../ames/data/store.mjs';
import { selectDaily } from '../ames/data/daily.mjs';
import { productFixture } from './ames-fixtures.mjs';
test('daily isolates line and exact CPH without assigning a snapshot to shift/date or manual tasks',()=>{
  const s=createAmesStore();s.replaceRemoteDocuments([productFixture(),productFixture('TAN10102',10)]);
  const m=selectDaily(s,{line_id:'TAN10101',product:'CPH2859V'});
  assert.equal(m.rows.length,30);assert(m.rows.every(r=>r.product_key==='CPH2859V'&&r.line_id==='TAN10101'));
  assert.equal(m.period,null);assert.equal(m.shift,null);assert.equal(m.affects_manual_tasks,false);
  assert.equal(m.coverage.status,'partial');assert.deepEqual(m.aggregates,[]);
  assert.equal(selectDaily(s,{line_id:'TAN10102'}).rows.length,10);
  assert.throws(()=>selectDaily(s,{}),/line/);
  s.clear();assert.equal(selectDaily(s,{line_id:'TAN10101'}).sample_metric.value,null);
});
