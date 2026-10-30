import {compareFailures} from './failure-taxonomy.mjs';
import {SOURCE_STATE,sourceStateFromTrace,sourceStateHasEvidence} from './source-provenance.mjs';
import {compatibleComponentReuseAlerts} from './component-failure-compatibility.mjs';

const value=(row,...keys)=>keys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')??null;
const text=v=>String(v??'').trim();
const uniq=rows=>{const seen=new Set();return (rows||[]).filter(row=>{const key=JSON.stringify(row);if(seen.has(key))return false;seen.add(key);return true;});};
const same=(a,b)=>text(a)&&text(b)&&text(a)===text(b);
const pcbaOf=row=>value(row,'pcba_sn','PCBA Consultada','PCBA','Lot Id','current_pcba_sn','historical_pcba');
const defectCode=row=>value(row,'defect_code','Defect Code','Defect Code antigo');
const defectDesc=row=>value(row,'defect_desc','Defect Description','Defect Description antigo');
const defectTime=row=>value(row,'defect_time','Defect Time','Defect Time antigo');
const histSeq=row=>{
 const raw=value(row,'hist_seq','Defect Hist Seq');
 if(raw===null||!/^(0|[1-9][0-9]*)$/.test(text(raw)))return -1;
 const n=Number(raw);return Number.isSafeInteger(n)?n:-1;
};
const latestHistory=rows=>[...(rows||[])].sort((a,b)=>histSeq(b)-histSeq(a)||(instant(defectTime(b))??-Infinity)-(instant(defectTime(a))??-Infinity))[0]||null;
const sameHistory=(a,b)=>Boolean(a&&b&&histSeq(a)===histSeq(b)&&same(defectCode(a),defectCode(b))&&
  (same(defectTime(a),defectTime(b))||(!text(defectTime(a))&&!text(defectTime(b)))));
// A-MES can record two distinct Defect Hist Seq values at the same displayed
// factory minute. Equal PCBA/code/time is NOT a duplicate when both sequences
// are different. Sequence proves order of 2114 records, NOT a completed repair.
export function failureOrder(prior,current){
 if(!prior||!current||!same(pcbaOf(prior),pcbaOf(current)))return {prior:false,basis:'unproven'};
 const oldSeq=histSeq(prior),newSeq=histSeq(current),oldTime=instant(defectTime(prior)),newTime=instant(defectTime(current));
 if(oldSeq>=0&&newSeq>=0){
   if(oldSeq>=newSeq||oldTime!==null&&newTime!==null&&oldTime>newTime)return {prior:false,basis:'contradicted'};
   return {prior:true,basis:oldTime===null||newTime===null?'hist_seq_only':oldTime===newTime?'hist_seq_same_clock':'hist_seq_and_time'};
 }
 if(oldTime!==null&&newTime!==null&&oldTime<newTime)return {prior:true,basis:'defect_time'};
 return {prior:false,basis:'unproven'};
}
export function provenPreviousFailures(rows=[],current=null){
 if(!current)return {previous:[],uncertain:(rows||[]).length};
 const currTime=instant(defectTime(current)),currSeq=histSeq(current),seen=new Set();
 const previous=[];let uncertain=0;
 for(const row of rows||[]){
  const key=JSON.stringify([text(pcbaOf(row)),text(defectCode(row)),text(defectTime(row)),histSeq(row)]);
  if(seen.has(key))continue;seen.add(key);
  if(sameHistory(row,current))continue;
  // If seq differs, it must be judged by source sequence even when code and
  // low-precision Defect Time match. With no distinct sequence, identical
  // code and instant cannot prove two occurrences.
  const oldSeq=histSeq(row);
  if((oldSeq<0||currSeq<0)&&same(pcbaOf(row),pcbaOf(current))&&
     same(defectCode(row),defectCode(current))&&sameInstant(defectTime(row),defectTime(current)))continue;
  if(failureOrder(row,current).prior)previous.push(row);else uncertain++;
 }
 return {previous,uncertain};
}
function raw2114ByPcba(trace2114,queryPcba=''){
  const map=new Map(),add=(pcba,row)=>{
    if(!row)return;
    const stated=text(pcbaOf(row)),context=text(pcba);
    // An explicitly different board is not part of this 2114 container.
    if(stated&&context&&stated!==context)return;
    const key=stated||context||text(queryPcba);if(!key)return;
    const rows=map.get(key)||[];
    rows.push(stated?row:{...row,pcba_sn:key});
    map.set(key,rows);
  };
  for(const entry of trace2114?.pcbas||[]){if(entry?.status&&text(entry.status).toUpperCase()!=='COMPLETE')continue;for(const row of entry?.result?.rows||[])add(entry?.pcba_sn,row);}
  for(const row of trace2114?.rows||[])add(pcbaOf(row),row);
  return map;
}

