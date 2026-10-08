import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LINE_IDS, LEGACY_SCHEMA, normalizeLegacySnapshot, productKey, instant, eventBeforeFailure } from '../ames/data/contract.mjs';
import { createAmesStore, clearSessionData } from '../ames/data/store.mjs';

// Synthetic contract fixtures only, never factory evidence.
const at = '2026-10-08T14:00:00-03:00';
const row = (line, overrides = {}) => ({ line, pcba_sn: 'TEST-PCBA', product_model: 'CPH3028', defect_code: 'D1', defect_time: at, ...overrides });
const payload = (line = LINE_IDS[0], overrides = {}) => ({
  schema: LEGACY_SCHEMA, line, generated_at: at,
  summary: { line, snapshot_id: 'TEST-SNAPSHOT', collected_at: at, fpy: 98, check_fpy: 99, quantity: 1000, defect_rows: 200 },
  defects: [row(line)], ...overrides
});
const document = p => ({ kind: 'ames_shared_snapshot', line: p.line, schema: p.schema, payload: p });

test('line is mandatory and datasets from different lines are quarantined', () => {
  const p = payload();
  p.defects.push(row(LINE_IDS[1]), row(''), null);
  const normalized = normalizeLegacySnapshot(p);
  assert.equal(normalized.occurrences.length, 1);
  assert.equal(normalized.coverage.rejected_rows, 3);
  assert.throws(() => normalizeLegacySnapshot(payload('all')), /line/);
  assert.throws(() => normalizeLegacySnapshot(payload(LINE_IDS[0], { summary: { line: LINE_IDS[1], snapshot_id: 'x' } })), /line/);
});

test('legacy export never claims completeness even with matching or zero counts', () => {
  for (const count of [0, 1, 160, 200]) {
    const p = payload(); p.summary.defect_rows = count;
    const result = normalizeLegacySnapshot(p);
    assert.equal(result.coverage.status, 'partial');
    assert.equal(result.coverage.exact_metric_drilldown, false);
    assert.equal(result.coverage.reported_count, count);
    assert.equal(result.occurrences[0].occurrence_id, null);
    assert.equal(result.summary.metric_evidence, 'aggregate_only');
  }
});

test('unknown metrics are null, actual zero remains zero', () => {
  const p = payload();
  Object.assign(p.summary, { fpy: '', check_fpy: 0, quantity: null, defect_rows: 0, pcba_history_count: -1 });
  const s = normalizeLegacySnapshot(p).summary;
  assert.equal(s.fpy, null); assert.equal(s.check_fpy, 0);
  assert.equal(s.quantity, null); assert.equal(s.defect_count, 0);
  assert.equal(s.pcba_history_count, null);
});

test('CPH normalization preserves variants, rejects empty matching, and never uses prefixes', () => {
  assert.equal(productKey(' 3028 v '), 'CPH3028V');
  assert.equal(productKey('cph3028'), 'CPH3028');
  const p = payload();
  p.defects = [row(p.line), row(p.line, { product_model: 'CPH3028V' }), row(p.line, { product_model: '' })];
  const store = createAmesStore(); store.replaceRemoteDocuments([document(p)]);
  assert.equal(store.occurrences({ line_id: p.line, product: '3028' }).rows.length, 1);
  assert.equal(store.occurrences({ line_id: p.line, product: 'CPH3028V' }).rows.length, 1);
  assert.equal(store.occurrences({ line_id: p.line, product: '' }).rows.length, 0);
  assert.throws(() => store.occurrences({ product: '3028' }), /line/);
});

test('row references partition repeated SNs by line and snapshot', () => {
  const a = normalizeLegacySnapshot(payload(LINE_IDS[0]));
  const b = normalizeLegacySnapshot(payload(LINE_IDS[1]));
  const p = payload(); p.summary.snapshot_id = 'NEXT';
  const c = normalizeLegacySnapshot(p);
  assert.notEqual(a.occurrences[0].evidence_ref, b.occurrences[0].evidence_ref);
  assert.notEqual(a.occurrences[0].evidence_ref, c.occurrences[0].evidence_ref);
});

