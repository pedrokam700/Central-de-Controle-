import {SOURCE_STATE,sourceStateFromTrace,sourceStateHasEvidence} from './source-provenance.mjs';

const value=(row,...keys)=>keys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??null;
const text=v=>String(v??'').trim();
const uniq=rows=>{const seen=new Set();return (rows||[]).filter(row=>{const key=JSON.stringify(row);if(seen.has(key))return false;seen.add(key);return true;});};
const same=(a,b)=>text(a)&&text(b)&&text(a)===text(b);
const pcbaOf=row=>value(row,'pcba_sn','PCBA Consultada','PCBA','current_pcba_sn','historical_pcba');
const defectCode=row=>value(row,'defect_code','Defect Code','Defect Code antigo');
const defectDesc=row=>value(row,'defect_desc','Defect Description','Defect Description antigo');
const defectTime=row=>value(row,'defect_time','Defect Time','Defect Time antigo');

export function relationLabel(value){
  return ({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL'})[value]||text(value)||null;
}

function normalizeRepair(row){
  if(!row)return null;
  return {
    source:'3012',pcba_sn:pcbaOf(row),defect_code:defectCode(row),defect_desc:defectDesc(row),defect_time:defectTime(row),
    repair_user:value(row,'repair_user','Repair User'),repair_time:value(row,'repair_time','Repair Time'),
    repair_code:value(row,'repair_code','Repair Code'),repair_desc:value(row,'repair_desc','Repair Description'),
    repair_comment:value(row,'repair_comment','Repair Comment'),raw:row,
  };
}
function repairScore(row,{pcba,code,time}={}){
  let score=0;if(pcba&&same(pcba,pcbaOf(row)))score+=8;else if(pcba)return -1;
  if(code&&same(code,defectCode(row)))score+=4;
  if(time&&same(time,defectTime(row)))score+=3;
  if(value(row,'repair_comment','Repair Comment'))score+=2;
  if(value(row,'repair_user','Repair User'))score+=1;
  return score;
}
function repairsFor(all,criteria,embedded=[]){
  const rows=[...(embedded||[]),...(all||[])];
  return uniq(rows.map(row=>({row,score:repairScore(row,criteria)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score).map(x=>normalizeRepair(x.row)).filter(Boolean));
}

function normalizeProcess(row){
  if(!row)return null;
  const raw=row.raw||row;
  return {
    source:'3022',pcba_sn:pcbaOf(row)||pcbaOf(raw),station:value(row,'station','operation_code','Working Oper Code','Current Oper Code')||value(raw,'Working Oper Code','Station','Station Code','Current Oper Code'),
    operation_code:value(row,'operation_code','Working Oper Code','Current Oper Code'),
    operation_name:value(row,'operation_name','process','Working Oper','Current Oper')||value(raw,'Working Oper','Operation Name','Current Oper'),
    event_time:value(row,'event_time','Tran Time','Transaction Time','Event Time')||value(raw,'Tran Time','Transaction Time','Event Time'),
    operator_id:value(row,'operator_id','Operator ID','Tran User Id','Transaction User Id','Employee ID','User Id')||value(raw,'Tran User Id','Transaction User Id','Operator ID','Employee ID','User Id'),
    operator_name:value(row,'operator_name','Operator Name','Tran User Name','Transaction User Name','Employee Name','User Name')||value(raw,'Tran User Name','Transaction User Name','Operator Name','Employee Name','User Name'),
    production_shift:value(row,'production_shift'),production_operational_date:value(row,'production_operational_date'),raw:row,
  };
}
function processScore(row,pcba){
  const p=normalizeProcess(row);if(!p)return -1;
  // Fail closed across PCBAs. A 3022 row without board identity may only be
  // contextualized by the caller that owns the live SN lookup; it must never
  // float into an unrelated historical PCBA just because A6900 matches.
  if(pcba&&(!p.pcba_sn||text(p.pcba_sn)!==text(pcba)))return -1;
  let score=0;const station=text(p.station).toUpperCase(),operation=text(p.operation_name).toUpperCase();
  if(station==='A6900'||station.startsWith('A6900'))score+=10;
  if(operation.includes('EXPORT REPAIR'))score+=10;
  if(p.operator_id)score+=3;if(p.operator_name)score+=3;if(p.event_time)score+=1;
  return score;
}
function processFor(all,pcba){
  return uniq((all||[]).map(row=>({row:normalizeProcess(row),score:processScore(row,pcba)})).filter(x=>x.row&&x.score>=0).sort((a,b)=>b.score-a.score).map(x=>x.row));
}
export function preferredAnalysisEvent(rows,pcba){
  const list=processFor(rows,pcba);if(!list.length)return null;
  return list.find(p=>text(p.station).toUpperCase().startsWith('A6900')||text(p.operation_name).toUpperCase().includes('EXPORT REPAIR'))||list.find(p=>p.operator_id||p.operator_name)||null;
}

function failureEntry(row,{pcba,repairs=[],process=[]}={}){
  if(!row)return null;const actualPcba=pcba||pcbaOf(row);
  return {pcba_sn:actualPcba,defect_code:defectCode(row),defect_desc:defectDesc(row),defect_time:defectTime(row),manual_or_auto:value(row,'manual_or_auto','Manual/Automatic'),repair_status:value(row,'repair_status','Repair Status'),relation:value(row,'relation'),repairs:repairsFor(repairs,{pcba:actualPcba,code:defectCode(row),time:defectTime(row)},row.repair_evidence_3012||[]),analysis_event:preferredAnalysisEvent(process,actualPcba),source:'2114',raw:row};
}
function parseList(value){if(Array.isArray(value))return value.map(text).filter(Boolean);try{const out=JSON.parse(value||'[]');return Array.isArray(out)?out.map(text).filter(Boolean):[];}catch{return text(value).split(/[,;|\n]/).map(x=>x.trim()).filter(Boolean);}}

function live3012State(result,trace3012){
  const rows=Array.isArray(trace3012?.rows)?trace3012.rows:null;
  if(trace3012)return sourceStateFromTrace(trace3012,{recordCount:rows?.length??null,countProven:Array.isArray(rows)});
  const current=result?.trace_2114?.current_failure||{},prior=result?.trace_2114?.previous_failures||[],reuse=result?.trace_3074?.reused_components||[];
  const embedded=Boolean(current.repair_evidence_3012?.length||prior.some(row=>row.repair_evidence_3012?.length)||reuse.some(item=>(item.previous_pcba_evidence||[]).some(ev=>ev.repair_evidence_3012?.length)));
  if(embedded)return SOURCE_STATE.OK;
  if((result?.local_snapshot?.repair_3012||[]).length)return SOURCE_STATE.CACHED;
  return SOURCE_STATE.NOT_COLLECTED;
}

export function buildLiveSnForensics(result={}){
  const trace2114=result.trace_2114||null,trace3074=result.trace_3074||null,trace3022=result.trace_3022||null,trace3012=result.trace_3012||null;
  const repairs=trace3012?.rows||result.local_snapshot?.repair_3012||[];
  const queryPcba=result.detected_type==='PCBA'?result.sn:(pcbaOf(trace2114?.current_failure)||result.sn);
  // trace_3022 is the process trace of the queried/current board. Some legacy
  // passage rows omit pcba_sn, so contextualize only those rows to queryPcba.
  // Rows that already carry a PCBA keep that exact identity.
  const process=[...(trace3022?.operator_evidence||[]),...(trace3022?.process_passages||[]),...(trace3022?.rows||[])].map(row=>pcbaOf(row)?row:{...row,pcba_sn:queryPcba});
  const current=failureEntry(trace2114?.current_failure,{pcba:queryPcba,repairs,process});
  const ownHistory=(trace2114?.previous_failures||[]).map(row=>failureEntry(row,{pcba:queryPcba,repairs,process})).filter(Boolean);
  const materials=(trace3074?.reused_components||[]).map(item=>{
    const previous=item.previous_pcbas||[];
    const grouped=new Map();
    for(const ev of item.previous_pcba_evidence||[]){const p=text(ev.pcba_sn);if(!p)continue;if(!grouped.has(p))grouped.set(p,[]);grouped.get(p).push(ev);}
    for(const p of previous)if(!grouped.has(text(p)))grouped.set(text(p),[]);
    const history=[];
    for(const [pcba,evidence] of grouped){
      if(evidence.length){for(const ev of evidence){const failure=failureEntry(ev.history,{pcba,repairs:[...(ev.repair_evidence_3012||[]),...repairs],process});history.push({pcba_sn:pcba,relation:ev.relation||item.relation_to_current_failure,reason:ev.reason||null,failure});}}
      else history.push({pcba_sn:pcba,relation:item.relation_to_current_failure||'SEM_HISTORICO',reason:null,failure:null,repairs:repairsFor(repairs,{pcba}),analysis_event:preferredAnalysisEvent(process,pcba)});
    }
    return {item_sn:item.item_sn||null,item_type:item.item_type||null,known_use_count:item.known_use_count??null,reuse_count:item.reuse_count??null,relation:item.relation_to_current_failure||null,previous_pcbas:previous,history,error:item.error||null,source:'3074',raw:item};
  });
  const sourceStates={
    '2114':sourceStateFromTrace(trace2114,{recordCount:(current?1:0)+ownHistory.length,countProven:Array.isArray(trace2114?.previous_failures)}),
    '3074':sourceStateFromTrace(trace3074,{recordCount:materials.length,countProven:Array.isArray(trace3074?.reused_components)}),
    '3022':sourceStateFromTrace(trace3022,{recordCount:process.length,countProven:Boolean(trace3022&&(Array.isArray(trace3022.operator_evidence)||Array.isArray(trace3022.process_passages)||Array.isArray(trace3022.rows)))}),
    '3012':live3012State(result,trace3012),
    '3028':result.local_snapshot?SOURCE_STATE.CACHED:SOURCE_STATE.NOT_COLLECTED,
  };
  return {query_sn:result.sn||null,detected_type:result.detected_type||null,current_pcba:queryPcba,current,own_history:ownHistory,materials,repairs:repairs.map(normalizeRepair).filter(Boolean),analysis_event:preferredAnalysisEvent(process,queryPcba),process:processFor(process,queryPcba),source_states:sourceStates,coverage:{'2114':sourceStateHasEvidence(sourceStates['2114']),'3074':sourceStateHasEvidence(sourceStates['3074']),'3022':sourceStateHasEvidence(sourceStates['3022']),'3012':sourceStateHasEvidence(sourceStates['3012']),'3028':sourceStateHasEvidence(sourceStates['3028'])}};
}

export function buildLocalSnForensics(result={}){
  if(result.cached_lookup)return buildLiveSnForensics(result.cached_lookup);
  const repairs=result.repair_3012||[],process=result.process_events||[],histories=result.pcba_history||[],query=result.query_sn||null;
  const byPcba=new Map();for(const row of histories){const p=text(pcbaOf(row));if(!p)continue;if(!byPcba.has(p))byPcba.set(p,[]);byPcba.get(p).push(row);}
  const ownRows=byPcba.get(text(query))||[];const current=ownRows[0]?failureEntry(ownRows[0],{pcba:query,repairs,process}):null;const ownHistory=ownRows.slice(current?1:0).map(row=>failureEntry(row,{pcba:query,repairs,process}));
  const materials=(result.material_reuse||[]).map(item=>{const previous=parseList(value(item,'previous_pcbas_json','previous_pcbas'));return {item_sn:value(item,'item_sn','material_sn'),item_type:value(item,'item_type','material_type'),known_use_count:value(item,'total_pcba_count_known_now','known_use_count'),reuse_count:value(item,'previous_pcba_count','reuse_count'),relation:value(item,'relation_to_current_failure'),previous_pcbas:previous,history:previous.flatMap(pcba=>{const rows=byPcba.get(text(pcba))||[];if(rows.length)return rows.map(row=>({pcba_sn:pcba,relation:value(row,'relation')||value(item,'relation_to_current_failure')||'SEM_HISTORICO',reason:null,failure:failureEntry(row,{pcba,repairs,process})}));return [{pcba_sn:pcba,relation:'SEM_HISTORICO',reason:null,failure:null,repairs:repairsFor(repairs,{pcba}),analysis_event:preferredAnalysisEvent(process,pcba)}];}),source:'3074',raw:item};});
  const coverage=result.coverage||{};
  const sourceStates=Object.fromEntries(['3028','3074','2114','3022','3012'].map(source=>[source,coverage[source]?SOURCE_STATE.CACHED:SOURCE_STATE.NOT_COLLECTED]));
  return {query_sn:query,detected_type:result.detected_type||null,current_pcba:query,current,own_history:ownHistory,materials,repairs:repairs.map(normalizeRepair).filter(Boolean),analysis_event:preferredAnalysisEvent(process,query),process:processFor(process,query),source_states:sourceStates,coverage};
}
