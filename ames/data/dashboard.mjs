import { immutable, productKey } from './contract.mjs';

// A projection of the existing session store, never a second source of data.
export function selectDashboard(store, { line_id, product, defect_code, pcba_sn, repair_status, defect_type } = {}) {
  const read = store.read(line_id);
  const snapshot = read.snapshot;
  const query = store.occurrences({ line_id, product, defect_code, pcba_sn });
  const rows = query.rows.filter(row => (repair_status === undefined || row.repair_status === repair_status) &&
    (defect_type === undefined || row.defect_type === defect_type));
  const products = [...new Set((snapshot?.occurrences || []).map(row => row.product_key).filter(Boolean))].sort();
  const productRows = (snapshot?.occurrences || []).filter(row => product === undefined ||
    (productKey(product) !== '' && row.product_key === productKey(product)));
  const defects = [...new Set(productRows.map(row => row.defect_code))].sort();
  const filtered = [product, defect_code, pcba_sn, repair_status, defect_type].some(value => value !== undefined);
  const scope = { line_id, snapshot_id: snapshot?.snapshot_id || null, revision: snapshot?.revision ?? null,
    product: product === undefined ? null : productKey(product), defect_code: defect_code ?? null,
    pcba_sn: pcba_sn ?? null, repair_status: repair_status ?? null, defect_type: defect_type ?? null };
  const aggregates = ['fpy', 'check_fpy', 'quantity', 'defect_count'].map(name => ({
    name, value: filtered ? null : snapshot?.summary[name] ?? null,
    evidence: snapshot ? (filtered ? 'outside_filter_scope' : 'aggregate_only') : 'unavailable',
    numerator: null, denominator: null, scope,
    drilldown_available: false
  }));
  const counts = new Map();
  for (const row of rows) {
    const current=counts.get(row.defect_code)||{count:0,description:''};
    current.count++;
    if(!current.description&&row.defect_desc)current.description=row.defect_desc;
    counts.set(row.defect_code,current);
  }
  const pareto = [...counts].map(([code,value])=>({code,count:value.count,description:value.description}))
    .sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code)).slice(0,3);
  return immutable({ ...read, scope, products, defects, aggregates, pareto, rows,
    repair_statuses: [...new Set(productRows.map(row => row.repair_status))].sort(),
    defect_types: [...new Set(productRows.map(row => row.defect_type))].sort(),
    coverage: query.coverage, filtered,
    sample_metric: { value: snapshot ? rows.length : null, rule: 'loaded-occurrence-rows-v1',
      scope, evidence_refs: rows.map(row => row.evidence_ref),
      coverage: query.coverage, drilldown_available: Boolean(snapshot) }
  });
}
