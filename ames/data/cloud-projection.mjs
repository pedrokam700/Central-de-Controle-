import {CANONICAL_SCHEMA,DATASETS,normalizeCanonical} from './canonical.mjs';
import {LINE_IDS} from './contract.mjs';

export const CLOUD_PROJECTION_SCHEMA='central-ames-cloud-v1';

const TOP_FIELDS=Object.freeze(['schema','schema_version','source_id','snapshot_id','snapshot_revision','content_hash','line_id','collected_at','source_view','source_timestamp']);
const SUMMARY_FIELDS=Object.freeze(['line','snapshot_id','collected_at','fpy','check_fpy','quantity','defect_rows','total_defect_qty']);
const COVERAGE_FIELDS=Object.freeze(['status','stored_total','unassigned_rows','ambiguous_context_rows','transport_complete','source_complete','scope','reason']);
const CAPABILITY_FIELDS=Object.freeze(['process_timeline']);

// Explicit canonical row contract.  This is intentionally broader than any one
// dataset because the same evidence fields are reused across 3028/2114/3074/3022.
// Adding a new local field does NOT publish it until it is reviewed here.
const ROW_FIELDS=Object.freeze([
  'record_id','occurrence_id','line','line_id','snapshot_id','snapshot_revision',
  'product','product_model','product_candidates','pcba_sn','current_pcba_sn','current_pcba','historical_pcba',
  'item_sn','item_type','material_sn','material_type','usage_status',
  'previous_pcba_count','total_pcba_count_known_now','previous_pcbas_json','active_now_pcbas_json','inactive_now_pcbas_json',
  'bind_time_utc','unbind_time_utc','bind_id','unbind_id','hist_seq','defect_key','current_defect_key',
  'defect_code','defect_desc','defect_time','defect_time_utc','defect_oper','defect_location','defect_material_id',
  'repair_status','repair_status_current','repair_state_current','defect_type','defect_type_current','defect_type_class',
  'manual_or_auto','context_kind','context_key','source_view','source_timestamp','collected_at',
  'station','process','operation_code','operation_name','event_id','event_time','event_group','source','valid',
  'detection_operation_code','detection_operation_name','manual_or_auto_3028','manual_or_auto_2114','registration_mode',
  'registration_mode_source','registration_mode_conflict','failure_family','analysis_kind','reference_rule_id','reference_confidence',
  'reference_station_code','reference_reason','reference_status','reference_event_time','reference_hist_seq','reference_pass_count_before_defect',
  'repair_action','repair_class','repair_event_time','return_a5201_event_time','next_reference_event_time','status',
  'previous_operation_code','previous_operation_name','previous_station','previous_event_time','previous_hist_seq','previous_event_group'
]);

const PROVENANCE_CONTEXT_FIELDS=Object.freeze(['line_id','product','pcba_sn','material_sn','kind','defect_key','context_key']);
const PROVENANCE_FIELDS=Object.freeze(['identity_scope','source_id','line_candidates','line_ambiguous','contexts']);
const PROCESS_CONTEXT_FIELDS=Object.freeze([
  ...ROW_FIELDS,
  'reference_process_code','reference_process_name','detection_station','repair_station','return_station',
  'defect_reason_type','defect_reason_desc','repair_code','repair_desc'
]);

const INSIGHT_GROUPS=Object.freeze(['rate_kpis','pcba_kpis','material_kpis','correlation_kpis']);
const INSIGHT_DRILLDOWNS=Object.freeze(['pcba_analysis','material_analysis','material_history']);
const INSIGHT_ROW_FIELDS=Object.freeze([
  'Linha','Snapshot','PCBA','Modelo','Defect Code','Defect Desc','Defect Time','Uso da PCBA na falha','Usos conhecidos da PCBA',
  'Falhas registradas 2114','Falhas anteriores 2114','Mesma falha anterior','Mesma família anterior','Repair Status atual','Defect Type atual',
  'PCBA atual','Defect Code atual','Defect Desc atual','Tipo material','Material SN','Uso material na falha','Usos conhecidos material',
  'PCBAs desvinculadas únicas','PCBAs com mesma falha','PCBAs com mesma família','Falhas 2114 nas desvinculadas','Evidência histórica',
  'PCBA desvinculada','Classificação desta PCBA','Defect Code antigo','Defect Description antigo','Repair Status antigo','Defect Type antigo',
  'Relação desta ocorrência','Motivo da relação','Materiais únicos no lote','Reutilizados únicos','2º uso','3º+ uso',
  'Com falha nas PCBAs desvinculadas','Sem falha nas PCBAs desvinculadas','Com mesma falha','Com mesma família','% reuso',
  'line','snapshot_id','pcba_sn','product','defect_code','defect_desc','defect_time','material_sn','item_type','usage_status',
  'previous_pcba_count','total_pcba_count_known_now','same_failure','same_family','repair_status','defect_type','relation','reason'
]);

function scalar(value,{max=12000}={}){
  if(value===null)return null;
  if(typeof value==='string')return value.slice(0,max);
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='boolean')return value;
  return undefined;
}

function pickScalars(value,fields,{max=12000}={}){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const out={};
  for(const field of fields){
    const safe=scalar(value[field],{max});
    if(safe!==undefined)out[field]=safe;
  }
  return out;
}

