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
  reference_version: '0.5.23',
  reference_sha256: '1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167',
  transport_status: 'reviewed_not_connected',
  collection_blocker: 'agent_has_no_shared_mes_lock_across_job_kinds',
  can_detect: false, can_collect: false, can_configure: false, can_read_progress: false,
  missing: ['Serialização da sessão entre jobs 3028, 3074/2114, consulta SN e monitor: a V0.5.23 não garante exclusão global',
    'Transporte nativo validado com o contrato V0.5.23 e origem da Central',
    'Leitura coerente por linha/snapshot: a API atual não fornece revisão nem paginação por cursor',
    'Comparação de desempenho e paridade antes de retirar a interface isolada']
});
