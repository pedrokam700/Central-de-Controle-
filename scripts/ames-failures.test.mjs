import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAmesStore, clearSessionData } from '../ames/data/store.mjs';
import { immutable } from '../ames/data/contract.mjs';
import { selectFailures } from '../ames/data/failures.mjs';
import { productFixture } from './ames-fixtures.mjs';

const line = 'TAN10101';
const setup = (...docs) => { const s=createAmesStore(); s.replaceRemoteDocuments(docs); return s; };
test('Falhas keeps Manual and MES separate without mutating or converting manual cases/reports', () => {
  const state = { ames:setup(productFixture()), reports:immutable([{id:'R1',product:'CPH2859V'}]),
    operationalFailures:immutable([{id:'F1',product:'CPH2859V',pcba_sn:'SYNTHETIC-PCBA-0'}]) };
  const before=JSON.stringify([state.reports,state.operationalFailures]);
  const m=selectFailures(state.ames,{line_id:line,product:'CPH2859V'});
  assert.equal(m.origin,'MES'); assert.equal(m.rows.length,30);
  assert.equal(JSON.stringify([state.reports,state.operationalFailures]),before);
  assert.equal(m.manual,undefined); assert.deepEqual(m.aggregates,[]);
});
test('Falhas uses exact canonical CPH2859 vs CPH2859V and requires one supported line', () => {
  const s=setup(productFixture());
  for(const product of ['2859v','CPH2859V']) {
    const m=selectFailures(s,{line_id:line,product});
    assert.equal(m.rows.length,30); assert(m.rows.every(r=>r.product_key==='CPH2859V'));
  }
  assert(selectFailures(s,{line_id:line,product:'CPH2859'}).rows.every(r=>r.product_key==='CPH2859'));
  for(const product of ['','CPH285','2859VX']) assert.equal(selectFailures(s,{line_id:line,product}).rows.length,0);
  assert.throws(()=>selectFailures(s,{}),/line/);
  assert.throws(()=>selectFailures(s,{line_id:'all'}),/line/);
});
test('same PCBA/defect across lines has distinct context and no combined metric', () => {
  const s=setup(productFixture(),productFixture('TAN10102',10));
  const a=selectFailures(s,{line_id:line}),b=selectFailures(s,{line_id:'TAN10102'});
  assert.equal(a.rows[0].pcba_sn,b.rows[0].pcba_sn); assert.equal(a.rows[0].defect_code,b.rows[0].defect_code);
  assert.notEqual(a.rows[0].evidence_ref,b.rows[0].evidence_ref);
  assert.equal(a.sample_metric.value,60); assert.equal(b.sample_metric.value,10);
});
test('partial/no-match/missing states never claim the complete universe', () => {
  const s=setup(productFixture());
  const m=selectFailures(s,{line_id:line});
  assert.equal(m.coverage.status,'partial'); assert.equal(m.coverage.exact_metric_drilldown,false);
  assert.equal(m.sample_metric.value,60); assert.equal(m.coverage.reported_count,200);
  const empty=selectFailures(s,{line_id:line,defect_code:'missing'});
  assert.equal(empty.sample_metric.value,0); assert.equal(empty.coverage.status,'partial');
  assert.equal(selectFailures(s,{line_id:'TAN10103'}).sample_metric.value,null);
});
test('no durable ID means no persistent link capability; duplicate snapshot rows are not globally deduplicated', () => {
  const d=productFixture(line,2); d.payload.defects.push({...d.payload.defects[0]});
  const s=setup(d); const first=selectFailures(s,{line_id:line});
  assert.equal(first.identity.persistent_link_allowed,false); assert.equal(first.identity.durable,false);
  assert(first.rows.every(r=>r.occurrence_id===null)); assert.equal(first.rows.length,3);
  assert.equal(new Set(first.sample_metric.evidence_refs).size,3);
  d.payload.summary.snapshot_id='NEXT'; s.replaceRemoteDocuments([d]);
  const next=selectFailures(s,{line_id:line});
  assert.equal(next.rows.length,3); assert.notEqual(first.rows[0].evidence_ref,next.rows[0].evidence_ref);
  assert.equal(typeof next.link,'undefined');
});
test('same-ID correction replaces the read; logout clears both sources and manual collections', () => {
  const d=productFixture(); const s=setup(d); const before=selectFailures(s,{line_id:line});
  d.payload.defects[0].defect_desc='corrected'; s.replaceRemoteDocuments([d]);
  const after=selectFailures(s,{line_id:line});
  assert.equal(after.snapshot.snapshot_id,before.snapshot.snapshot_id); assert.notEqual(after.snapshot,before.snapshot);
  assert.equal(after.rows[0].defect_desc,'corrected'); assert.notEqual(before.rows[0].defect_desc,'corrected');
  const state={ames:s,reports:[{id:'R1'}],operationalFailures:[{id:'F1'}]}; clearSessionData(state);
  assert.equal(selectFailures(s,{line_id:line}).source,'none'); assert.deepEqual(state.reports,[]); assert.deepEqual(state.operationalFailures,[]);
});
test('real Falhas shell reuses state.ames only in authenticated operations view', () => {
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const code=app.slice(app.indexOf('    let failuresMesView;'),app.indexOf('    function applyFailureOrigin()'));
  const s=setup(productFixture()); let created=0,renders=0;
  const ctx=vm.createContext({state:{ames:s},document:{querySelector:()=>({})},createOccurrenceView:(_,store,options)=>{
    assert.equal(store,s);assert.equal(options.mode,'failures');created++;return {render(){renders++;}};
  }});
  vm.runInContext('let currentAuthUser=null,activeView="operations",currentLanguage="pt-BR";\n'+code+'\nrenderFailuresMes();',ctx);
  assert.equal(created,0);
  vm.runInContext('currentAuthUser={uid:"test"};activeView="product";renderFailuresMes();',ctx);assert.equal(created,0);
  vm.runInContext('activeView="operations";renderFailuresMes();renderFailuresMes();',ctx);assert.equal(created,1);assert.equal(renders,2);
});
