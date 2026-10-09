import { createOccurrenceView } from './occurrence-view.mjs';

export function createDashboardView(root, store, options = {}) {
  return createOccurrenceView(root, store, { ...options, mode: 'dashboard' });
}