export function relationLabel(value){
  return ({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL',HISTORICO_PCBA:'HISTÓRICO DA PCBA'})[value]||text(value)||null;
}

function normalizeRepair(row){
  if(!row)return null;
  return {
    source:row.source_view||row.source||'3012',row_key:row.row_key||null,association:row.association||null,pcba_sn:pcbaOf(row),defect_code:defectCode(row),defect_desc:defectDesc(row),defect_time:defectTime(row),
    repair_user:value(row,'repair_user','Repair User'),repair_user_name:value(row,'repair_user_name','Repair User Name','RepairUserName'),repair_time:value(row,'repair_time','Repair Time'),
    repair_code:value(row,'repair_code','Repair Code'),repair_desc:value(row,'repair_desc','Repair Description'),
    repair_comment:value(row,'repair_comment','Repair Comment'),repaired_location:value(row,'repaired_location','Repaired Location'),
    reason_desc:value(row,'reason_desc','Repair Reason Description','Reason Description'),raw:row,
  };
}
function repairScore(row,{pcba,code,time}={}){
  let score=0;if(pcba&&same(pcba,pcbaOf(row)))score+=8;else if(pcba)return -1;
  if(code&&same(code,defectCode(row)))score+=4;
  if(time&&sameInstant(time,defectTime(row)))score+=3;
  if(value(row,'repair_comment','Repair Comment'))score+=2;
  if(value(row,'repair_user','Repair User'))score+=1;
  return score;
}
function repairsFor(all,criteria,embedded=[]){
  const rows=[...(embedded||[]),...(all||[])];
  return uniq(rows.map(row=>({row,score:repairScore(row,criteria)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score).map(x=>({...normalizeRepair(x.row),association:same(criteria.pcba,pcbaOf(x.row))&&same(criteria.code,defectCode(x.row))&&sameInstant(criteria.time,defectTime(x.row))?'exact_occurrence':'same_pcba_candidate'})).filter(Boolean));
}

function normalizeProcess(row){
  if(!row)return null;
  const raw=row.raw||row;
  return {
    source:'3022',pcba_sn:pcbaOf(row)||pcbaOf(raw),station:value(row,'station','operation_code','Working Oper Code','Current Oper Code')||value(raw,'Working Oper Code','Station','Station Code','Current Oper Code'),
    operation_code:value(row,'operation_code','Working Oper Code','Current Oper Code'),
    operation_name:value(row,'operation_name','process','Working Oper','Current Oper')||value(raw,'Working Oper','Operation Name','Current Oper'),
    event_time:value(row,'event_time','Tran Time','Transaction Time','Event Time')||value(raw,'Tran Time','Transaction Time','Event Time'),
    operator_id:value(row,'operator_id','Operator ID','Tran User Id','Tran User ID','Transaction User Id','Employee ID','User Id')||value(raw,'Tran User Id','Tran User ID','Transaction User Id','Operator ID','Employee ID','User Id'),
    operator_name:value(row,'operator_name','Operator Name','Tran User Name','Tran User','Transaction User Name','Employee Name','User Name')||value(raw,'Tran User Name','Tran User','Transaction User Name','Operator Name','Employee Name','User Name'),
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

function failureEntry(row,{pcba,repairs=[],process=[],source='2114'}={}){
  if(!row)return null;const actualPcba=pcba||pcbaOf(row);
  return {pcba_sn:actualPcba,defect_code:defectCode(row),defect_desc:defectDesc(row),defect_time:defectTime(row),defect_time_source:value(row,'Defect Time Source','defect_time_source')||source,manual_or_auto:value(row,'manual_or_auto','Manual/Automatic','TestTools Auto Defect Or Defect By Hand'),repair_status:value(row,'repair_status','Repair Status'),defect_type:value(row,'defect_type','Defect Type','Defect Type Desc'),hist_seq:histSeq(row)>=0?histSeq(row):null,relation:value(row,'relation'),failure_family:value(row,'failure_family','Failure Family'),repairs:repairsFor(repairs,{pcba:actualPcba,code:defectCode(row),time:defectTime(row)},row.repair_evidence_3012||[]),analysis_event:preferredAnalysisEvent(process,actualPcba),source,raw:row};
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

// 2114/3012 wall-clock strings are factory-local. Raw 3074 grids are UTC.
// Missing or date-only timestamps cannot establish event order.
function instant(value,offset='-03:00'){
  const raw=text(value);if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw))return null;
  const n=Date.parse(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw)?raw:raw.replace(' ','T')+offset);
  return Number.isFinite(n)?n:null;
}
const sameInstant=(a,b)=>instant(a)!==null&&instant(a)===instant(b);
const knownFamily=f=>text(f)&&!['OUTRO','OTHER','UNKNOWN','UNCLASSIFIED'].includes(text(f).toUpperCase());
function related(current,old){
  const match=compareFailures(current?.defect_code,current?.defect_desc,old?.defect_code,old?.defect_desc,{currentFamily:current?.failure_family??undefined,oldFamily:old?.failure_family??undefined});
  return match.classification==='EXACT'?'MESMA_FALHA':match.classification==='SIMILAR'?'FALHA_SIMILAR':null;
}

function repairIdentity(r){
  // row_key includes comments/observation metadata in 3012: not an intervention ID.
  // A single board intervention may also appear against several defect rows.
  return JSON.stringify([text(r.pcba_sn),instant(r.repair_time),text(r.repair_code),text(r.repair_user)]);
}
function linkedRepairs(failure,before){
  const found=new Map();
  for(const r of failure?.repairs||[]){
    if(r.association!=='exact_occurrence'||!same(r.pcba_sn,failure.pcba_sn)
      ||!same(r.defect_code,failure.defect_code)||!sameInstant(r.defect_time,failure.defect_time))continue;
    const at=instant(r.repair_time),defect=instant(failure.defect_time);
    if(at===null||defect===null||before===null||at<defect||at>=before)continue;
    const key=repairIdentity(r),old=found.get(key);
    if(!old||(!old.repair_comment&&r.repair_comment))found.set(key,r);
  }
  return [...found.values()].sort((a,b)=>instant(b.repair_time)-instant(a.repair_time));
}
function explicitMainboardRepair(r){
  // Free-text mentions, diagnoses, replacement plans and negations are not proof
  // of a completed MainBoard repair. Do not classify a replacement as a repair.
  const structured=[r.repair_desc,r.repair_code,r.repaired_location].map(text).join(' ');
  const all=structured+' '+text(r.repair_comment);
  return /main\s*board|mother\s*board|placa principal|board repair/i.test(structured)
    && /repair|reparo|reparad|consert|rework|retrabalh|sold/i.test(structured)
    && !/\b(?:no|not|without|não|nao|sem|pending|planned|replace|replacement|swap)\b|não realizado|nao realizado|aguard|substitu|troca|recommend|recomend|suspect|suspeit/i.test(all);
}
function rawObject(row){
  if(row?.raw&&typeof row.raw==='object')return row.raw;
  try{return JSON.parse(row?.raw_json||'{}');}catch{return {};}
}
function binding(row,pcba,grid=false){
  return {pcba_sn:pcba,bind_time:value(row,'bind_time_utc','Bind Time'),unbind_time:value(row,'unbind_time_utc','Unbind Time'),
    iss_status_now:text(value(row,'iss_status_now','Iss Status')).toUpperCase(),
    source:'3074',offset:grid?'+00:00':'-03:00',event_count:row.event_count||1};
}
function liveBindings(trace,item,currentPcba){
  const usage=(trace?.component_usage||[]).find(x=>same(x.item_sn,item.item_sn));
  const rows=(usage?.query?.rows||[]).filter(r=>/pcba/i.test(text(r['Sn Type'])));
  const out=rows.map(r=>binding(r,r.Barcode,true));
  for(const r of trace?.query?.rows||[])if(same(r.Barcode,item.item_sn))out.push(binding(r,currentPcba,true));
  return uniq(out);
}
function localBindings(item){
  const raw=rawObject(item);
  return [binding(item,item.current_pcba_sn),...(raw.all_pcba_history||[]).map(r=>binding(r,r.pcba_sn))];
}
function bindingAt(material,pcba,time){
  return (material.bindings||[]).find(b=>{
    const start=instant(b.bind_time,b.offset),end=instant(b.unbind_time,b.offset);
    // An aggregated first-bind/last-unbind interval may hide gaps. Fail closed.
    return same(b.pcba_sn,pcba)&&Number(b.event_count)<=1&&start!==null&&start<=time
      &&(text(b.unbind_time)?end!==null&&end>time:b.iss_status_now==='Y');
  });
}
function enrichFamilies(model){
  for(const failure of [model.current,...model.own_history,...model.materials.flatMap(m=>m.history.map(h=>h.failure))].filter(Boolean)){
    const ctx=(model.process_contexts||[]).find(c=>same(c.pcba_sn,failure.pcba_sn)&&same(c.defect_code,failure.defect_code)&&sameInstant(c.defect_time,failure.defect_time));
    if(!failure.failure_family&&knownFamily(ctx?.failure_family))failure.failure_family=ctx.failure_family;
  }
}
export function buildCorrelationAlerts(model={}){
  const alerts=[],seen=new Set(),current=model.current,currentTime=instant(current?.defect_time);
  model.correlation_limits=[];
  const limit=(code,detail={})=>model.correlation_limits.push({code,...detail});
  if(currentTime===null&&histSeq(current)<0)limit('CURRENT_TIME_UNPROVEN');
  const emit=a=>{const key=JSON.stringify([a.kind,a.pcba_sn,a.item_sn,a.prior_defect_code,instant(a.prior_defect_time),a.prior_hist_seq??null]);if(!seen.has(key)){seen.add(key);alerts.push({...a,classification:'correlation',root_cause_confirmed:false});}};
  const prior=f=>{
    if(same(f?.pcba_sn,model.current_pcba))return failureOrder(f,current).prior;
    // Components belong to a DIFFERENT old PCBA. Defect Hist Seq is local
    // to each PCBA and cannot order two different boards. Use proven instants
    // and the existing 3074 binding proof for cross-board chronology.
    const when=instant(f?.defect_time);
    return currentTime!==null&&when!==null&&when<currentTime;
  };
  const failureEvidence=f=>({pcba_sn:f.pcba_sn,defect_code:f.defect_code,defect_desc:f.defect_desc,defect_time:f.defect_time,
    hist_seq:f.hist_seq??null,repair_status:f.repair_status??null,defect_type:f.defect_type??null,failure_family:f.failure_family,source:f.source});
  const evidence=(f,repairs)=>{
    const clockAmbiguous=['hist_seq_same_clock','hist_seq_only'].includes(failureOrder(f,current).basis);
    const currentCandidates=(current?.repairs||[]).filter(r=>r.association==='exact_occurrence'&&
      instant(r.repair_time)!==null&&(currentTime===null||instant(r.repair_time)>=currentTime));
    const candidateOf=rows=>rows.map(({raw,...r})=>r);
    return {comparison:compareFailures(current?.defect_code,current?.defect_desc,f?.defect_code,f?.defect_desc,{currentFamily:current?.failure_family??undefined,oldFamily:f?.failure_family??undefined}),
      order_basis:failureOrder(f,current).basis,current_failure:failureEvidence(current),failure:failureEvidence(f),
      repairs:candidateOf(repairs),current_3012:clockAmbiguous?[]:candidateOf(currentCandidates),
      // With equal timestamps the 3012 failure identity may match BOTH 2114
      // histories. Preserve the comments, but do not assign either AT.
      // Same PCBA and defect code can surface technician comments even when
      // 2114 has no usable timestamp. Such 3012 rows are NOT attributable to
      // first/second AT unless an exact occurrence link is independently proven.
      candidates_3012: candidateOf([...new Map(
        (model.repairs||[]).filter(r=>same(r.pcba_sn,model.current_pcba)&&
          same(r.defect_code,f.defect_code)&&
          ![...repairs,...currentCandidates].some(ex=>ex.row_key&&ex.row_key===r.row_key))
          .map(r=>[JSON.stringify([r.row_key,r.repair_user,r.repair_time,r.repair_comment]),r])).values()]),
      ambiguous_3012:clockAmbiguous?candidateOf([...new Map(
        [...(f.repairs||[]),...currentCandidates].filter(r=>r.association==='exact_occurrence')
          .map(r=>[JSON.stringify([r.row_key,r.repair_user,r.repair_time,r.repair_comment]),r])).values()]):[]};
  };
  const allFailures=[current,...model.own_history||[],...(model.materials||[]).flatMap(m=>(m.history||[]).map(h=>h.failure))].filter(Boolean);
  const cycleEnd=f=>Math.min(currentTime,...allFailures.filter(x=>same(x.pcba_sn,f.pcba_sn)&&instant(x.defect_time)>instant(f.defect_time)).map(x=>instant(x.defect_time)));
  const boardRepairs=new Map();
  for(const old of model.own_history||[]){
    if(!prior(old)||!same(old.pcba_sn,model.current_pcba)){
      if(instant(old.defect_time)===null&&failureOrder(old,current).basis!=='contradicted')limit('HISTORY_TIME_UNPROVEN',{pcba_sn:old.pcba_sn});
      continue;
    }
    const relation=related(current,old,old.relation);
    const order=failureOrder(old,current);
    const repairs=order.basis==='hist_seq_same_clock'||order.basis==='hist_seq_only'?[]:linkedRepairs(old,cycleEnd(old));
    if(relation)emit({kind:relation==='MESMA_FALHA'?'PCBA_SAME_FAILURE':'PCBA_SAME_FAMILY',severity:relation==='MESMA_FALHA'?'high':'medium',pcba_sn:model.current_pcba,relation,order_basis:order.basis,prior_defect_code:old.defect_code,prior_defect_desc:old.defect_desc,prior_defect_time:old.defect_time,prior_hist_seq:old.hist_seq??null,technician_comment:repairs[0]?.repair_comment||null,sources:[old.source,...new Set(repairs.map(r=>r.source))].filter(Boolean),evidence:evidence(old,repairs)});
    for(const r of repairs.filter(explicitMainboardRepair)){
      const key=repairIdentity(r),existing=boardRepairs.get(key);
      if(existing)existing.occurrences.push({failure:old,relation});
      else boardRepairs.set(key,{repair:r,occurrences:[{failure:old,relation}]});
    }
  }
  for(const material of model.materials||[]){
    for(const hist of material.history||[]){
      const old=hist.failure;if(!old||!prior(old)||same(hist.pcba_sn,model.current_pcba)||!text(material.item_sn))continue;
      const relation=related(current,old,hist.relation_source==='occurrence'?hist.relation:null);
      if(!relation)continue;
      const currentBinding=bindingAt(material,model.current_pcba,currentTime),previousBinding=bindingAt(material,hist.pcba_sn,instant(old.defect_time));
      if(!currentBinding||!previousBinding){limit('COMPONENT_BINDING_UNPROVEN',{item_sn:material.item_sn,pcba_sn:hist.pcba_sn});continue;}
      // The historical failure must precede this installation on the current PCBA.
      if(instant(old.defect_time)>=instant(currentBinding.bind_time,currentBinding.offset))continue;
      const repairs=linkedRepairs(old,cycleEnd(old));
      emit({kind:relation==='MESMA_FALHA'?'COMPONENT_SAME_FAILURE':'COMPONENT_SAME_FAMILY',severity:relation==='MESMA_FALHA'?'high':'medium',item_sn:material.item_sn,item_type:material.item_type,pcba_sn:hist.pcba_sn,current_pcba:model.current_pcba,relation,prior_defect_code:old.defect_code,prior_defect_desc:old.defect_desc,prior_defect_time:old.defect_time,technician_comment:repairs[0]?.repair_comment||null,sources:['3074',old.source,...new Set(repairs.map(r=>r.source))].filter(Boolean),evidence:{...evidence(old,repairs),binding:{item_sn:material.item_sn,previous_pcba:hist.pcba_sn,current_pcba:model.current_pcba,previous:previousBinding,current:currentBinding,source:'3074'}}});
    }
  }
  const boards=[...boardRepairs.values()].sort((a,b)=>instant(b.repair.repair_time)-instant(a.repair.repair_time));
  if(boards.length)emit({kind:boards.length>1?'PCBA_REPEATED_MAINBOARD_REPAIR':'PCBA_MAINBOARD_REPAIR_HISTORY',severity:boards.length>1?'high':'medium',pcba_sn:model.current_pcba,repair_count:boards.length,technician_comment:boards[0].repair.repair_comment||null,sources:[...new Set(boards.map(x=>x.repair.source))],evidence:boards.map(x=>({...evidence(x.occurrences[0].failure,[x.repair]),associated_failures:x.occurrences.map(o=>failureEvidence(o.failure))}))});
  for(const {repair,occurrences} of boards){
    for(const {failure,relation} of occurrences){
      if(!relation)continue;
      const end=cycleEnd(failure);
      const ret=(model.process_contexts||[]).find(c=>same(c.pcba_sn,model.current_pcba)&&c.source==='3022'&&same(c.defect_code,failure.defect_code)&&sameInstant(c.defect_time,failure.defect_time)&&sameInstant(c.repair_event_time,repair.repair_time)&&text(c.return_station_code)&&instant(c.return_event_time)>instant(repair.repair_time)&&instant(c.return_event_time)<end);
      // 3012 + the subsequent 2114 occurrence prove sequence, not a return station.
      emit({kind:'PCBA_MAINBOARD_REPAIR_RECURRENCE',severity:'high',pcba_sn:model.current_pcba,relation,prior_defect_code:failure.defect_code,prior_defect_desc:failure.defect_desc,prior_defect_time:failure.defect_time,repair_count:boards.length,technician_comment:repair.repair_comment||null,sources:[failure.source,repair.source,ret?'3022':null].filter(Boolean),evidence:{...evidence(failure,[repair]),return:ret?{station:ret.return_station_code,operation:ret.return_operation_name,time:ret.return_event_time,source:'3022'}:null}});
    }
  }
  return alerts;
}

export function buildLiveSnForensics(result={}){
  const trace2114=result.trace_2114||null,trace3074=result.trace_3074||null,trace3022=result.trace_3022||null,trace3012=result.trace_3012||null;
  const repairs=trace3012?.rows||result.local_snapshot?.repair_3012||[];
  const queryPcba=result.detected_type==='PCBA'?result.sn:(pcbaOf(trace2114?.current_failure)||result.sn);
  // trace_3022 is the process trace of the queried/current board. Some legacy
  // passage rows omit pcba_sn, so contextualize only those rows to queryPcba.
  // Rows that already carry a PCBA keep that exact identity.
  const process=[...(trace3022?.operator_evidence||[]),...(trace3022?.process_passages||[]),...(trace3022?.rows||[])].map(row=>pcbaOf(row)?row:{...row,pcba_sn:queryPcba});
  const rawByPcba=raw2114ByPcba(trace2114,queryPcba),queryRows=rawByPcba.get(text(queryPcba))||[];
  const statedCurrent=trace2114?.current_failure||null;
  const explicitCurrent=statedCurrent&&!pcbaOf(statedCurrent)&&queryPcba?
    {...statedCurrent,pcba_sn:queryPcba}:statedCurrent;
  const rawCurrent=latestHistory(queryRows);
  // Some 2114 APIs expose a projected "current_failure" without Hist Seq while
  // their own raw rows retain it. Recover ONLY the sequence from the latest
  // raw row when PCBA, code and timestamp match the explicit current exactly.
  // A disagreement in those fields is never reconciled automatically.
  const scopedRaw=explicitCurrent&&rawCurrent&&histSeq(explicitCurrent)<0&&histSeq(rawCurrent)>=0&&
    same(pcbaOf(explicitCurrent),pcbaOf(rawCurrent))&&same(defectCode(explicitCurrent),defectCode(rawCurrent))&&
    sameInstant(defectTime(explicitCurrent),defectTime(rawCurrent));
  const currentRow=scopedRaw?{...rawCurrent,...explicitCurrent,hist_seq:histSeq(rawCurrent)}:(explicitCurrent||rawCurrent);
  const currentCycleUnfailed=trace3074?.material_selection?.cycle_state==='current_new_cycle';
  const lastKnown=failureEntry(currentRow,{pcba:queryPcba,repairs,process,source:explicitCurrent?'2114':'2114-raw'});
  // A post-failure Y mounting is a NEW cycle. 2114's latest record belongs to
  // the old cycle and must not be labelled a current failure of the new parts.
  const current=currentCycleUnfailed?null:lastKnown;
  let ownRows=Array.isArray(trace2114?.previous_failures)?
    trace2114.previous_failures.filter(row=>!pcbaOf(row)||same(pcbaOf(row),queryPcba))
      .map(row=>pcbaOf(row)?row:{...row,pcba_sn:queryPcba}):[];
  if(!ownRows.length&&queryRows.length>1)ownRows=queryRows.filter(row=>!sameHistory(row,rawCurrent));
  const classified=provenPreviousFailures(ownRows,currentRow);
  const ownHistory=[...classified.previous.map(row=>failureEntry(row,{pcba:queryPcba,repairs,process,
    source:Array.isArray(trace2114?.previous_failures)?'2114':'2114-raw'})),
    ...(currentCycleUnfailed&&lastKnown?[lastKnown]:[])].filter(Boolean);
  // A mounting scope includes every selected physical component, not just
  // those already identified as reused. Older offline fixtures may provide
  // reused_components only; do not accidentally restore historical broad lists
  // when the new occurrence-bound selection is present.
  const chosen=['selected_at_latest_2114_candidate','current_mounting_new_cycle',
    'current_mounting_unanchored'].includes(trace3074?.material_selection?.status);
  const reused=new Map((trace3074?.reused_components||[]).map(item=>[text(item.item_sn),item]));
  const scopedItems=chosen?(trace3074?.component_usage||[]):(trace3074?.reused_components||[]);
  const materials=scopedItems.map(sourceItem=>{
    const item=chosen?{...(reused.get(text(sourceItem.item_sn))||{}),...sourceItem}:sourceItem;
    const previous=uniq([...(item.previous_pcbas||[]),...(item.previous_pcba_evidence||[]).map(ev=>ev.pcba_sn)].map(text).filter(Boolean));
    const grouped=new Map();
    for(const ev of item.previous_pcba_evidence||[]){const p=text(ev.pcba_sn);if(!p)continue;if(!grouped.has(p))grouped.set(p,[]);grouped.get(p).push(ev);}
    for(const p of previous)if(!grouped.has(text(p)))grouped.set(text(p),[]);
    const history=[];
    for(const [pcba,evidence] of grouped){
      const withHistory=evidence.filter(ev=>ev.history);
      if(withHistory.length){for(const ev of withHistory){const failure=failureEntry(ev.history,{pcba,repairs:[...(ev.repair_evidence_3012||[]),...repairs],process});history.push({pcba_sn:pcba,relation_source:ev.relation?'occurrence':'aggregate',relation:ev.relation||item.relation_to_current_failure,reason:ev.reason||null,failure});}continue;}
      const rawRows=rawByPcba.get(text(pcba))||[];
      if(rawRows.length){const seed=evidence[0]||{};for(const row of rawRows){history.push({pcba_sn:pcba,relation_source:'aggregate',relation:seed.relation||item.relation_to_current_failure||'HISTORICO_PCBA',reason:seed.reason||'Histórico 2114 retornado diretamente para esta PCBA anterior',failure:failureEntry(row,{pcba,repairs,process,source:'2114-raw'})});}}
      else history.push({pcba_sn:pcba,relation:item.relation_to_current_failure||'SEM_HISTORICO',reason:null,failure:null,repairs:repairsFor(repairs,{pcba}),analysis_event:preferredAnalysisEvent(process,pcba)});
    }
    return {bindings:liveBindings(trace3074,item,queryPcba),item_sn:item.item_sn||null,item_type:item.item_type||null,known_use_count:item.known_use_count??null,reuse_count:item.reuse_count??null,relation:item.relation_to_current_failure||null,previous_pcbas:previous,history,error:item.error||null,source:'3074',raw:item};
  });
  const rawHistoryCount=[...rawByPcba.values()].reduce((sum,rows)=>sum+rows.length,0);
  const gridRows=trace3074?.query?.rows;
  const gridConfirmed=Array.isArray(gridRows)&&
    (gridRows.length>0||trace3074.query?.no_data===true);
  const unknownMaterialTimes=Number(trace3074?.material_selection?.temporal_unknown||0);
  const trace3074State=gridConfirmed
    ?sourceStateFromTrace({...trace3074,status:trace3074.status||'complete'},
        {recordCount:gridRows.length,countProven:true})
    :sourceStateFromTrace(trace3074?.status==='complete'&&!trace3074?.error?
        {...trace3074,status:'partial'}:trace3074,{recordCount:materials.length,countProven:chosen?
        unknownMaterialTimes===0:Array.isArray(trace3074?.reused_components)});
  const itemLookupIncomplete=(trace3074?.component_usage||[]).some(item=>item.error||item.current_pcba_confirmed===false);
  const sourceStates={
    '2114':sourceStateFromTrace(trace2114,{recordCount:Math.max(rawHistoryCount,(current?1:0)+ownHistory.length),countProven:Array.isArray(trace2114?.previous_failures)||Array.isArray(trace2114?.pcbas)||Array.isArray(trace2114?.rows)}),
    '3074':gridConfirmed&&(unknownMaterialTimes>0||itemLookupIncomplete)?SOURCE_STATE.PARTIAL:trace3074State,
    '3022':sourceStateFromTrace(trace3022,{recordCount:process.length,countProven:Boolean(trace3022&&(Array.isArray(trace3022.operator_evidence)||Array.isArray(trace3022.process_passages)||Array.isArray(trace3022.rows)))}),
    '3012':live3012State(result,trace3012),
    '3028':result.local_snapshot?SOURCE_STATE.CACHED:SOURCE_STATE.NOT_COLLECTED,
  };
  const model={board_failure_reference:currentCycleUnfailed?lastKnown:null,
    board_reference_is_historical:currentCycleUnfailed,
    material_selection:trace3074?.material_selection||null,
    candidate_materials:(trace3074?.candidate_components||[]).map(row=>({item_sn:row.item_sn,item_type:row.item_type,
      temporal_reason:row.temporal_reason||'insufficient_binding_evidence',source:'3074'})),
    process_contexts:result.local_snapshot?.process_contexts||[],query_sn:result.sn||null,detected_type:result.detected_type||null,current_pcba:queryPcba,current,own_history:ownHistory,uncertain_previous_count:classified.uncertain,materials,repairs:repairs.map(normalizeRepair).filter(Boolean),analysis_event:preferredAnalysisEvent(process,queryPcba),process:processFor(process,queryPcba),operator_source_3022:trace3022||null,source_states:sourceStates,coverage:{'2114':sourceStateHasEvidence(sourceStates['2114']),'3074':sourceStateHasEvidence(sourceStates['3074']),'3022':sourceStateHasEvidence(sourceStates['3022']),'3012':sourceStateHasEvidence(sourceStates['3012']),'3028':sourceStateHasEvidence(sourceStates['3028'])}};
  enrichFamilies(model);
  const primaryAlerts=buildCorrelationAlerts(model);
  // New Y mounting after the 2114 event does not erase the PCBA's own earlier
  // 2114 recurrence. It ONLY prevents attributing that old fault to new parts.
  // Evaluate historical recurrence against the latest 2114 reference, but
  // never feed the older mounting into CURRENT material/repair correlations.
  if(currentCycleUnfailed&&lastKnown){
    const distinctOld=model.own_history.filter(row=>{
      if(row===lastKnown)return false;
      return failureOrder(row,lastKnown).prior;
    });
    const boardModel={...model,current:lastKnown,own_history:distinctOld,materials:[]};
    const boardHistoryAlerts=buildCorrelationAlerts(boardModel)
      .filter(alert=>['PCBA_SAME_FAILURE','PCBA_SAME_FAMILY'].includes(alert.kind))
      .map(alert=>({...alert,board_reference_is_historical:true}));
    const keys=new Set(primaryAlerts.map(alert=>JSON.stringify([alert.kind,alert.pcba_sn,alert.prior_hist_seq])));
    for(const alert of boardHistoryAlerts){
      const key=JSON.stringify([alert.kind,alert.pcba_sn,alert.prior_hist_seq]);
      if(!keys.has(key)){keys.add(key);primaryAlerts.push(alert);}
    }
  }
  model.alerts=[...primaryAlerts,...compatibleComponentReuseAlerts(model)];
  return model;
}

export function buildLocalSnForensics(result={}){
  if(result.cached_lookup)return buildLiveSnForensics(result.cached_lookup);
  const repairs=result.repair_3012||[],process=result.process_events||[],histories=result.pcba_history||[],query=result.query_sn||null;
  const byPcba=new Map();for(const row of histories){const p=text(pcbaOf(row));if(!p)continue;if(!byPcba.has(p))byPcba.set(p,[]);byPcba.get(p).push(row);}
  const ownRows=byPcba.get(text(query))||[];const currentRaw=latestHistory(ownRows),current=currentRaw?failureEntry(currentRaw,{pcba:query,repairs,process,source:'2114-cache'}):null;const ownHistory=ownRows.filter(row=>row!==currentRaw).map(row=>failureEntry(row,{pcba:query,repairs,process,source:'2114-cache'}));
  const materials=(result.material_reuse||[]).map(item=>{const previous=parseList(value(item,'previous_pcbas_json','previous_pcbas'));return {bindings:localBindings(item),item_sn:value(item,'item_sn','material_sn'),item_type:value(item,'item_type','material_type'),known_use_count:value(item,'total_pcba_count_known_now','known_use_count'),reuse_count:value(item,'previous_pcba_count','reuse_count'),relation:value(item,'relation_to_current_failure'),previous_pcbas:previous,history:previous.flatMap(pcba=>{const rows=byPcba.get(text(pcba))||[];if(rows.length)return rows.map(row=>({pcba_sn:pcba,relation_source:value(row,'relation')?'occurrence':'aggregate',relation:value(row,'relation')||value(item,'relation_to_current_failure')||'SEM_HISTORICO',reason:null,failure:failureEntry(row,{pcba,repairs,process,source:'2114-cache'})}));return [{pcba_sn:pcba,relation:'SEM_HISTORICO',reason:null,failure:null,repairs:repairsFor(repairs,{pcba}),analysis_event:preferredAnalysisEvent(process,pcba)}];}),source:'3074',raw:item};});
  const coverage=result.coverage||{};
  const sourceStates=Object.fromEntries(['3028','3074','2114','3022','3012'].map(source=>[source,coverage[source]?SOURCE_STATE.CACHED:SOURCE_STATE.NOT_COLLECTED]));
  const model={process_contexts:result.process_contexts||[],query_sn:query,detected_type:result.detected_type||null,current_pcba:query,current,own_history:ownHistory,materials,repairs:repairs.map(normalizeRepair).filter(Boolean),analysis_event:preferredAnalysisEvent(process,query),process:processFor(process,query),source_states:sourceStates,coverage};
  enrichFamilies(model);model.alerts=buildCorrelationAlerts(model);return model;
}
