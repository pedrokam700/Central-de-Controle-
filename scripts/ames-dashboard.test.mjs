import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LINE_IDS } from '../ames/data/contract.mjs';
import { createAmesStore, clearSessionData } from '../ames/data/store.mjs';
import { selectDashboard } from '../ames/data/dashboard.mjs';

import { fixture } from './ames-fixtures.mjs';

const setup = (...docs) => { const s = createAmesStore(); s.replaceRemoteDocuments(docs); return s; };

test('Dashboard never combines lines or treats sample rows as FPY evidence', () => {
  const s = setup(fixture(), fixture(LINE_IDS[1], 10));
  const m = selectDashboard(s, { line_id: LINE_IDS[0] });
  assert.equal(m.sample_metric.value, 60);
  assert.equal(m.aggregates.find(x => x.name === 'defect_count').value, 200);
  assert.equal(m.aggregates.find(x => x.name === 'fpy').value, 98);
  assert.equal(m.coverage.status, 'partial');
  assert.equal(m.aggregates.every(x => !x.drilldown_available && x.denominator === null), true);
  assert.equal(selectDashboard(s, { line_id: LINE_IDS[1] }).sample_metric.value, 10);
  assert.throws(() => selectDashboard(s, {}), /line/);
});

test('filtered Dashboard hides line aggregates and resolves only exact CPH and defect', () => {
  const s = setup(fixture());
  const m = selectDashboard(s, { line_id: LINE_IDS[0], product: '3028', defect_code: 'D2' });
  assert.equal(m.sample_metric.value, 10);
  assert.equal(m.aggregates.every(x => x.value === null && x.evidence === 'outside_filter_scope'), true);
  assert.equal(m.rows.every(x => x.product_key === 'CPH3028' && x.defect_code === 'D2'), true);
  assert.equal(selectDashboard(s, { line_id: LINE_IDS[0], product: 'CPH302' }).rows.length, 0);
  assert.equal(selectDashboard(s, { line_id: LINE_IDS[0], product: '' }).rows.length, 0);
});

test('each sample KPI and Pareto count resolves to exact references within the same read', () => {
  const s = setup(fixture());
  const m = selectDashboard(s, { line_id: LINE_IDS[0] });
  assert.deepEqual(m.sample_metric.evidence_refs, m.rows.map(row => row.evidence_ref));
  assert.equal(m.pareto[0].description,'Synthetic defect');
  for (const bar of m.pareto) {
    const filtered = selectDashboard(s, { line_id: LINE_IDS[0], defect_code: bar.code });
    assert.equal(filtered.rows.length, bar.count);
    assert.equal(filtered.rows.every(row => m.sample_metric.evidence_refs.includes(row.evidence_ref)), true);
    assert.equal(filtered.rows.some(row => row.defect_desc === bar.description), true);
  }
  const update = fixture(); update.payload.summary.snapshot_id = 'NEXT';
  s.replaceRemoteDocuments([update]);
  const next = selectDashboard(s, { line_id: LINE_IDS[0] });
  assert.equal(next.rows.some(row => m.sample_metric.evidence_refs.includes(row.evidence_ref)), false);
  assert.equal(m.scope.snapshot_id, `TEST-${LINE_IDS[0]}`);
});

test('missing, unknown, empty and true zero remain distinct in Dashboard', () => {
  const d = fixture(LINE_IDS[0], 0); d.payload.summary.quantity = 'unknown';
  const s = setup(d);
  let m = selectDashboard(s, { line_id: LINE_IDS[0] });
  assert.equal(m.sample_metric.value, 0);
  assert.equal(m.coverage.status, 'partial');
  assert.equal(m.aggregates.find(x => x.name === 'quantity').value, null);
  assert.equal(m.aggregates.find(x => x.name === 'check_fpy').value, 0);
  s.replaceRemoteDocuments([]);
  m = selectDashboard(s, { line_id: LINE_IDS[0] });
  assert.equal(m.sample_metric.value, null);
  assert.equal(m.sample_metric.drilldown_available, false);
  assert.equal(m.coverage.status, 'unavailable');
});

test('Dashboard source and coverage follow the same session store through fallback/logout', () => {
  const d = fixture(); const s = setup(d);
  s.replaceLocalSnapshots([d.payload]); s.setLocalConnected(true);
  assert.equal(selectDashboard(s, { line_id: d.line }).source, 'local');
  s.replaceRemoteDocuments([]); s.setLocalConnected(false);
  assert.equal(selectDashboard(s, { line_id: d.line }).source, 'local_cache');
  clearSessionData({ ames: s });
  assert.equal(selectDashboard(s, { line_id: d.line }).source, 'none');
});

test('real shell renders MES only when authenticated and Dashboard visible, reusing state.ames', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('    let dashboardMesView;'), app.indexOf('    function renderDashboard()'));
  const s = setup(fixture()); let created = 0, renders = 0;
  const context = vm.createContext({ state: { ames: s }, document: { querySelector: () => ({}) },
    createDashboardView: (_, store) => { assert.equal(store, s); created++; return { render() { renders++; } }; } });
  vm.runInContext('let currentAuthUser=null, activeView="dashboard", currentLanguage="pt-BR";\n' + code + '\nrenderDashboardMes();', context);
  assert.equal(created, 0);
  vm.runInContext('currentAuthUser={uid:"test"}; activeView="home"; renderDashboardMes();', context);
  assert.equal(created, 0);
  vm.runInContext('activeView="dashboard"; renderDashboardMes(); renderDashboardMes();', context);
  assert.equal(created, 1); assert.equal(renders, 2);
});