function stringList(value,{lines=false,maxItems=100,maxLength=4000}={}){
  if(!Array.isArray(value))return undefined;
  const rows=[...new Set(value.filter(v=>typeof v==='string').map(v=>v.slice(0,maxLength)).filter(v=>!lines||LINE_IDS.includes(v)))].slice(0,maxItems);
  return rows;
}

function projectContexts(value){
  if(!Array.isArray(value))return undefined;
  return value.slice(0,200).map(context=>{
    const out=pickScalars(context,PROVENANCE_CONTEXT_FIELDS,{max:12000});
    if(out.line_id&&!LINE_IDS.includes(out.line_id))delete out.line_id;
    return Object.keys(out).length?out:null;
  }).filter(Boolean);
}

function projectProcessContexts(value){
  if(!Array.isArray(value))return undefined;
  return value.slice(0,500).map(context=>{
    const out=pickScalars(context,PROCESS_CONTEXT_FIELDS,{max:12000});
    if(out.line&&!LINE_IDS.includes(out.line))delete out.line;
    if(out.line_id&&!LINE_IDS.includes(out.line_id))delete out.line_id;
    return Object.keys(out).length?out:null;
  }).filter(Boolean);
}

function projectProvenance(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const out=pickScalars(value,PROVENANCE_FIELDS,{max:12000});
  const candidates=stringList(value.line_candidates,{lines:true,maxItems:LINE_IDS.length,maxLength:20});
  if(candidates)out.line_candidates=candidates;
  const contexts=projectContexts(value.contexts);if(contexts)out.contexts=contexts;
  const defectContexts=projectProcessContexts(value.adapter?.defect_contexts);if(defectContexts?.length)out.adapter={defect_contexts:defectContexts};
  return Object.keys(out).length?out:undefined;
}

function projectRow(row){
  const out=pickScalars(row,ROW_FIELDS,{max:12000});
  const products=stringList(row?.product_candidates,{maxItems:100,maxLength:200});if(products)out.product_candidates=products;
  const provenance=projectProvenance(row?.provenance);if(provenance)out.provenance=provenance;
  const coverage=pickScalars(row?.coverage,COVERAGE_FIELDS,{max:2000});if(Object.keys(coverage).length)out.coverage=coverage;
  return out;
}

function projectInsights(input,line,snapshotId){
  if(!input||input.schema!=='ames-insights-v1'||input.ready!==true||input.line!==line||String(input.snapshot_id)!==String(snapshotId))return null;
  const out={schema:'ames-insights-v1',line,snapshot_id:String(snapshotId),ready:true};
  for(const group of INSIGHT_GROUPS){
    out[group]=(Array.isArray(input[group])?input[group]:[]).slice(0,500).filter(row=>Array.isArray(row)&&typeof row[0]==='string'&&['string','number'].includes(typeof row[1])).map(row=>[row[0].slice(0,200),typeof row[1]==='string'?row[1].slice(0,12000):row[1]]);
  }
  out.component_types=(Array.isArray(input.component_types)?input.component_types:[]).slice(0,500).map(row=>pickScalars(row,INSIGHT_ROW_FIELDS,{max:12000}));
  out.drilldowns={};
  for(const name of INSIGHT_DRILLDOWNS){
    out.drilldowns[name]=(Array.isArray(input.drilldowns?.[name])?input.drilldowns[name]:[]).slice(0,5000).map(row=>pickScalars(row,INSIGHT_ROW_FIELDS,{max:12000}));
  }
  return out;
}

export function projectCanonicalForCloud(payload){
  normalizeCanonical(payload);
  const out=pickScalars(payload,TOP_FIELDS,{max:12000});
  out.schema=CANONICAL_SCHEMA;
  out.schema_version=2;
  out.summary=pickScalars(payload.summary,SUMMARY_FIELDS,{max:12000});
  out.datasets={};
  out.coverage={};
  for(const dataset of DATASETS){
    out.datasets[dataset]=payload.datasets[dataset].map(projectRow);
    out.coverage[dataset]=pickScalars(payload.coverage[dataset],COVERAGE_FIELDS,{max:4000});
  }
  out.capabilities=pickScalars(payload.capabilities,CAPABILITY_FIELDS,{max:2000});
  const insights=projectInsights(payload.insights,payload.line_id,payload.snapshot_id);
  if(insights)out.insights=insights;
  // Prove that the projected payload still satisfies the canonical transport contract.
  normalizeCanonical(out);
  return out;
}

export const CLOUD_ALLOWED_FIELDS=Object.freeze({
  top:TOP_FIELDS,
  summary:SUMMARY_FIELDS,
  coverage:COVERAGE_FIELDS,
  capabilities:CAPABILITY_FIELDS,
  row:ROW_FIELDS,
  provenance:PROVENANCE_FIELDS,
  provenance_context:PROVENANCE_CONTEXT_FIELDS,
  process_context:PROCESS_CONTEXT_FIELDS,
  insight_groups:INSIGHT_GROUPS,
  insight_drilldowns:INSIGHT_DRILLDOWNS,
  insight_row:INSIGHT_ROW_FIELDS
});
