// Read-only compatibility contract. No MES command or cloud publisher lives here.
export const LINE_IDS = Object.freeze(['TAN10101', 'TAN10102', 'TAN10103']);
export const LEGACY_SCHEMA = 'central-v2-ames-line-v1';

export function requireLine(line) {
  if (!LINE_IDS.includes(line)) throw new TypeError('An explicit supported line is required');
  return line;
}

export function productKey(value) {
  const code = typeof value === 'string' ? value.trim().replace(/\s+/g, '').toUpperCase() : '';
  return /^\d{4}[A-Z0-9]*$/.test(code) ? `CPH${code}` : code;
}

export function instant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null; // Never guess the workstation/browser timezone.
  const [, year, month, day, hour, minute, second, zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59) return null;
  if (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';
const identifier = value => typeof value === 'string' ? value.trim() : Number.isSafeInteger(value) ? String(value) : '';
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;

export function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

export function normalizeLegacySnapshot(payload) {
  if (!object(payload) || payload.schema !== LEGACY_SCHEMA) throw new TypeError('Unsupported snapshot schema');
  const line = requireLine(payload.line);
  const summary = payload.summary;
  if (!object(summary) || summary.line !== line) throw new TypeError('Snapshot summary line mismatch');
  const snapshotId = identifier(summary.snapshot_id);
  if (!snapshotId) throw new TypeError('Snapshot identity is missing');
  if (!Array.isArray(payload.defects)) throw new TypeError('Missing defects dataset');
  const occurrences = [];
  let rejectedRows = 0;
  payload.defects.forEach((row, index) => {
    if (!object(row) || row.line !== line || !text(row.pcba_sn).trim()) {
      rejectedRows++;
      return;
    }
    // This reference resolves within this immutable read only. It is NOT a
    // durable occurrence ID: legacy export has no revision or stable row ID.
    occurrences.push({
      evidence_ref: JSON.stringify([line, snapshotId, index]),
      identity_kind: 'legacy_snapshot_row',
      occurrence_id: null,
      line_id: line,
      snapshot_id: snapshotId,
      source_view: '3028',
      pcba_sn: text(row.pcba_sn).trim(),
      product_model: text(row.product_model),
      product_key: productKey(row.product_model),
      defect_code: text(row.defect_code),
      defect_desc: text(row.defect_desc),
      defect_time: text(row.defect_time),
      defect_time_ms: instant(row.defect_time),
      repair_status: text(row.repair_status_current || row.repair_state_current),
      raw_ref: null,
      evidence_status: 'source_observation'
    });
  });
  return immutable({
    schema_version: 1,
    source_schema: LEGACY_SCHEMA,
    normalizer_version: 'legacy-read-1',
    line_id: line,
    snapshot_id: snapshotId,
    revision: null,
    collected_at: text(summary.collected_at),
    generated_at: text(payload.generated_at),
    summary: {
      fpy: percent(summary.fpy),
      check_fpy: percent(summary.check_fpy),
      quantity: count(summary.quantity),
      defect_count: count(summary.defect_rows),
      pcba_history_count: count(summary.pcba_history_count),
      material_trace_count: count(summary.material_reuse_count),
      metric_evidence: 'aggregate_only'
    },
    occurrences,
    coverage: {
      status: 'partial',
      loaded_count: occurrences.length,
      reported_count: count(summary.defect_rows),
      rejected_rows: rejectedRows,
      reasons: ['legacy_export_has_no_revision_or_completeness_proof', 'legacy_drilldown_records_not_exported'],
      exact_metric_drilldown: false
    },
    // Counts alone do not prove PCBA/material histories or process events.
    pcba_history: { status: 'unavailable', records: [] },
    material_trace: { status: 'unavailable', records: [] },
    process_timeline: { status: 'not_collected', events: [] },
    correlations: []
  });
}

export function eventBeforeFailure(events, occurrence) {
  const line = requireLine(occurrence?.line_id);
  const sn = text(occurrence?.pcba_sn).trim();
  const failureTime = instant(occurrence?.defect_time);
  if (!sn || failureTime === null) return immutable({ status: 'invalid_context', event: null });
  if (!Array.isArray(events)) return immutable({ status: 'not_collected', event: null });
  const eligible = events.filter(event => {
    const time = instant(event?.event_time);
    return event?.valid === true && event.source_view === '3022' && event.line_id === line &&
      event.pcba_sn === sn && identifier(event.event_id) && time !== null && time <= failureTime;
  });
  if (!eligible.length) return immutable({ status: 'no_valid_preceding_event', event: null });
  const latest = eligible.reduce((max, event) => Math.max(max, instant(event.event_time)), -Infinity);
  const candidates = eligible.filter(event => instant(event.event_time) === latest);
  if (candidates.length !== 1) return immutable({ status: 'ambiguous', event: null });
  const event = candidates[0];
  return immutable({ status: 'available', event: {
    event_id: identifier(event.event_id), source_view: '3022', line_id: line, pcba_sn: sn,
    event_time: event.event_time, process_code: text(event.process_code),
    process_name: text(event.process_name), station: text(event.station), result: text(event.result),
    evidence_status: 'source_observation'
  } });
}
