import { immutable } from './contract.mjs';

// Describes the actual legacy export, not a fabricated adapter for future data.
// Counts alone cannot enable record investigation or prove reuse.
export function traceDimensions(snapshot) {
  return immutable([
    { source: '3028', label: 'Ocorrências da PCBA', status: snapshot ? 'partial' : 'unavailable',
      reported_count: snapshot?.summary.defect_count ?? null,
      missing: 'ID durável, revisão e prova de completude' },
    { source: '3074', label: 'Material SN · bind/unbind/reuso', status: snapshot?.material_trace?.records?.length ? 'partial' : 'unavailable',
      reported_count: snapshot?.summary.material_trace_count ?? null,
      missing: 'Registros de Material SN, PCBAs vinculadas/desvinculadas, tempos e referências da fonte' },
    { source: '2114', label: 'Histórico da PCBA/falha', status: snapshot?.pcba_history?.records?.length ? 'partial' : 'unavailable',
      reported_count: snapshot?.summary.pcba_history_count ?? null,
      missing: 'Eventos da PCBA, Defect Time, Repair Status, Defect Type e referências da fonte' },
    { source: '3022', label: 'Processo anterior à falha', status: 'not_collected', reported_count: null,
      missing: 'Adaptador real; último evento válido com event_time ≤ defect_time' }
  ]);
}

export const AGENT_CAPABILITIES = immutable({
  reference_version: '0.5.23',
  reference_sha256: '1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167',
  transport_status: 'explicit_local_connection',
  collection_blocker: 'requires_fifo_monitor_skip_v1_agent',
  can_detect: false, can_collect: false, can_configure: false, can_read_progress: false,
  missing: ['Instalar o patch FIFO no agente V0.5.23 e autorizar a origem exata da Central no config.json local',
    'API sem revisão/cursor: leituras e históricos continuam parciais',
    'Validação física de CDP, rede, duração, Excel e paridade fabril ainda pendente']
});
