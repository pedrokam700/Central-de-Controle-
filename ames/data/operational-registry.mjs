// Canonical operational registry for the current Extrema site.
// Existing MES line IDs are immutable operational identities. Friendly labels may
// evolve, but consumers must never infer a line from display text.
export const OPERATIONAL_REGISTRY = Object.freeze({
  schema: 'central-operational-registry-v1',
  site: Object.freeze({
    id: 'extrema',
    label: 'Extrema',
    timezone: 'America/Sao_Paulo'
  }),
  lines: Object.freeze([
    Object.freeze({ id: 'TAN10101', label: 'Linha 1', enabled: true }),
    Object.freeze({ id: 'TAN10102', label: 'Linha 2', enabled: true }),
    Object.freeze({ id: 'TAN10103', label: 'Linha 3', enabled: true })
  ])
});

export const LINE_IDS = Object.freeze(OPERATIONAL_REGISTRY.lines.filter(line=>line.enabled).map(line=>line.id));
export const LINE_LABELS = Object.freeze(Object.fromEntries(OPERATIONAL_REGISTRY.lines.map(line=>[line.id,line.label])));
export const LINE_ALIASES = Object.freeze(Object.fromEntries(OPERATIONAL_REGISTRY.lines.map(line=>[line.label,line.id])));

export function requireRegisteredLine(value){
  const line=String(value||'').trim().toUpperCase();
  if(!LINE_IDS.includes(line))throw new TypeError('An explicit registered MES line is required');
  return line;
}

export function operationalRegistrySnapshot(){
  return OPERATIONAL_REGISTRY;
}
