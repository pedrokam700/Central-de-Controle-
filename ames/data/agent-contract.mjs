import { immutable, normalizeLegacySnapshot, requireLine, LINE_IDS } from './contract.mjs';

export const AGENT_URL = 'http://127.0.0.1:8765/api/v1';
export const SCHEDULER_POLICY = 'fifo-monitor-skip-v1';
export const R12_MIN_BUILD = 12;

const fields = [
  'line','snapshot_id','pcba_sn','current_pcba_sn','current_pcba','historical_pcba','item_sn','item_type','usage_status',
  'previous_pcba_count','total_pcba_count_known_now','previous_pcbas_json','active_now_pcbas_json','inactive_now_pcbas_json',
  'bind_time_utc','unbind_time_utc','hist_seq','defect_key','current_defect_key','defect_code','defect_desc','defect_time','defect_time_utc',
  'defect_oper','defect_location','defect_material_id','repair_status','defect_type','defect_type_class','manual_or_auto','context_kind',
  'material_type','material_sn',
  // 3022 / processo e correlação temporal. São evidências da fonte, não causa confirmada.
  'station','operation_code','operation_name','event_time','event_group','source',
  'detection_operation_code','detection_operation_name','manual_or_auto_3028','manual_or_auto_2114','registration_mode',
  'registration_mode_source','registration_mode_conflict','failure_family','analysis_kind','reference_rule_id','reference_confidence',
  'reference_station_code','reference_reason','reference_status','reference_event_time','reference_hist_seq','reference_pass_count_before_defect',
  'repair_action','repair_class','repair_event_time','return_a5201_event_time','next_reference_event_time','status',
  'previous_operation_code','previous_operation_name','previous_station','previous_event_time','previous_hist_seq','previous_event_group'
];

const provenanceContextFields = ['line_id','product','pcba_sn','material_sn','kind','defect_key','context_key'];
const scalar=value=>typeof value==='string'?value.slice(0,12000):typeof value==='number'||typeof value==='boolean'?value:undefined;
const stringList=(value,{lines=false}={})=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string').map(v=>v.slice(0,200)).filter(v=>!lines||LINE_IDS.includes(v)))].slice(0,100):undefined;
const provenanceContexts=value=>Array.isArray(value)?value.slice(0,100).map(context=>{
  if(!context||typeof context!=='object'||Array.isArray(context))return null;
  const projected={};
  for(const key of provenanceContextFields){
    const value=scalar(context[key]);
    if(value!==undefined&&(key!=='line_id'||LINE_IDS.includes(value)))projected[key]=value;
  }
  return Object.keys(projected).length?projected:null;
}).filter(Boolean):undefined;

export function r12CompatibleBuild(health) {
  const match = /^3022-R(\d+)$/.exec(String(health?.agent_build || ''));
  return !!match && Number(match[1]) >= R12_MIN_BUILD && health?.auto_3022_ready === true && health?.mes_scheduler?.policy === SCHEDULER_POLICY;
}

export function projectAgentRows(rows, line, snapshotId) {
  requireLine(line);
  return (Array.isArray(rows) ? rows : []).filter(r => r?.line === line && String(r.snapshot_id) === String(snapshotId)).map(r => {
    const projected=Object.fromEntries(fields.map(k=>[k,scalar(r[k])]).filter(([,v])=>v!==undefined));
    const lineCandidates=stringList(r.line_candidates,{lines:true});if(lineCandidates)projected.line_candidates=lineCandidates;
    if(typeof r.line_ambiguous==='boolean')projected.line_ambiguous=r.line_ambiguous;
    const productCandidates=stringList(r.product_candidates);if(productCandidates)projected.product_candidates=productCandidates;
    const contexts=provenanceContexts(r.provenance_contexts);if(contexts)projected.provenance_contexts=contexts;
    return projected;
  });
}

function normalizeRemovedRows(rows,legacy,base){
  const source=(Array.isArray(rows)?rows:[]).filter(row=>row?.line===base.line_id&&typeof row?.pcba_sn==='string'&&row.pcba_sn.trim()).map(row=>({...row,present_in_3028:0}));
  if(!source.length)return [];
  const normalized=normalizeLegacySnapshot({...legacy,summary:{...legacy.summary,defect_rows:source.length},defects:source});
  return normalized.occurrences.map((row,index)=>({
    ...row,
    identity_kind:'legacy_removed_row',
    evidence_ref:JSON.stringify([base.line_id,base.snapshot_id,'removed',row.defect_key||index]),
    snapshot_id:base.snapshot_id,
    present_in_3028:false
  }));
}

export function normalizeAgentRead(payload) {
  const legacy=payload.legacy;
  const defects=legacy.defects.filter(row=>String(row.snapshot_id)===String(legacy.summary.snapshot_id));
  const base = normalizeLegacySnapshot({...legacy,defects});
  const removedAvailable=payload.removed_defects_available!==false&&Array.isArray(payload.datasets?.removed_defects);
  const removedOccurrences=removedAvailable?normalizeRemovedRows(payload.datasets.removed_defects,legacy,base):[];
  const datasets = {};
  for (const name of ['pcba_history','material_reuse','history_contexts','process_events','process_defect_contexts']) {
    datasets[name] = projectAgentRows(payload.datasets?.[name], base.line_id, base.snapshot_id);
  }
  const input = payload.insights;
  let insights = null;
  if (input?.schema === 'ames-insights-v1' && input.ready === true && input.line === base.line_id && String(input.snapshot_id) === base.snapshot_id) {
    const safeRow = r => Object.fromEntries(Object.entries(r || {}).filter(([k,v]) => !k.startsWith('_') && !/password|cookie|token|credential|raw_json/i.test(k) && (typeof v==='string'||typeof v==='number'||typeof v==='boolean')).map(([k,v])=>[k.slice(0,120),typeof v==='string'?v.slice(0,12000):v]));
    insights = { line:base.line_id,snapshot_id:base.snapshot_id, coverage:'partial',
      groups:Object.fromEntries(['rate_kpis','pcba_kpis','material_kpis','correlation_kpis'].map(k=>[k,(input[k]||[]).filter(r=>Array.isArray(r)&&typeof r[0]==='string'&&['string','number'].includes(typeof r[1])).map(r=>[r[0].slice(0,200),r[1]])])),
      component_types:(input.component_types||[]).map(safeRow),
      drilldowns:Object.fromEntries(Object.entries(input.drilldowns||{}).filter(([,rows])=>Array.isArray(rows)).map(([k,rows])=>[k,rows.map(safeRow)])) };
  }
  const processAvailable = datasets.process_events.length > 0 || datasets.process_defect_contexts.length > 0;
  return immutable({...base, source_schema:'agent-v0.5.23-read',
    removed_occurrences:removedOccurrences,
    removed_occurrences_status:removedAvailable?'available':'unavailable',
    pcba_history:{status:'partial',records:datasets.pcba_history},material_trace:{status:'partial',records:datasets.material_reuse},
    history_contexts:datasets.history_contexts, insights,
    process_timeline:{status:processAvailable?'partial':'not_collected',events:datasets.process_events,contexts:datasets.process_defect_contexts},
    coverage:{...base.coverage,rejected_rows:base.coverage.rejected_rows+legacy.defects.length-defects.length,reasons:[...base.coverage.reasons,'agent_has_no_revision_or_cursor','historical_line_derived_by_agent',...(removedAvailable?[]:['removed_defects_unavailable']),...(removedOccurrences.length?['removed_defects_loaded_separately']:[]),...(processAvailable?['3022_evidence_available']:[])]}});
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
