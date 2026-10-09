import { immutable } from './contract.mjs';

// Describes the actual legacy export, not a fabricated adapter for future data.
// Counts alone cannot enable record investigation or prove reuse.
export function traceDimensions(snapshot) {
  return immutable([
    { source: '3028', label: 'Ocorrências da PCBA', status: snapshot ? 'partial' : 'unavailable',
      reported_count: snapshot?.summary.defect_count ?? null,
      missing: 'ID durável, revisão e prova de completude' },
    { source: '3074', label: 'Material SN · bind/unbind/reuso', status: 'unavailable',
      reported_count: snapshot?.summary.material_trace_count ?? null,
      missing: 'Registros de Material SN, PCBAs vinculadas/desvinculadas, tempos e referências da fonte' },
    { source: '2114', label: 'Histórico da PCBA/falha', status: 'unavailable',
      reported_count: snapshot?.summary.pcba_history_count ?? null,
      missing: 'Eventos da PCBA, Defect Time, Repair Status, Defect Type e referências da fonte' },
    { source: '3022', label: 'Processo anterior à falha', status: 'not_collected', reported_count: null,
      missing: 'Adaptador real; último evento válido com event_time ≤ defect_time' }
  ]);
}

export const AGENT_CAPABILITIES = immutable({
  transport_status: 'unavailable',
  can_detect: false, can_collect: false, can_configure: false, can_read_progress: false,
  missing: ['Contrato de descoberta e versão do agente', 'Comandos e parâmetros de coleta documentados',
    'Job e progresso real por linha e fonte', 'Export coerente com revisão, paginação e evidência 3074/2114']
});
