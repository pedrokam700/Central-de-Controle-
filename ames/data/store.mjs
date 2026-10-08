import { immutable, instant, normalizeLegacySnapshot, productKey, requireLine } from './contract.mjs';

// One store belongs to one Central session. Transport/auth stay in the shell.
export function createAmesStore({ now = Date.now, maxAgeMs = 120000 } = {}) {
  let local = new Map();
  let remote = new Map();
  let localConnected = false;
  let issues = [];

  function normalizeBatch(payloads) {
    const next = new Map();
    const seen = new Set();
    const errors = [];
    for (const payload of payloads) {
      try {
        const snapshot = normalizeLegacySnapshot(payload);
        if (seen.has(snapshot.line_id)) {
          next.delete(snapshot.line_id);
          errors.push({ line_id: snapshot.line_id, reason: 'ambiguous_snapshots_for_line' });
        } else {
          seen.add(snapshot.line_id);
          next.set(snapshot.line_id, snapshot);
        }
      } catch (error) {
        errors.push({ reason: error.message });
      }
    }
    return { next, errors };
  }

  return Object.freeze({
    replaceRemoteDocuments(documents) {
      const payloads = [];
      const errors = [];
      for (const document of documents) {
        if (document?.kind !== 'ames_shared_snapshot') continue;
        if (!document.payload || document.line !== document.payload.line || document.schema !== document.payload.schema) {
          errors.push({ reason: 'remote_envelope_mismatch' });
          continue;
        }
        payloads.push(document.payload);
      }
      const result = normalizeBatch(payloads);
      remote = result.next; // Full replacement also removes revoked/deleted docs.
      issues = immutable([...errors, ...result.errors]);
      return issues;
    },
    replaceLocalSnapshots(payloads) {
      const result = normalizeBatch(payloads);
      local = result.next;
      return immutable(result.errors);
    },
    setLocalConnected(value) { localConnected = value === true; },
    read(line) {
      requireLine(line);
      const snapshot = (localConnected && local.get(line)) || remote.get(line) || local.get(line) || null;
      const source = !snapshot ? 'none' : snapshot === local.get(line) ? (localConnected ? 'local' : 'local_cache') : 'remote';
      const collected = instant(snapshot?.collected_at);
      const age = collected === null ? null : now() - collected;
      return immutable({
        source, snapshot, local_connected: localConnected,
        age_ms: age,
        freshness: age === null || age < 0 ? 'unknown' : age > maxAgeMs || source === 'local_cache' ? 'stale' : 'fresh'
      });
    },
    occurrences({ line_id, product, defect_code, pcba_sn } = {}) {
      const { snapshot } = this.read(line_id);
      const key = product === undefined ? null : productKey(product);
      const rows = (snapshot?.occurrences || []).filter(row =>
        (key === null || (key !== '' && row.product_key === key)) &&
        (defect_code === undefined || row.defect_code === defect_code) &&
        (pcba_sn === undefined || row.pcba_sn === pcba_sn));
      return immutable({
        rows,
        coverage: snapshot?.coverage || { status: 'unavailable', exact_metric_drilldown: false },
        snapshot_id: snapshot?.snapshot_id || null
      });
    },
    diagnostics() { return issues; },
    clear() {
      local = new Map(); remote = new Map(); localConnected = false; issues = [];
    }
  });
}

export function clearSessionData(state) {
  state.ames.clear();
  for (const key of Object.keys(state)) if (Array.isArray(state[key])) state[key] = [];
}
