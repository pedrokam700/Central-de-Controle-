import { immutable } from './contract.mjs';
import { selectFailures } from './failures.mjs';

export function selectDaily(store, filters) {
  return immutable({ ...selectFailures(store, filters), period: null, shift: null,
    temporal_scope: 'snapshot_only', affects_manual_tasks: false });
}
