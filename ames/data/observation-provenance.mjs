import {SOURCE_STATE,normalizeSourceState,sourceStateFromTrace,sourceStateHasEvidence} from './source-provenance.mjs';

// Read-only presentation of evidence already present in an A-MES snapshot.
// Transport completion is not the same as factory/source completeness.
export const MES_SOURCE_VIEWS=Object.freeze(['3028','2114','3074','3022','3012']);
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
const known=value=>present(value)?String(value):null;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const explicitState=trace=>Boolean(trace&&(own(trace,'status')||own(trace,'state')||own(trace,'ok')||own(trace,'completed')||own(trace,'error')||own(trace,'reason')));
const recordsOf=(snapshot,view)=>{
  if(view==='3028')return Array.isArray(snapshot?.occurrences)?snapshot.occurrences:null;
  const trace=({2114:snapshot?.pcba_history,3074:snapshot?.material_trace,3022:snapshot?.process_timeline})[view];
  if(view==='3022'){
    const a=Array.isArray(trace?.events)?trace.events:[],b=Array.isArray(trace?.contexts)?trace.contexts:[];
    return Array.isArray(trace?.events)||Array.isArray(trace?.contexts)?[...a,...b]:null;
  }
  return Array.isArray(trace?.records)?trace.records:null;
};
const traceOf=(snapshot,view)=>({2114:snapshot?.pcba_history,3074:snapshot?.material_trace,3022:snapshot?.process_timeline})[view]||null;

export function snapshotProvenance(read={}){
  const snapshot=read?.snapshot||null,canonical=snapshot?.canonical||null;
  const period=canonical?.summary?.period||null;
  const revision=snapshot?.snapshot_revision??snapshot?.revision;
  const validRevision=Number.isSafeInteger(revision)&&revision>0?revision:null;
  return Object.freeze({
    snapshot_id:known(snapshot?.snapshot_id),
    revision:validRevision,
    source_id:known(snapshot?.source_id),
    // source_id identifies the collector/source; it is NOT a verified PC name.
    workstation_id:known(canonical?.workstation_id)||known(canonical?.origin?.workstation_id),
    content_hash:known(snapshot?.content_hash),
    collected_at:known(snapshot?.collected_at),
    period_start:known(period?.start_at),
    period_end:known(period?.end_at),
    line_id:known(snapshot?.line_id),
    coverage:known(snapshot?.coverage?.status),
    transport:known(read?.source),
    freshness:known(read?.freshness),
    read_state:normalizeSourceState(read?.source_state||(!snapshot?'not_collected':read?.source==='local_cache'?'cached':'ok')),
  });
}

export function mesSourceProvenance(read={},view,{observed=false}={}){
  if(!MES_SOURCE_VIEWS.includes(view))throw new TypeError('Unsupported MES source view');
  const snapshot=read?.snapshot||null,meta=snapshotProvenance(read);
  let state=SOURCE_STATE.NOT_COLLECTED,count=null;
  if(snapshot&&view==='3012'){
    // A repair attached to a 3028 occurrence is evidence, not proof that a
    // complete 3012 query covered every repair for the PCBA or period.
    state=observed?SOURCE_STATE.PARTIAL:SOURCE_STATE.NOT_COLLECTED;
  }else if(snapshot&&view==='3028'){
    const rows=recordsOf(snapshot,view);
    const complete=snapshot?.coverage?.status==='complete'&&snapshot?.coverage?.datasets?.defects?.transport_complete===true;
    state=rows===null?SOURCE_STATE.NOT_COLLECTED:complete
      ?sourceStateFromTrace({status:'complete'},{recordCount:rows.length,countProven:true})
      :SOURCE_STATE.PARTIAL;
    if(rows?.length)count=rows.length;
    else if(state===SOURCE_STATE.ZERO)count=0;
  }else if(snapshot){
    const trace=traceOf(snapshot,view),rows=recordsOf(snapshot,view);
    if(explicitState(trace))state=sourceStateFromTrace(trace,{recordCount:rows?.length,countProven:rows!==null});
    else if(rows?.length)state=SOURCE_STATE.PARTIAL;
    if(rows?.length)count=rows.length;
    else if(state===SOURCE_STATE.ZERO)count=0;
  }
  // A cached successful read cannot masquerade as live MES evidence.
  // Preserve explicit source failures/unavailability instead of masking them.
  if(meta.read_state===SOURCE_STATE.CACHED&&sourceStateHasEvidence(state))state=SOURCE_STATE.CACHED;
  return Object.freeze({view,state,count,...meta});
}
