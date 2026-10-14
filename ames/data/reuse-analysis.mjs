const value=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==null&&v!==undefined&&v!=='')??null;
const list=v=>{if(Array.isArray(v))return v;try{const a=JSON.parse(v);if(Array.isArray(a))return a;}catch{}return typeof v==='string'?v.split(/[,;|\n]/).map(x=>x.trim()).filter(Boolean):[];};
const unique=a=>[...new Set(a.filter(v=>v!==null&&v!==undefined&&v!==''))];
const key=(...parts)=>parts.map(v=>String(v??'')).join('\u0000');
const addIndex=(map,k,row)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(row);};
const COMPONENT_RULES=[
 [/front.*camera|camera.*front|前置.*(?:摄像|相机)|前摄/,'Front Camera'],
 [/sub.*board|副板|小板|充电小板/,'Sub Board'],
 [/main.*board|\bpcba\b|主板/,'Main Board'],
 [/screen|\blcd\b|display|显示屏|液晶|屏幕|屏组件|屏模组/,'Screen / LCD'],
 [/main.*camera|rear.*camera|camera.*rear|后置.*(?:摄像|相机)|后摄|主摄/,'Main Camera'],
 [/camera|摄像|相机/,'Camera'],
 [/speaker|扬声器|喇叭/,'Speaker'],
 [/receiver|earpiece|受话器|听筒/,'Receiver'],
 [/antenna|天线/,'Antenna'],
 [/battery|电池/,'Battery'],
 [/microphone|\bmic\b|麦克风|咪头/,'Microphone'],
 [/vibration|vibrator|motor|马达|振动/,'Vibration Motor'],
 [/fingerprint|指纹/,'Fingerprint'],
];
export function componentFamily(type){
 const s=String(type||'').toLowerCase().replace(/[_-]/g,' ');
 for(const [regex,name] of COMPONENT_RULES)if(regex.test(s))return name;
 return null;
}
export function componentLabel(type,locale=document?.documentElement?.lang||'pt-BR'){
 const raw=String(type||'').trim(),family=componentFamily(raw);if(!family)return raw||null;
 if(String(locale||'').toLowerCase().startsWith('en'))return family;
 return ({'Front Camera':'Câmera frontal','Main Camera':'Câmera principal','Camera':'Câmera','Sub Board':'Subplaca','Main Board':'Placa principal','Screen / LCD':'Tela / LCD','Speaker':'Alto-falante','Receiver':'Receptor / auricular','Antenna':'Antena','Battery':'Bateria','Microphone':'Microfone','Vibration Motor':'Motor de vibração','Fingerprint':'Leitor de digital'})[family]||family;
}
export function componentGroup(row,family=null){
 const explicit=value(row,'component_group','assembly_group','module_group','set_name','assembly_set','Conjunto','Grupo conjunto','Assembly Group','Module Group');
 return explicit?String(explicit):family||componentFamily(value(row,'item_type','material_type','Tipo material'))||null;
}
function historicalEvidence(previous,corr,history,process){
 const pcbas=unique(previous.concat(corr.map(c=>value(c,'historical_pcba','PCBA desvinculada'))));
 return pcbas.map(pcba=>{
  const corrRows=corr.filter(c=>String(value(c,'historical_pcba','PCBA desvinculada')||'')===String(pcba));
  const histRows=history.filter(h=>String(h.pcba_sn||'')===String(pcba));
  const repairs=histRows.flatMap(h=>h.repair_evidence_3012||[]);
  const passages=process.filter(e=>String(e.pcba_sn||'')===String(pcba));
  const defectCode=unique(histRows.map(h=>h.defect_code).concat(corrRows.map(c=>value(c,'Defect Code antigo','previous_defect_code')))).join(', ')||null;
  const defectDesc=unique(histRows.map(h=>h.defect_desc).concat(corrRows.map(c=>value(c,'Defect Description antigo','previous_defect_desc')))).join(' | ')||null;
  const defectTime=unique(histRows.map(h=>h.defect_time).concat(corrRows.map(c=>value(c,'Defect Time antigo','previous_defect_time')))).join(', ')||null;
  const relation=unique(corrRows.map(c=>value(c,'Classificação desta PCBA','relation'))).map(x=>String(x).replaceAll('_',' ').replace('FALHA SIMILAR','MESMA FAMÍLIA').replace('FALHA DIFERENTE','OUTRA FALHA')).join(', ')||null;
  return {pcba:String(pcba),defect_code:defectCode,defect_desc:defectDesc,defect_time:defectTime,relation,
   repair_user:unique(repairs.map(r=>r.repair_user)).join(', ')||null,repair_comment:unique(repairs.map(r=>r.repair_comment)).join(' | ')||null,
   process_time:unique(passages.map(e=>e.event_time)).join(', ')||null,station:unique(passages.map(e=>e.station)).join(', ')||null,
   operation:unique(passages.map(e=>e.operation_name||e.process)).join(', ')||null};
 }).filter(row=>row.pcba);
}
function historyCodeText(evidence,fallback=[]){const rows=(evidence||[]).filter(e=>e.defect_code);return rows.length?rows.map(e=>`${e.pcba}: ${e.defect_code}`).join(' | '):unique(fallback).join(', ')||null;}
function historyDescText(evidence,fallback=[]){const rows=(evidence||[]).filter(e=>e.defect_desc||e.defect_code);return rows.length?rows.map(e=>`${e.pcba}: ${e.defect_desc||e.defect_code}`).join(' | '):unique(fallback).join(' | ')||null;}
export function reuseLinks(snapshot){
 const canonical=snapshot?.material_trace?.records||[];
 const source=canonical.length?canonical:(snapshot?.insights?.drilldowns?.material_analysis||[]);
 const materialSummaries=snapshot?.insights?.drilldowns?.material_analysis||[];
 const correlations=Object.entries(snapshot?.insights?.drilldowns||{}).filter(([k])=>k.startsWith('correlation_')).flatMap(([,v])=>v||[]);
 const occurrences=snapshot?.occurrences||[],historyRows=snapshot?.pcba_history?.records||[],processRows=snapshot?.process_timeline?.events||[];
 const summaryIndex=new Map();for(const row of materialSummaries)summaryIndex.set(key(value(row,'PCBA atual'),value(row,'Material SN')),row);
 const corrIndex=new Map();for(const row of correlations)addIndex(corrIndex,key(value(row,'PCBA atual','current_pcba_sn','pcba_sn'),value(row,'Material SN','item_sn','material_sn')),row);
 const occurrenceExact=new Map(),occurrencePcba=new Map();for(const row of occurrences){if(row?.pcba_sn){if(row.defect_key)occurrenceExact.set(key(row.pcba_sn,row.defect_key),row);if(!occurrencePcba.has(String(row.pcba_sn)))occurrencePcba.set(String(row.pcba_sn),row);}}
 const historyIndex=new Map();for(const row of historyRows)if(row?.pcba_sn)addIndex(historyIndex,String(row.pcba_sn),row);
 const processIndex=new Map();for(const row of processRows)if(row?.pcba_sn)addIndex(processIndex,String(row.pcba_sn),row);
 const out=new Map();
 for(const original of source){
  const currentPcba=value(original,'current_pcba_sn','PCBA atual'),currentMaterial=value(original,'item_sn','material_sn','Material SN');
  const match=summaryIndex.get(key(currentPcba,currentMaterial));
  const r={...match,...original};
  const pcba=value(r,'current_pcba_sn','PCBA atual','pcba_sn'),material=value(r,'material_sn','item_sn','Material SN');
  if(!pcba||!material)continue;
  const previous=list(value(r,'previous_pcbas_json','previous_pcbas','PCBAs desvinculadas'));
  const uses=value(r,'known_use_count','total_pcba_count_known_now','Usos conhecidos material','Uso material na falha');
  const reused=previous.length>0||Number(uses)>1||Number(value(r,'previous_pcba_count','Reusos anteriores material'))>0;
  if(!reused)continue;
  const occurrence=(r.current_defect_key?occurrenceExact.get(key(pcba,r.current_defect_key)):null)||occurrencePcba.get(String(pcba));
  const corr=corrIndex.get(key(pcba,material))||[];
  const family=componentFamily(value(r,'item_type','material_type','Tipo material'));
  const group=componentGroup(r,family);
  const relations=unique(corr.map(c=>value(c,'Classificação desta PCBA','relation')).concat([
    Number(value(r,'PCBAs com mesma falha'))>0?'MESMA FALHA':null,
    Number(value(r,'PCBAs com mesma família'))>0?'MESMA FAMÍLIA':null,
    Number(value(r,'PCBAs com falha diferente'))>0?'OUTRA FALHA':null
  ])).map(x=>String(x).replaceAll('_',' ').replace('FALHA SIMILAR','MESMA FAMÍLIA').replace('FALHA DIFERENTE','OUTRA FALHA'));
  const history=previous.flatMap(pc=>historyIndex.get(String(pc))||[]);
  const currentProcess=processIndex.get(String(pcba))||[];
  const operators=currentProcess.flatMap(e=>e.provenance?.adapter?.operator_events||[]);
  const repairs=[...(r.repair_evidence_3012||[]),...history.flatMap(h=>h.repair_evidence_3012||[])];
  const relevantProcess=unique(previous.concat([pcba])).flatMap(pc=>processIndex.get(String(pc))||[]);
  const evidence=historicalEvidence(previous,corr,history,relevantProcess);
  const historyCodes=unique(evidence.map(e=>e.defect_code));
  const historyDescriptions=unique(evidence.map(e=>e.defect_desc));
  const row={production_shift:occurrence?.production_shift||null,production_operational_date:occurrence?.production_operational_date||null,production_event_time:occurrence?.production_event_time||null,
   repair_user:unique(repairs.map(r=>r.repair_user)).join(', ')||null,repair_comment:unique(repairs.map(r=>r.repair_comment)).join(' | ')||null,repair_source:repairs.length?'3012 · candidatos por PCBA':null,
   line:value(r,'line','Linha')||snapshot.line_id,product:value(r,'product','product_model','Modelo')||occurrence?.product_key||null,pcba,material,
   part_number:value(r,'part_number','Part Number','material_id'),item_type:value(r,'item_type','material_type','Tipo material'),family,component_group:group,
   previous_pcbas:unique(evidence.map(e=>e.pcba)).join(', ')||unique(previous.concat(corr.map(c=>value(c,'historical_pcba','PCBA desvinculada')))).join(', '),
   defect_code:value(r,'defect_code','Defect Code atual')||occurrence?.defect_code,defect_desc:value(r,'defect_desc','Defect Description atual','Defect Desc atual')||occurrence?.defect_desc,
   defect_time:occurrence?.defect_time||value(r,'defect_time','Defect Time atual'),usage:uses==null?null:Number(uses)===2?'2º uso':Number(uses)>=3?'3º+ uso':null,
   relations:relations.join(', ')||null,
   history_code:historyCodeText(evidence,historyCodes),
   history_desc:historyDescText(evidence,historyDescriptions),
   historical_evidence:evidence,
   station:unique(operators.map(o=>o.station).concat(currentProcess.map(e=>e.station))).join(', ')||null,
   operation:unique(operators.map(o=>o.operation_name).concat(currentProcess.map(e=>e.process))).join(', ')||null,
   operator:unique(operators.flatMap(o=>[o.operator_id,o.operator_name])).join(', ')||null,
   root_cause_confirmed:Boolean(value(r,'root_cause_confirmed','cause_confirmed','Causa confirmada')),
   _sourceRows:[r],_history:history};
  const rowKey=JSON.stringify([row.line,pcba,material,r.bind_id||r.bind_time_utc||null,r.unbind_id||r.unbind_time_utc||null]);
  if(out.has(rowKey)){
   const old=out.get(rowKey);old._sourceRows.push(r);
   for(const k of ['defect_code','defect_desc','defect_time','relations','production_shift','production_operational_date','production_event_time','repair_user','repair_comment','repair_source','component_group'])old[k]=unique([old[k],row[k]]).join(', ')||null;
   const merged=[...(old.historical_evidence||[]),...(row.historical_evidence||[])],seen=new Set();old.historical_evidence=merged.filter(e=>{const k=JSON.stringify([e.pcba,e.defect_code,e.defect_desc,e.defect_time,e.relation]);if(seen.has(k))return false;seen.add(k);return true;});
   old.previous_pcbas=unique(old.historical_evidence.map(e=>e.pcba)).join(', ')||old.previous_pcbas;
   old.history_code=historyCodeText(old.historical_evidence,old.history_code?[old.history_code]:[]);
   old.history_desc=historyDescText(old.historical_evidence,old.history_desc?[old.history_desc]:[]);
   old.root_cause_confirmed=old.root_cause_confirmed||row.root_cause_confirmed;
  }
  else out.set(rowKey,row);
 }
 return [...out.values()];
}
export function aggregatePcbas(links){
 const groups=new Map();for(const r of links){const k=JSON.stringify([r.line,r.pcba]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 return [...groups.values()].map(rows=>{const r=rows[0],out={pcba:r.pcba,line:r.line,materials:unique(rows.map(x=>x.material)).length,component_groups:unique(rows.map(x=>x.component_group||x.family||x.item_type)).length,links:rows.length,historical_pcbas:unique(rows.flatMap(x=>list(x.previous_pcbas))).length,_links:rows};
 for(const k of ['production_shift','production_operational_date','production_event_time','repair_user','repair_comment','repair_source','product','component_group','family','item_type','defect_code','defect_desc','defect_time','relations','previous_pcbas','material','part_number','usage','history_code','history_desc','station','operation','operator'])out[k]=unique(rows.map(x=>x[k])).join(', ')||null;out.root_cause_confirmed=rows.some(x=>x.root_cause_confirmed);return out;});
}
export function reuseKpis(rows){const pcbas=aggregatePcbas(rows);return {pcbas:pcbas.length,materials:unique(rows.map(r=>r.material)).length,groups:unique(rows.map(r=>`${r.pcba}::${r.component_group||r.family||r.item_type||''}`)).length,links:rows.length,same:pcbas.filter(r=>r.relations?.includes('MESMA FALHA')).length,family:pcbas.filter(r=>r.relations?.includes('MESMA FAMÍLIA')).length,other:pcbas.filter(r=>r.relations?.includes('OUTRA FALHA')).length};}
