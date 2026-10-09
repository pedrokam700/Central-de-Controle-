import { immutable, productKey } from './contract.mjs';

// A reference belongs to one immutable read, never a durable cross-system link.
export function selectTrace(store, { line_id, product, pcba_sn, evidence_ref }, expectedSnapshot) {
  const read = store.read(line_id);
  const snapshot = read.snapshot;
  const key = productKey(product);
  const sn = typeof pcba_sn === 'string' ? pcba_sn.trim() : '';
  const invalidated = expectedSnapshot !== undefined && expectedSnapshot !== snapshot;
  const rows = !invalidated && key && sn ? store.occurrences({ line_id, product: key, pcba_sn: sn }).rows : [];
  const occurrence = rows.find(row => row.evidence_ref === evidence_ref) || null;
  const valid = !invalidated && (!evidence_ref || occurrence);
  return immutable({ ...read, status: invalidated ? 'invalidated' : !valid ? 'reference_unavailable' : snapshot ? 'partial' : 'unavailable',
    line_id, product: key, pcba_sn: sn, occurrence, rows: valid ? rows : [],
    coverage: snapshot?.coverage || { status: 'unavailable' },
    dimensions: [
      { source: '3028', label: 'Ocorrências da PCBA', status: snapshot ? 'partial' : 'unavailable' },
      { source: '3074', label: 'Material SN · bind/unbind/reuso', status: snapshot?.material_trace.status || 'unavailable' },
      { source: '2114', label: 'Histórico da PCBA/falha', status: snapshot?.pcba_history.status || 'unavailable' },
      { source: '3022', label: 'Processo anterior à falha', status: snapshot?.process_timeline.status || 'not_collected' }
    ], material_sn: null, pcba_reuse: null, component_reuse: null,
    process_rule: 'last_valid_event_time_lte_defect_time', persistent_link_allowed: false });
}
