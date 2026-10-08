import { immutable, productKey } from './contract.mjs';

// A projection of the existing session store, never a second source of data.
export function selectDashboard(store, { line_id, product, defect_code } = {}) {
  const read = store.read(line_id);
  const snapshot = read.snapshot;
  const query = store.occurrences({ line_id, product, defect_code });
  const products = [...new Set((snapshot?.occurrences || []).map(row => row.product_key).filter(Boolean))].sort();
  const productRows = (snapshot?.occurrences || []).filter(row => product === undefined ||
    (productKey(product) !== '' && row.product_key === productKey(product)));
  const defects = [...new Set(productRows.map(row => row.defect_code))].sort();
  const filtered = product !== undefined || defect_code !== undefined;
  const scope = { line_id, snapshot_id: snapshot?.snapshot_id || null, revision: snapshot?.revision ?? null,
    product: product === undefined ? null : productKey(product), defect_code: defect_code ?? null };
  const aggregates = ['fpy', 'check_fpy', 'quantity', 'defect_count'].map(name => ({
    name, value: filtered ? null : snapshot?.summary[name] ?? null,
    evidence: snapshot ? (filtered ? 'outside_filter_scope' : 'aggregate_only') : 'unavailable',
    numerator: null, denominator: null, scope,
    drilldown_available: false
  }));
  const counts = new Map();
  for (const row of query.rows) counts.set(row.defect_code, (counts.get(row.defect_code) || 0) + 1);
  const pareto = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3).map(([code, count]) => ({ code, count }));
  return immutable({ ...read, scope, products, defects, aggregates, pareto, rows: query.rows,
    coverage: query.coverage, filtered,
    sample_metric: { value: snapshot ? query.rows.length : null, rule: 'loaded-occurrence-rows-v1',
      scope, evidence_refs: query.rows.map(row => row.evidence_ref),
      coverage: query.coverage, drilldown_available: Boolean(snapshot) }
  });
}