test('projection does not copy arbitrary secrets/raw fields or confirmed correlations', () => {
  const p = payload();
  p.cookie = 'SECRET'; p.summary.session = 'SECRET'; p.defects[0].raw_json = 'SECRET';
  p.insights = { pcba_kpis: [['second_use', 5]], material_kpis: [['second_use', 20]], status: 'confirmed', token: 'SECRET' };
  const result = normalizeLegacySnapshot(p);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(result.pcba_history.status, 'unavailable');
  assert.equal(result.material_trace.status, 'unavailable');
  assert.deepEqual(result.correlations, []);
  assert.equal(result.occurrences[0].evidence_status, 'source_observation');
  assert.equal(result.process_timeline.status, 'not_collected');
});

test('invalid schema, missing identity or dataset fail closed', () => {
  assert.throws(() => normalizeLegacySnapshot(payload(LINE_IDS[0], { schema: 'future' })), /schema/);
  const p = payload(); delete p.summary.snapshot_id;
  assert.throws(() => normalizeLegacySnapshot(p), /identity/);
  assert.throws(() => normalizeLegacySnapshot(payload(LINE_IDS[0], { defects: undefined })), /dataset/);
});

test('normalized objects cannot be changed by input or consumers', () => {
  const p = payload(); const n = normalizeLegacySnapshot(p);
  p.defects[0].defect_code = 'CHANGED';
  assert.equal(n.occurrences[0].defect_code, 'D1');
  assert.throws(() => { n.occurrences[0].defect_code = 'CHANGED'; }, TypeError);
});

test('remote snapshots replace instead of accumulating deleted data', () => {
  const s = createAmesStore();
  s.replaceRemoteDocuments(LINE_IDS.map(line => document(payload(line))));
  assert.equal(s.read(LINE_IDS[1]).source, 'remote');
  s.replaceRemoteDocuments([document(payload())]);
  assert.equal(s.read(LINE_IDS[1]).source, 'none');
  s.replaceRemoteDocuments([]);
  assert.equal(s.read(LINE_IDS[0]).source, 'none');
});

test('document line/schema mismatch and duplicate snapshots cannot silently win', () => {
  const s = createAmesStore();
  const d = document(payload()); d.line = LINE_IDS[1];
  s.replaceRemoteDocuments([d]);
  assert.equal(s.read(LINE_IDS[0]).source, 'none');
  assert.equal(s.diagnostics()[0].reason, 'remote_envelope_mismatch');
  s.replaceRemoteDocuments([document(payload()), document(payload()), document(payload())]);
  assert.equal(s.read(LINE_IDS[0]).source, 'none');
  assert.equal(s.diagnostics()[0].reason, 'ambiguous_snapshots_for_line');
});

test('local availability is independent of cloud and source fallback is explicit', () => {
  const s = createAmesStore({ now: () => instant(at) + 5000 });
  s.replaceLocalSnapshots([payload()]); s.setLocalConnected(true);
  s.replaceRemoteDocuments([document(payload())]);
  assert.equal(s.read(LINE_IDS[0]).source, 'local');
  s.replaceRemoteDocuments([]); // Cloud unavailable; local is still usable.
  assert.equal(s.read(LINE_IDS[0]).source, 'local');
  assert.equal(s.read(LINE_IDS[0]).local_connected, true);
  s.setLocalConnected(false);
  assert.equal(s.read(LINE_IDS[0]).source, 'local_cache');
  assert.equal(s.read(LINE_IDS[0]).freshness, 'stale');
  s.replaceRemoteDocuments([document(payload())]);
  assert.equal(s.read(LINE_IDS[0]).source, 'remote');
});

test('freshness is unknown for missing timezone/future clocks and stale for old collection', () => {
  const s = createAmesStore({ now: () => instant(at) + 200000 });
  s.replaceRemoteDocuments([document(payload())]);
  assert.equal(s.read(LINE_IDS[0]).freshness, 'stale');
  const p = payload(); p.summary.collected_at = '2026-10-08 14:00:00';
  s.replaceRemoteDocuments([document(p)]);
  assert.equal(s.read(LINE_IDS[0]).freshness, 'unknown');
  p.summary.collected_at = '2027-01-01T00:00:00Z';
  s.replaceRemoteDocuments([document(p)]);
  assert.equal(s.read(LINE_IDS[0]).freshness, 'unknown');
});

test('logout clears all collection arrays and both MES sources', () => {
  const s = createAmesStore(); s.replaceLocalSnapshots([payload()]); s.replaceRemoteDocuments([document(payload())]);
  const state = { ames: s, products: [1], aiKnowledge: [2], aiConversations: [3], routineExecutions: [4] };
  clearSessionData(state);
  for (const value of Object.values(state)) if (Array.isArray(value)) assert.deepEqual(value, []);
  assert.equal(s.read(LINE_IDS[0]).source, 'none');
});

