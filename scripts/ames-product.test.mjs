import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LINE_IDS } from '../ames/data/contract.mjs';
import { createAmesStore, clearSessionData } from '../ames/data/store.mjs';
import { selectProduct, selectProductLine } from '../ames/data/product.mjs';
import { productFixture } from './ames-fixtures.mjs';

const setup = (...docs) => { const s = createAmesStore(); s.replaceRemoteDocuments(docs); return s; };
test('Produto matches canonical CPH2859V exactly, never base CPH2859, prefix, substring or empty', () => {
  const d = productFixture();
  d.payload.defects.push(...['CPH2859VX', 'XCPH2859V', '', 'CPH285'].map(product_model => ({ ...d.payload.defects[0], product_model })));
  const s = setup(d);
  for (const product of ['CPH2859V', '2859v', ' cph 2859 v ']) {
    const m = selectProduct(s, product);
    assert.equal(m.lines[0].metric.value, 30);
    assert.equal(m.lines[0].rows.every(row => row.product_key === 'CPH2859V'), true);
  }
  assert.equal(selectProduct(s, 'CPH2859').lines[0].metric.value, 30);
  for (const product of ['', null, undefined, {}, '2859V-extra']) {
    assert.equal(selectProduct(s, product).lines.every(line => line.rows.length === 0), true);
  }
});

test('Produto partitions identical SNs across lines without a combined metric or line aggregates', () => {
  const s = setup(productFixture(), productFixture(LINE_IDS[1], 10));
  const m = selectProduct(s, 'CPH2859V');
  assert.deepEqual(m.lines.map(line => line.metric.value), [30, 5, null]);
  assert.equal(m.metric, undefined);
  assert.notEqual(m.lines[0].metric.evidence_refs[0], m.lines[1].metric.evidence_refs[0]);
  for (const line of m.lines) {
    assert.equal(line.metric.fpy, undefined);
    assert.equal(line.metric.quantity, undefined);
    assert.equal(line.rows.every(row => row.line_id === line.scope.line_id && row.product_key === 'CPH2859V'), true);
  }
  assert.throws(() => selectProductLine(s, { product: 'CPH2859V' }), /line/);
});

test('Produto sample KPI resolves exactly to the loaded references, preserving partial coverage', () => {
  const s = setup(productFixture());
  const m = selectProductLine(s, { line_id: LINE_IDS[0], product: 'CPH2859V' });
  assert.equal(m.coverage.status, 'partial');
  assert.equal(m.coverage.loaded_count, 60); // Whole line, not CPH denominator.
  assert.equal(m.coverage.reported_count, 200);
  assert.equal(m.metric.value, 30);
  assert.deepEqual(m.metric.evidence_refs, m.rows.map(row => row.evidence_ref));
  assert.equal(m.metric.scope.product_key, 'CPH2859V');
  assert.equal(m.metric.scope.revision, null);
  assert.equal(m.rows.every(row => row.occurrence_id === null), true);
  assert.throws(() => m.rows.push({}), TypeError);
});

test('Produto distinguishes no matching rows from missing snapshot and does not invent history/reuse/process', () => {
  const d = productFixture();
  d.payload.summary.pcba_history_count = 100;
  d.payload.summary.material_reuse_count = 200;
  const s = setup(d);
  const empty = selectProductLine(s, { line_id: LINE_IDS[0], product: 'CPH9999' });
  assert.equal(empty.metric.value, 0);
  assert.equal(empty.metric.drilldown_available, false);
  assert.equal(empty.coverage.status, 'partial');
  assert.deepEqual(empty.dimensions.map(x => x.status), ['unavailable', 'unavailable', 'not_collected']);
  const missing = selectProductLine(s, { line_id: LINE_IDS[2], product: 'CPH9999' });
  assert.equal(missing.metric.value, null);
  assert.equal(missing.coverage.status, 'unavailable');
});

test('Produto reads source, replacements and logout from the existing store', () => {
  const d = productFixture(); const s = setup(d);
  const before = selectProduct(s, 'CPH2859V');
  s.replaceLocalSnapshots([d.payload]); s.setLocalConnected(true);
  assert.equal(selectProduct(s, 'CPH2859V').lines[0].source, 'local');
  s.setLocalConnected(false); s.replaceRemoteDocuments([]);
  assert.equal(selectProduct(s, 'CPH2859V').lines[0].source, 'local_cache');
  clearSessionData({ ames: s });
  assert.equal(selectProduct(s, 'CPH2859V').lines[0].source, 'none');
  assert.equal(before.lines[0].rows.length, 30);
});

test('actual product shell uses activeData code and same state.ames only in authenticated product view', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('    let productMesView;'), app.indexOf('    function renderProduct()'));
  const s = setup(productFixture()); let created = 0; const products = [];
  const context = vm.createContext({ state: { ames: s }, document: { querySelector: () => ({}) },
    createProductView: (_, store) => { assert.equal(store, s); created++; return { render(p) { products.push(p); } }; } });
  vm.runInContext('let currentAuthUser=null, activeView="product", currentLanguage="pt-BR", selected={code:"CPH2859V"}; const activeData=()=>selected;\n' + code + '\nrenderProductMes();', context);
  assert.equal(created, 0);
  vm.runInContext('currentAuthUser={uid:"test"}; activeView="operations"; renderProductMes();', context);
  assert.equal(created, 0);
  vm.runInContext('activeView="product"; renderProductMes(); selected={code:"CPH2859"}; renderProductMes(); selected=undefined; renderProductMes();', context);
  assert.equal(created, 1);
  assert.deepEqual(products, ['CPH2859V', 'CPH2859', undefined]);
});
