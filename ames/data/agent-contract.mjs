import { immutable, normalizeLegacySnapshot, requireLine } from './contract.mjs';

export const AGENT_URL = 'http://127.0.0.1:8765/api/v1';
export const SCHEDULER_POLICY = 'fifo-monitor-skip-v1';
const fields = ['line','snapshot_id','pcba_sn','current_pcba_sn','current_pcba','historical_pcba','item_sn','item_type','usage_status','previous_pcba_count','total_pcba_count_known_now','previous_pcbas_json','active_now_pcbas_json','inactive_now_pcbas_json','bind_time_utc','unbind_time_utc','hist_seq','defect_code','defect_desc','defect_time','defect_oper','defect_location','defect_material_id','repair_status','defect_type','defect_type_class','manual_or_auto','context_kind','material_type','material_sn'];
export function projectAgentRows(rows, line, snapshotId) {
  requireLine(line);
  return (Array.isArray(rows) ? rows : []).filter(r => r?.line === line && String(r.snapshot_id) === String(snapshotId)).map(r =>
    Object.fromEntries(fields.filter(k => typeof r[k] === 'string' || typeof r[k] === 'number').map(k => [k, typeof r[k] === 'string' ? r[k].slice(0,12000) : r[k]])));
}
export function normalizeAgentRead(payload) {
  const legacy=payload.legacy;
  const defects=legacy.defects.filter(row=>String(row.snapshot_id)===String(legacy.summary.snapshot_id));
  const base = normalizeLegacySnapshot({...legacy,defects});
  const datasets = {};
  for (const name of ['pcba_history','material_reuse','history_contexts']) datasets[name] = projectAgentRows(payload.datasets?.[name], base.line_id, base.snapshot_id);
  const input = payload.insights;
  let insights = null;
  if (input?.schema === 'ames-insights-v1' && input.ready === true && input.line === base.line_id && String(input.snapshot_id) === base.snapshot_id) {
    const safeRow = r => Object.fromEntries(Object.entries(r || {}).filter(([k,v]) => !k.startsWith('_') && !/password|cookie|token|credential|raw_json/i.test(k) && (typeof v==='string'||typeof v==='number')).map(([k,v])=>[k.slice(0,120),typeof v==='string'?v.slice(0,12000):v]));
    insights = { line:base.line_id,snapshot_id:base.snapshot_id, coverage:'partial',
      groups:Object.fromEntries(['rate_kpis','pcba_kpis','material_kpis','correlation_kpis'].map(k=>[k,(input[k]||[]).filter(r=>Array.isArray(r)&&typeof r[0]==='string'&&['string','number'].includes(typeof r[1])).map(r=>[r[0].slice(0,200),r[1]])])),
      component_types:(input.component_types||[]).map(safeRow),
      drilldowns:Object.fromEntries(Object.entries(input.drilldowns||{}).filter(([,rows])=>Array.isArray(rows)).map(([k,rows])=>[k,rows.map(safeRow)])) };
  }
  return immutable({...base, source_schema:'agent-v0.5.23-read',
    pcba_history:{status:'partial',records:datasets.pcba_history},material_trace:{status:'partial',records:datasets.material_reuse},
    history_contexts:datasets.history_contexts, insights,
    coverage:{...base.coverage,rejected_rows:base.coverage.rejected_rows+legacy.defects.length-defects.length,reasons:[...base.coverage.reasons,'agent_has_no_revision_or_cursor','historical_line_derived_by_agent']}});
}

export function collectionScope(value) {
  const lines=[...new Set(value.lines||[])].map(requireLine);
  if(!lines.length)throw new TypeError('Selecione pelo menos uma linha.');
  const performance=value.performance;
  if(!['fast','balanced','safe'].includes(performance))throw new TypeError('Perfil inválido.');
  const limit=k=>{const n=Number(value[k]);if(!Number.isSafeInteger(n)||n<0||n>100000)throw new TypeError('Limite inválido.');return n;};
  const defect_codes=[...new Set(value.defect_codes||[])];
  if(defect_codes.some(x=>typeof x!=='string'||!x.trim()||x.length>120))throw new TypeError('Código de falha inválido.');
  return {lines,defect_codes,max_failures:limit('max_failures'),max_pcbas:limit('max_pcbas'),performance};
}