test('actual shell listeners ignore late data/errors after logout and session replacement', () => {
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const clear = source.slice(source.indexOf('    function clearDataListeners()'), source.indexOf('    function legacyUsers()'));
  const sync = source.slice(source.indexOf('    function syncFirestore()'), source.indexOf('    function updateOwnerDropdowns()'));
  const listeners = [];
  const store = createAmesStore();
  const state = { ames: store, products: [], aiKnowledge: [] };
  const context = vm.createContext({
    state, db: {}, console, collection: (_, name) => name,
    onSnapshot: (name, data, error) => { listeners.push({ name, data, error }); return () => {}; },
    aiUpdateAIState() {}, renderAIMemoryPanel() {}, render() {}, fillActivityProducts() {}
  });
  vm.runInContext('let unsubscribeData=[]; let dataSessionGeneration=0; let currentAuthUser={uid:"first"}; let activeProduct=null;\n' + clear + sync + '\nsyncFirestore();', context);
  const first = listeners.find(l => l.name === 'aiKnowledge');
  const snapshot = { docs: [{ id: 'ames', data: () => document(payload()) }] };
  first.data(snapshot);
  assert.equal(store.read(LINE_IDS[0]).source, 'remote');
  vm.runInContext('clearDataListeners(); currentAuthUser=null;', context);
  clearSessionData(state);
  first.data(snapshot);
  assert.equal(store.read(LINE_IDS[0]).source, 'none');
  listeners.find(l => l.name === 'products').data({ docs: [{ id: 'old', data: () => ({ code: 'OLD' }) }] });
  assert.deepEqual(state.products, []);
  vm.runInContext('currentAuthUser={uid:"second"}; syncFirestore();', context);
  const second = listeners.filter(l => l.name === 'aiKnowledge').at(-1);
  second.data(snapshot);
  first.error(new Error('old session permission error'));
  assert.equal(store.read(LINE_IDS[0]).source, 'remote');
  first.data({ docs: [] });
  assert.equal(store.read(LINE_IDS[0]).source, 'remote');
});

test('time parser rejects ambiguous timezone, impossible dates, and invalid clock', () => {
  for (const invalid of [null, '', '2026-10-08T14:00:00', '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-08T24:00:00Z', '2026-10-08T14:00:00+03:99']) assert.equal(instant(invalid), null);
  assert.equal(instant(at), instant('2026-10-08T17:00:00Z'));
  assert.notEqual(instant('2024-02-29T12:00:00Z'), null);
});

const occurrence = { line_id: LINE_IDS[0], pcba_sn: 'TEST-PCBA', defect_time: at };
const event = (id, time, overrides = {}) => ({ event_id: id, line_id: occurrence.line_id, pcba_sn: occurrence.pcba_sn, source_view: '3022', valid: true, event_time: time, ...overrides });

test('3022 selects last valid preceding/equal event, never absolute latest', () => {
  const events = [event('before', '2026-10-08T13:59:00-03:00'), event('after', '2026-10-08T14:01:00-03:00'), event('equal', at)];
  assert.equal(eventBeforeFailure(events, occurrence).event.event_id, 'equal');
  assert.equal(eventBeforeFailure(events.slice(0, 2), occurrence).event.event_id, 'before');
});

test('3022 isolates line/SN and requires explicit event validity and timezone', () => {
  const events = [event('wrong-line', at, { line_id: LINE_IDS[1] }), event('wrong-sn', at, { pcba_sn: 'OTHER' }), event('invalid', at, { valid: false }), event('unknown', at, { valid: undefined }), event('ambiguous-time', '2026-10-08T14:00:00'), event('wrong-source', at, { source_view: '2114' })];
  assert.equal(eventBeforeFailure(events, occurrence).status, 'no_valid_preceding_event');
  assert.equal(eventBeforeFailure([], { ...occurrence, defect_time: '' }).status, 'invalid_context');
  assert.equal(eventBeforeFailure(null, occurrence).status, 'not_collected');
});

test('3022 equal timestamps stay ambiguous without proven source ordering', () => {
  const result = eventBeforeFailure([event('a', at), event('b', at)], occurrence);
  assert.equal(result.status, 'ambiguous'); assert.equal(result.event, null);
});
