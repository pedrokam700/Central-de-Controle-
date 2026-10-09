import { LINE_IDS, immutable, productKey } from './contract.mjs';

// CPH comes from the selected Central product, never from a title or family.
export function selectProductLine(store, { line_id, product } = {}) {
  const key = productKey(product);
  const read = store.read(line_id);
  // An absent product must not turn into the store's unfiltered query.
  const query = store.occurrences({ line_id, product: key });
  const scope = { line_id, product_key: key, snapshot_id: query.snapshot_id,
    revision: read.snapshot?.revision ?? null };
  return immutable({ ...read, scope, rows: query.rows, coverage: query.coverage,
    metric: { value: key && read.snapshot ? query.rows.length : null,
      rule: 'loaded-product-occurrences-v1', scope,
      evidence_refs: query.rows.map(row => row.evidence_ref),
      drilldown_available: Boolean(key && query.rows.length), coverage: query.coverage },
    // These are availability declarations, not calculated reuse/history KPIs.
    dimensions: [
      { key: 'pcba_history', label: 'Histórico da PCBA · 2114', status: read.snapshot?.pcba_history.status || 'unavailable' },
      { key: 'material_trace', label: 'Materiais e reuso · 3074', status: read.snapshot?.material_trace.status || 'unavailable' },
      { key: 'process_timeline', label: 'Processo anterior · 3022', status: read.snapshot?.process_timeline.status || 'unavailable' }
    ]
  });
}

export function selectProduct(store, product) {
  return immutable({ product_key: productKey(product),
    lines: LINE_IDS.map(line_id => selectProductLine(store, { line_id, product })) });
}
