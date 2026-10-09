import { immutable } from './contract.mjs';
import { selectDashboard } from './dashboard.mjs';

// Same line/exact-product query as Dashboard. No manual records enter this
// projection and no historical deduplication or persistent relation is inferred.
export function selectFailures(store, filters) {
  const model = selectDashboard(store, filters);
  return immutable({ ...model, origin: 'MES',
    identity: { kind: 'snapshot_read_only', durable: false, persistent_link_allowed: false },
    aggregates: [], pareto: [] });
}
