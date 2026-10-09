import { immutable, productKey } from './contract.mjs';
import { traceDimensions } from './capabilities.mjs';
import {sourceRecords} from './canonical.mjs';
import {selectProcess} from './process-timeline.mjs';

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
    enriched:valid?sourceRecords(snapshot,{product:key,pcba_sn:sn}):{pcba_history:[],materials:[],process_events:[]},
    process:occurrence?selectProcess(snapshot,occurrence):{status:'not_collected',event:null},
    dimensions: traceDimensions(snapshot), material_sn: null, pcba_reuse: null, component_reuse: null,
    process_rule: 'last_valid_event_time_lte_defect_time', persistent_link_allowed: false });
}
