import {compareFailures,describeFailure} from './failure-taxonomy.mjs';
// Read-only populations. A defect investigation is never a production denominator.
import {factoryWallMinute} from './history.mjs';
import {processBackedBoardReuses,contextBackedBoardReuses} from './reuse-cycle-evidence.mjs';
import {compatibleExplicitLineage,parseFailureInstant} from './production-evidence.mjs';
import {reuseHistoryIdentity} from './reuse-history-timeline.mjs';
const value=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null&&v!=='')??null;
const unique=items=>[...new Set(items.filter(v=>v!==null&&v!==undefined&&v!==''))];
const list=v=>{if(Array.isArray(v))return v;try{const x=JSON.parse(v);if(Array.isArray(x))return x;}catch{}return typeof v==='string'?v.split(/[|,;\n]/).map(x=>x.trim()).filter(Boolean):[];};
const sn=r=>String(value(r,'pcba_sn','current_pcba_sn','PCBA','PCBA atual')||'');
const code=r=>String(value(r,'defect_code','Defect Code','Defect Code atual')||'');
const time=r=>factoryWallMinute(value(r,'defect_time','Defect Time','Defect Time atual'));
const family=r=>value(r,'defect_family','failure_family','Família falha');
const index=v=>{const m=/^([1-9]\d*)(?:[ºoª]?\s*uso)?$/i.exec(String(v??'').trim());return m?Number(m[1]):null;};
const useIndex=(r,kind)=>index(kind==='pcba'?value(r,'_pcba_use_index','pcba_use_index','Uso da PCBA na falha'):value(r,'material_use_index','Uso material na falha'));
// Physical self-PCBA cycles proven by 3074 are independent of the use index at
// a particular 3028 defect. Never coerce one into the other.
const knownPcbaCycles=r=>index(value(r,'Usos conhecidos da PCBA','pcba_known_use_count','known_use_count'));
// Source 3074 may retain material reuse history even if it cannot be placed on
// the current 3028 defect clock. This is a distinct physical counter.
const knownMaterialCycles=r=>index(value(r,'Usos conhecidos material','known_use_count','total_pcba_count_known_now'));


const eventKey=r=>JSON.stringify([r.source_id,r.line_id||r.line,r.snapshot_id,r.snapshot_revision??r.revision,
 sn(r),code(r),time(r),r.occurrence_id||r.record_id||r.defect_key||null]);
const sequence=r=>{
 const v=value(r,'hist_seq','Defect Hist Seq');
 return v!==null&&v!==''&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;
};
/** A-MES 2114 analysis scope, separate from a verified new assembly cycle. */
export function analysisScope2114(type){
 const normalized=String(type||'').trim().toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
 if(!normalized)return 'not_recorded';
 if(/main\s*board/.test(normalized))return 'board_disassembly';
 if(/phone\s*disassembly/.test(normalized))return 'phone_disassembly';
 if(/(?:phone\s*)?(?:battery\s*cover|back\s*cover)/.test(normalized))return 'battery_cover_only';
 return 'other';
}
/** Separate 2114 Hist Seq order from source Defect Time.
 * A repeated exact defect on the same PCBA is evidence of recurrence;
 * it DOES NOT prove this 3028 record happened at a particular 2114 time.
 */
export function boardHistSeqRecurrence(occurrence={},history=[]){
 return histSeqRecurrence(occurrence,history,compareFailures);
}
function prepareHistSeq(pcba,history){
 const bySeq=new Map();
 for(const row of history){
  if(sn(row)!==pcba||!code(row))continue;
  const seq=sequence(row);
  if(seq!==null&&!bySeq.has(seq))bySeq.set(seq,row);
 }
 const ordered=[...bySeq].sort((a,b)=>a[0]-b[0]);
 return {ordered,prior:null};
}
function histSeqRecurrence(occurrence,history,compare,prepared){
 const pcba=sn(occurrence);
 if(!pcba||!code(occurrence))return [];
 const state=prepared||prepareHistSeq(pcba,history),ordered=state.ordered;
 if(ordered.length<2)return [];
 const latest=ordered.at(-1)[1];
 const selectedAt=time(occurrence),latestAt=time(latest);
 if(!compatibleExplicitLineage(occurrence,latest)||(selectedAt&&latestAt&&latestAt>selectedAt))return [];
 if(compare(code(occurrence),occurrence.defect_desc,code(latest),latest.defect_desc).classification!=='EXACT')return [];
 // All callers within one projection observe the same immutable source rows.
 // Copies/annotations are prepared once; no cache crosses a snapshot boundary.
 return state.prior??=ordered.slice(0,-1).map(([,old])=>({...old,history_order_basis:'HIST_SEQ_ONLY',history_timestamp_proven:Boolean(time(old))}));
}

/** Auditable whole 2114 history of the same board, independent of a 3028 match.
 * Hist Seq orders MES records (including seq 0), not assembly/use cycles.
 * A same-code repeat within the 2114 sequence is NOT evidence of a
 * specific 3028 defect, of another mounting, or of its original timestamp.
 */
export function board2114Timeline(board,history=[]){
 const id=typeof board==='string'?board:sn(board);
 const original=history.filter(r=>sn(r)===id&&code(r));
 const seen=new Set();
 const records=original.filter(r=>{
  const key=reuseHistoryIdentity({...r,source_view:'2114'});
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>{
  const sa=sequence(a),sb=sequence(b);
  return sa===null&&sb===null?0:sa===null?1:sb===null?-1:sa-sb;
 });
 // Count prior logical identities within compatible lineages. Classification
 // depends on normalized code equality and the taxonomy's family/subtype flags,
 // so descriptions sharing those proven flags can share counters, never rows.
 const scopes=new Map(),descriptors=new Map(),comparisons=new Map();
 const scopeAliases=[['source_id'],['line','line_id'],['snapshot_id'],['snapshot_revision','revision'],['period']];
 const token=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v).trim();
 const scopeKey=r=>JSON.stringify(scopeAliases.map(keys=>keys.map(k=>r[k])));
 const entries=records.map(row=>{
  const scope=scopeKey(row),rawCode=code(row),desc=value(row,'defect_desc','Defect Description');
  const descriptor=JSON.stringify([rawCode,desc]);
  if(!scopes.has(scope))scopes.set(scope,{sample:row,seen:new Set(),counts:new Map(),
   tokens:scopeAliases.map(keys=>keys.map(k=>token(row[k])).find(Boolean)||''),
   valid:compatibleExplicitLineage(row,{})});
  if(!descriptors.has(descriptor)){
   const facts=describeFailure(rawCode,desc);
   descriptors.set(descriptor,{code:rawCode,desc,normalizedCode:facts.code,
    shape:JSON.stringify([facts.family,facts.subtype,facts.ambiguous,facts.negative])});
  }
  return {row,scope,descriptor:descriptors.get(descriptor),seq:sequence(row),logicalKey:JSON.stringify([sequence(row),rawCode,desc])};
 });
 // Narrow scope candidates by the most selective explicit field. Missing
 // fields remain wildcards; the original predicate makes the final decision.
 const byField=scopeAliases.map(()=>new Map()),missing=scopeAliases.map(()=>[]),valid=[];
 for(const [key,state] of scopes)if(state.valid){
  valid.push(key);
  state.tokens.forEach((v,i)=>{if(!v)missing[i].push(key);else{if(!byField[i].has(v))byField[i].set(v,[]);byField[i].get(v).push(key);}});
 }
 const acceptedBy=new Map([...scopes.keys()].map(key=>[key,[]]));
 const scopeSizes=new Map();for(const entry of entries)scopeSizes.set(entry.scope,(scopeSizes.get(entry.scope)||0)+1);
 let sparse=true,work=0;
 scopeQueries: for(const query of scopes.values())if(query.valid){
  let candidates=valid;
  query.tokens.forEach((v,i)=>{if(v){const own=byField[i].get(v)||[];if(own.length+missing[i].length<candidates.length)candidates=[...own,...missing[i]];}});
  for(const key of candidates)if(compatibleExplicitLineage(query.sample,scopes.get(key).sample)){
   work+=scopeSizes.get(key);
   // Incomplete legacy scopes can form a dense wildcard graph. Bound index
   // memory instead of storing a quadratic number of per-query identities.
   // The fallback scans cached facts and preserves every original observation.
   if(work>64*entries.length){sparse=false;acceptedBy.clear();break scopeQueries;}
   acceptedBy.get(key).push(query);
  }
 }
 const insert=(query,entry)=>{
  if(query.seen.has(entry.logicalKey))return;
  query.seen.add(entry.logicalKey);const d=entry.descriptor;
  if(!query.counts.has(d.shape))query.counts.set(d.shape,{total:0,codes:new Map()});
  const group=query.counts.get(d.shape);group.total++;
  if(!group.codes.has(d.normalizedCode))group.codes.set(d.normalizedCode,{sample:d,count:0});
  group.codes.get(d.normalizedCode).count++;
 };
 const priorState=(entry,begin)=>{
  const query=scopes.get(entry.scope);if(sparse)return query;
  const state={seen:new Set(),counts:new Map()};if(!query.valid)return state;
  for(let i=0;i<begin;i++){
   const prior=entries[i],candidate=scopes.get(prior.scope);
   if(prior.seq!==null&&candidate.valid&&query.tokens.every((v,j)=>!v||!candidate.tokens[j]||v===candidate.tokens[j]))insert(state,prior);
  }
  return state;
 };
 const compare=(current,old,equal)=>{
  const key=JSON.stringify([current.shape,old.shape,equal,equal&&Boolean(current.normalizedCode)]);
  if(!comparisons.has(key)){
   if(comparisons.size>=4096)comparisons.clear();
   comparisons.set(key,compareFailures(current.code,current.desc,old.code,old.desc).classification);
  }
  return comparisons.get(key);
 };
 const output=[];
 for(let begin=0;begin<entries.length;){
  let end=begin+1;while(end<entries.length&&entries[end].seq===entries[begin].seq)end++;
  for(let pos=begin;pos<end;pos++){
   const {row,scope,descriptor,seq}=entries[pos],hasOrder=seq!==null;
   let exact=0,similar=0;
   if(hasOrder)for(const group of priorState(entries[pos],begin).counts.values()){
    const equal=group.codes.get(descriptor.normalizedCode);
    if(equal){const kind=compare(descriptor,equal.sample,true);if(kind==='EXACT')exact+=equal.count;else if(kind==='SIMILAR')similar+=equal.count;}
    if(group.total>(equal?.count||0)){
     // At most two entries need inspection to choose an actually observed
     // different code. No synthetic code/label is passed to the classifier.
     let different;for(const [normalized,item] of group.codes)if(normalized!==descriptor.normalizedCode){different=item.sample;break;}
     const kind=compare(descriptor,different,false),count=group.total-(equal?.count||0);
     if(kind==='EXACT')exact+=count;else if(kind==='SIMILAR')similar+=count;
    }
   }
   output.push({...row,hist_seq:seq,defect_code:code(row),defect_desc:value(row,'defect_desc','Defect Description')||null,
    defect_type:value(row,'defect_type','Defect Type')||null,
    analysis_scope:analysisScope2114(value(row,'defect_type','Defect Type')),
    repair_status:value(row,'repair_status','Repair Status')||null,
    manual_or_auto:value(row,'manual_or_auto','TestTools Auto Defect Or Defect By Hand')||null,
    defect_oper:value(row,'defect_oper','Defect Oper')||null,
    defect_time:value(row,'defect_time','Defect Time')||null,
    history_order_proven:hasOrder,
    repeat_exact_prior_count:exact,repeat_family_prior_count:similar,
    recurrence_basis:hasOrder?'2114_HIST_SEQ':'NO_ORDER_PROOF',
    record_id:row.record_id||null});
  }
  // Publish a complete sequence block only afterwards: equal Hist Seq rows
  // remain observations of that sequence, never earlier failures for it.
  if(sparse)for(let pos=begin;pos<end;pos++){
   const entry=entries[pos];if(entry.seq===null)continue;
   for(const query of acceptedBy.get(entry.scope))insert(query,entry);
  }
  begin=end;
 }
 return output;
}

export function materialBoundAtFailure(row,event){
 const observed=parseFailureInstant(event.defect_time);
 const from=value(row,'bind_time_utc','bind_time','Bind Time'),to=value(row,'unbind_time_utc','unbind_time','Unbind Time');
 const start=parseFailureInstant(from),end=parseFailureInstant(to);
 if(observed===null||(from&&start===null)||(to&&end===null)||(start!==null&&start>observed)||(end!==null&&end<=observed))return false;
 const active=String(value(row,'linked_at_defect','binding_active_at_defect','is_current_at_failure')??'').trim().toUpperCase();
 return start!==null||index(row['Uso material na falha'])!==null||['Y','YES','TRUE','1'].includes(active);
}
function exactOccurrence(row,occurrences,kind){
 const candidates=occurrences.filter(o=>sn(o)===sn(row)&&
  (!code(row)||code(row)===code(o))&&(!time(row)||time(row)===time(o))&&
  (!row.current_defect_key||row.current_defect_key===o.defect_key));
 // An SN alone does not locate an occurrence, even if only one is currently loaded.
 const explicit=code(row)&&time(row)||row.current_defect_key;
 if(!explicit||candidates.length!==1)return null;
 const event=candidates[0],bound=factoryWallMinute(row.bind_time_utc);
 if(!compatibleExplicitLineage(row,event))return null;
 const unbound=factoryWallMinute(value(row,'unbind_time_utc','unbind_time','Unbind Time'));
 if(kind==='component'&&((bound&&time(event)&&bound>time(event))||
    (unbound&&time(event)&&unbound<=time(event))))return null;
 return event;
}
function reference(snapshot,row,source){
 return {source_id:snapshot.source_id||snapshot.canonical?.source_id||null,
  snapshot_id:snapshot.snapshot_id,snapshot_revision:snapshot.snapshot_revision||snapshot.revision||null,
  line_id:snapshot.line_id,source_view:source,record_id:row.record_id||null,
  period:snapshot.period||snapshot.canonical?.summary?.period||null,raw:row};
}
// Comparison candidates only: display/evidence arrays remain complete. Native
// Map keys preserve null/undefined and object identity for legacy policy values.
function comparisonRows(rows){
 const groups=new Map(),out=[];
 for(const row of rows){
  const keys=[code(row),row.defect_desc,family(row)];let level=groups;
  for(const key of keys){if(!level.has(key))level.set(key,new Map());level=level.get(key);}
  if(!level.has('seen')){level.set('seen',true);out.push(row);}
 }
 return out;
}
function finish(map,history=[],compare=compareFailures,relations){
 const historyByPcba=new Map();
 for(const row of history){
  const id=sn(row);if(!id||!code(row))continue;
  if(!historyByPcba.has(id))historyByPcba.set(id,[]);
  historyByPcba.get(id).push(row);
 }
 return [...map.values()].map(row=>{
  row.uses=unique(row.uses);row.use_index=row.uses.length===1?row.uses[0]:null;
  row.known_cycle_candidates=unique(row.known_cycle_candidates||[]);
  row.known_mounting_cycles=row.known_cycle_candidates.length===1?row.known_cycle_candidates[0]:null;
  row.known_cycle_conflict=row.known_cycle_candidates.length>1;
  row.use_conflict=row.uses.length>1;
  row.events=[...new Map(row.events.map(e=>[eventKey(e),e])).values()];
  row.prior_events=[...new Map(row.prior_events.map(e=>[eventKey(e),e])).values()];
  row.previous_pcbas=unique(row.previous_pcbas).sort();
  row.current_pcbas=unique(row.current_pcbas||[]).sort();
  row.products=unique(row.products).sort();row.part_numbers=unique(row.part_numbers).sort();
  row.outcome=row.kind==='pcba'&&row.events.length?'failed':'unknown';
  // Component association alone is never a diagnosed component failure.
  row.associated_current_failure=row.kind==='component'&&row.events.length>0;
  row.current_failure_relations=row.events.map(event=>{
   const observed=relations.get(row)?.get(eventKey(event))||new Set();
   const classification=['EXACT','SIMILAR','OTHER'].find(kind=>observed.has(kind))||'UNKNOWN';
   return {event,classification,same_family:observed.has('SIMILAR')};
  });
  row.same_failure=row.current_failure_relations.some(r=>r.classification==='EXACT');
  row.same_family=row.current_failure_relations.some(r=>r.same_family);
  row.reused=row.use_index>=2;
  // A material's 3074 physical mounting history and each board's 2114
  // failures are separate evidence. Never hide three known mountings merely
  // because only one previous failure passed the temporal KPI gate.
  row.binding_history=row.kind==='component'
   ? unique([...row.previous_pcbas,...row.current_pcbas]).map(pcba=>{
     const historical=row.previous_pcbas.includes(pcba);
     const seen=new Set();
     const previousFailures=(historyByPcba.get(pcba)||[]).filter(h=>{
      const key=JSON.stringify([h.record_id||null,sequence(h),code(h),value(h,'defect_desc','Defect Description'),time(h)]);
      if(seen.has(key))return false;seen.add(key);return true;
     }).map(h=>{
      const exact=row.events.some(e=>compare(code(e),e.defect_desc,code(h),h.defect_desc).classification==='EXACT');
      const before=row.events.some(e=>time(e)&&time(h)&&time(h)<time(e));
      return {pcba_sn:pcba,hist_seq:sequence(h),defect_code:code(h),defect_desc:value(h,'defect_desc','Defect Description')||null,
       defect_time:value(h,'defect_time','Defect Time')||null,defect_type:value(h,'defect_type','Defect Type')||null,
       repair_status:value(h,'repair_status','Repair Status')||null,record_id:h.record_id||null,source_view:'2114',
       exact_code_match:exact,chronology_before_current:before};
     });
     const currentFailures=row.events.filter(e=>sn(e)===pcba).map(e=>({
      pcba_sn:pcba,hist_seq:null,defect_code:code(e),defect_desc:e.defect_desc||null,
      defect_time:e.defect_time||null,defect_type:e.defect_type||null,repair_status:e.repair_status||null,
      record_id:e.record_id||e.occurrence_id||null,source_view:'3028',exact_code_match:false,
      chronology_before_current:false}));
     return {pcba_sn:pcba,role:historical?'previous':'investigated',failures:[...previousFailures,...currentFailures]};
    }) : [];
  row.cross_board_recurrences=[];
  if(row.kind==='component'){
   // Physical re-use across *different* PCBAs is the unit of comparison.
   // Several 2114 failures on one board still count as ONE affected board.
   // The association is historical, not an assertion that the component
   // caused the defect or was mounted at its exact Defect Time.
   const groups=[];
   for(const binding of row.binding_history)for(const failure of binding.failures){
    if(!failure.defect_code)continue;
    let group=groups.find(g=>compare(g.defect_code,g.defect_desc,failure.defect_code,failure.defect_desc).classification==='EXACT');
    if(!group){group={defect_code:failure.defect_code,defect_desc:failure.defect_desc,pcbas:new Set()};groups.push(group);}
    group.pcbas.add(binding.pcba_sn);
   }
   row.cross_board_recurrences=groups.filter(g=>g.pcbas.size>=2).map(g=>({
    defect_code:g.defect_code,defect_desc:g.defect_desc,pcbas:[...g.pcbas].sort(),pcba_count:g.pcbas.size
   }));
   for(const binding of row.binding_history)for(const failure of binding.failures){
    failure.recurrence_pcba_count=row.cross_board_recurrences.find(g=>
     compare(g.defect_code,g.defect_desc,failure.defect_code,failure.defect_desc).classification==='EXACT')?.pcba_count||0;
   }
   row.cross_board_same_failure=row.cross_board_recurrences.length>0;
  }
  return row;
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Counts reconcile with their drilldown rows. Complete transport != complete population.
 * Optional proof is for independently established cohorts, never synthesized from defects.
 * The current MES snapshot adapter deliberately supplies no population proof.
 */
export function summarizeReusePopulation(rows,proof=null){
 const reused=rows.filter(r=>r.reused),ids=reused.map(r=>r.id).sort();
 const proven=proof?.population_complete===true&&proof?.evidence_id&&
  Array.isArray(proof.item_ids)&&new Set(proof.item_ids).size===proof.item_ids.length&&
  JSON.stringify([...proof.item_ids].sort())===JSON.stringify(ids)&&ids.length>0&&
  reused.every(r=>['failed','verified_no_failure'].includes(r.outcome)&&r.outcome_evidence_id);
 const select=predicate=>rows.filter(predicate);
 const metrics={observed:rows,
  known_mountings:select(r=>r.known_mounting_cycles>=1),
  known_reused_mountings:select(r=>r.known_mounting_cycles>=2),
  first_use:select(r=>r.use_index===1&&!r.use_lower_bound),
  second_use:select(r=>r.use_index===2&&!r.use_lower_bound),
  third_plus_use:select(r=>r.use_index>=3&&!r.use_lower_bound),unknown_use:select(r=>!r.use_index),
  reused,failed:reused.filter(r=>r.outcome==='failed'),
  associated:reused.filter(r=>r.associated_current_failure),
  // A PCBA's 2114 history may prove recurrence even if its physical
  // mounting/use count is unknown. Components still need proven reuse.
  prior_failure:select(r=>(r.prior_events.length>0||r.kind==='component'&&r.binding_history?.some(b=>b.role==='previous'&&b.failures.some(f=>f.source_view==='2114')))&&(r.kind==='pcba'||r.reused)),
  same_failure:select(r=>r.same_failure&&(r.kind==='pcba'||r.reused)),
  same_family:select(r=>r.same_family&&(r.kind==='pcba'||r.reused)),
  verified_no_failure:proven?reused.filter(r=>r.outcome==='verified_no_failure'):[],
  unknown_outcome:reused.filter(r=>r.outcome!=='failed'&&!(proven&&r.outcome==='verified_no_failure'))};
 return {metrics,counts:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,k==='verified_no_failure'&&!proven?null:v.length])),
  cohort_size_proven:proven?ids.length:null,population_coverage:proven?'proven':'unproven',
  failure_rate:proven?metrics.failed.length/ids.length:null};
}
export function buildReuseCohorts(snapshot={},filters={}){
 const occurrences=(snapshot.occurrences||[]).filter(r=>!r.line_id||r.line_id===snapshot.line_id);
 const history=snapshot.pcba_history?.records||[],pcbas=new Map(),components=new Map();
 // Per-projection indexes/caches cannot leak results across snapshots, scopes
 // or later mutations. Lists preserve source order and duplicate observations.
 const group=(rows,key)=>{const out=new Map();for(const row of rows){const k=key(row);if(!out.has(k))out.set(k,[]);out.get(k).push(row);}return out;};
 const occurrenceByPcba=group(occurrences,sn),historyByPcba=group(history,sn);
 const eventByPcba=group(snapshot.process_timeline?.events||[],sn),contextByPcba=group(snapshot.process_timeline?.contexts||[],sn);
 // The reuse-proof helpers deliberately trim their board IDs and have their
 // own legacy alias order. Their candidate indexes must use those semantics.
 const proofId=r=>String(r?.pcba_sn||r?.PCBA||r?.current_pcba_sn||'').trim();
 const proofHistory=group(history,proofId),proofEvents=group(snapshot.process_timeline?.events||[],proofId),proofContexts=group(snapshot.process_timeline?.contexts||[],proofId);
 const historyEntries=group(history.map((row,position)=>({row,position})),e=>sn(e.row));
 const clockCandidates=new Map();
 const priorRows=previous=>{
  const ids=[...new Set(previous)],key=JSON.stringify(ids);
  if(!clockCandidates.has(key))clockCandidates.set(key,ids.flatMap(id=>historyEntries.get(id)||[])
   .sort((a,b)=>a.position-b.position).map(e=>({row:e.row,at:time(e.row)})).filter(e=>e.at&&code(e.row)));
  return clockCandidates.get(key);
 };
 const relations=new WeakMap();
 const preparedSequences=new Map(),priorMaps=new WeakMap(),eventKeys=new WeakMap(),lastPriors=new WeakMap();
 const keyOf=row=>{if(!eventKeys.has(row))eventKeys.set(row,eventKey(row));return eventKeys.get(row);};
 const addPriors=(item,rows)=>{
  if(!rows.length||lastPriors.get(item)===rows)return;
  lastPriors.set(item,rows);
  if(!priorMaps.has(item))priorMaps.set(item,new Map());
  const prior=priorMaps.get(item);
  // Exactly the existing finish() policy: first key insertion order, last row
  // wins. Apply it while accumulating instead of retaining N copies until finish.
  for(const row of rows)prior.set(keyOf(row),row);
 };
 const comparisons=new Map();
 const compare=(...args)=>{
  // Non-string policy inputs retain the uncached legacy path and identity
  // semantics. Canonical code/description/family fields are strings or absent.
  if(args.slice(0,4).some(v=>v!=null&&typeof v!=='string')||
   ['currentFamily','oldFamily'].some(k=>args[4]?.[k]!==undefined&&typeof args[4][k]!=='string'))return compareFailures(...args);
  const key=JSON.stringify(args);
  if(!comparisons.has(key)){if(comparisons.size>=4096)comparisons.clear();comparisons.set(key,compareFailures(...args));}
  return comparisons.get(key);
 };
 function add(map,id,kind,row,event,source){
  if(!id||!compatibleExplicitLineage(snapshot,row)||((row.line_id||row.line||row.Linha)&&String(row.line_id||row.line||row.Linha)!==snapshot.line_id))return;
  if(!map.has(id))map.set(id,{id,kind,sn:kind==='pcba'?sn(row):String(value(row,'item_sn','material_sn','Material SN')),
   item_type:kind==='component'?String(value(row,'item_type','material_type','Tipo material')||''):null,
   uses:[],known_cycle_candidates:[],events:[],prior_events:[],previous_pcbas:[],current_pcbas:[],products:[],part_numbers:[],evidence:[]});
  const item=map.get(id),use=useIndex(row,kind);
  // Known mounting counts belong to the physical 3074 report only, not 2114 or 3022.
  if((kind==='pcba'&&source==='2114/3074')||(kind==='component'&&source==='3074')){
   const known=kind==='pcba'?knownPcbaCycles(row):knownMaterialCycles(row);
   if(known)item.known_cycle_candidates.push(known);
  }
  // The factory report derives the PCBA use index from the board's own 3074
  // mounting cycles. It is valid physical-use evidence even when its 2114/3074
  // summary cannot be joined to one exact 3028 defect occurrence. Never turn
  // the missing occurrence join into "use unknown"; likewise, never use that
  // independent index to attribute a particular current defect or repair.
  const boardInScope=kind==='pcba'&&source==='2114/3074'&&(occurrenceByPcba.get(id)||[]).length>0&&
   (!time(row)||(occurrenceByPcba.get(id)||[]).some(o=>time(o)&&time(o)>=time(row)));
  // The reused Material SN's physical 3074 mounting index is independently
  // observable, even when no unique 3028 event can be joined. A later 3074
  // binding must never be retroactively attached to the present defect.
  const componentBoard=kind==='component'?(occurrenceByPcba.get(sn(row))||[]):[];
  const materialBound=factoryWallMinute(value(row,'bind_time_utc','bind_time','Bind Time'));
  const materialInScope=kind==='component'&&source==='3074'&&componentBoard.length>0&&
   (!materialBound||componentBoard.some(o=>time(o)&&time(o)>=materialBound));
  if(use&&(event||boardInScope||materialInScope))item.uses.push(use);
  item.evidence.push(reference(snapshot,row,source));
  item.products.push(value(row,'product_model','product_key','Modelo')||event?.product_key);
  item.part_numbers.push(value(row,'part_number','Part Number','material_id'));
  const previous=kind==='pcba'?[sn(row)]:list(value(row,'previous_pcbas_json','previous_pcbas','PCBAs desvinculadas'));
  if(kind==='component'){
   item.previous_pcbas.push(...previous);
   if(sn(row))item.current_pcbas.push(sn(row));
  }
  if(event){item.events.push(event);const cutoff=time(event);
   const bindingProven=kind==='pcba'||materialBoundAtFailure(row,event);
   const priorByClock=bindingProven?priorRows(previous).filter(h=>cutoff&&h.at<cutoff&&
     compatibleExplicitLineage(event,h.row)).map(h=>h.row):[];
   // Hist Seq is a valid order within one 2114 PCBA, including MES variants
   // that never return Defect Time. Never use this rule across materials/PCBAs.
   let priorBySeq=[];
   if(kind==='pcba'){
    const id=sn(event);
    if(!preparedSequences.has(id))preparedSequences.set(id,prepareHistSeq(id,historyByPcba.get(id)||[]));
    priorBySeq=histSeqRecurrence(event,[],compare,preparedSequences.get(id)).filter(h=>
      compatibleExplicitLineage(event,h)&&(!cutoff||!time(h)||time(h)<cutoff));
   }
   addPriors(item,priorByClock);addPriors(item,priorBySeq);
   if(!relations.has(item))relations.set(item,new Map());
   const byEvent=relations.get(item),key=keyOf(event);
   if(!byEvent.has(key))byEvent.set(key,new Set());
   const eligible=byEvent.get(key);
   for(const old of comparisonRows([...priorByClock,...priorBySeq])){
    eligible.add(compare(code(event),event.defect_desc,code(old),old.defect_desc,
      {currentFamily:family(event)??undefined,oldFamily:family(old)??undefined}).classification);
   }
  }
 }
 for(const o of occurrences)add(pcbas,sn(o),'pcba',o,o,'3028');
 for(const row of snapshot.insights?.drilldowns?.pcba_analysis||[]){
  add(pcbas,sn(row),'pcba',row,exactOccurrence(row,occurrenceByPcba.get(sn(row))||[],'pcba'),'2114/3074');
 }
 // Both sources contribute evidence; a physical SN/type is counted only once.
 const materialRows=[...(snapshot.material_trace?.records||[]),...(snapshot.insights?.drilldowns?.material_analysis||[])],byMaterial=new Map();
 for(const row of materialRows){const id=String(value(row,'item_sn','material_sn','Material SN')||'');if(!byMaterial.has(id))byMaterial.set(id,[]);byMaterial.get(id).push(row);}
 for(const row of materialRows){
  const item=value(row,'item_sn','material_sn','Material SN');if(!item)continue;
  let type=String(value(row,'item_type','material_type','Tipo material')||'');
  const candidates=byMaterial.get(String(item))||[];
  const types=unique(candidates.map(r=>value(r,'item_type','material_type','Tipo material')));
  if(!type&&types.length===1)type=String(types[0]);
  const normalized={...row,item_type:type};
  let event=exactOccurrence(normalized,occurrenceByPcba.get(sn(normalized))||[],'component');
  // A summary cannot override a contradictory dated binding in canonical evidence.
  if(event&&candidates.some(r=>sn(r)===sn(row)&&String(value(r,'item_type','material_type','Tipo material')||type)===type&&
    factoryWallMinute(r.bind_time_utc)&&time(event)&&factoryWallMinute(r.bind_time_utc)>time(event)))event=null;
  add(components,JSON.stringify([String(item),type]),'component',normalized,event,'3074');
 }
 for(const item of [...pcbas.values(),...components.values()])item.prior_events=[...(priorMaps.get(item)?.values()||[])];
 const filter=rows=>selectCohortRows(rows,filters);
 const pcbaRows=filter(finish(pcbas,history,compare,relations)),componentRows=filter(finish(components,history,compare,relations));
 // A PCBA's full 2114 sequence is always inspectable even when 3074 has
 // insufficient self-mounting evidence to determine a physical use count.
 // Keep it separate from the current 3028-vs-2114 recurrence KPI.
 for(const board of pcbaRows){
  board.history_2114=board2114Timeline(board.sn,historyByPcba.get(board.sn)||[]);
  board.history_2114_repeats=board.history_2114.filter(h=>h.repeat_exact_prior_count>0).length;
  // 3074 physical self-bindings take precedence. When the self-binding report
  // is absent, corroborated 2114 dismantling + later production 3022 provides
  // a conservative minimum: never count a 2114 row or 3022 station alone.
  const proofBoard=String(board.sn).trim(),boardProofHistory=proofHistory.get(proofBoard)||[],
   boardProofEvents=proofEvents.get(proofBoard)||[],boardProofContexts=proofContexts.get(proofBoard)||[];
  const processProof=board.events.flatMap(event=>[
   ...(boardProofEvents.length?[processBackedBoardReuses(board.sn,event,boardProofHistory,boardProofEvents)]:[]),
   ...(boardProofContexts.length?[contextBackedBoardReuses(board.sn,event,boardProofHistory,boardProofContexts)]:[])
  ]).filter(proof=>proof.minimum_uses).sort((a,b)=>b.minimum_uses-a.minimum_uses)[0];
  board.process_reuse_evidence=processProof||null;
  if(!board.use_index&&board.uses.length===0&&processProof){
   board.use_index=processProof.minimum_uses;
   board.reused=board.use_index>=2;
   board.use_basis=processProof.basis;
   board.use_lower_bound=true;
  }else if(board.use_index)board.use_basis='3074_OWN_PCBA_CYCLES';
  if(!board.use_index){
   board.use_basis=board.use_conflict?'CONFLICTING_3074_ORDINALS':board.known_cycle_conflict
    ?'CONFLICTING_3074_KNOWN_CYCLE_COUNTS':board.known_mounting_cycles
    ?'KNOWN_3074_CYCLES_DEFECT_INTERVAL_UNPROVEN':'INSUFFICIENT_MOUNTING_EVIDENCE';
   board.unproven_use_context={
    previous_2114_failures:board.prior_events.length,
    '2114_records':board.history_2114.length,
    '2114_dismantlings':board.history_2114.filter(h=>['board_disassembly','phone_disassembly'].includes(h.analysis_scope)).length,
    '3022_process_passages':(eventByPcba.get(board.sn)||[]).length,
    '3022_correlations':(contextByPcba.get(board.sn)||[]).length
   };
  }
 }
 // Process-correlated reuse must also be reflected in the metrics and KPI
 // drilldowns; compute only after the auditable cross-source pass above.
 const pcbaSummary=summarizeReusePopulation(pcbaRows);
 return {pcbas:{rows:pcbaRows,...pcbaSummary},
  components:{rows:componentRows,...summarizeReusePopulation(componentRows)}};
}

function selectCohortRows(rows,filters={}){return rows.filter(r=>(!filters.product||r.products.includes(filters.product))&&
  (r.kind==='pcba'||!filters.item_type||r.item_type===filters.item_type)&&(r.kind==='pcba'||!filters.part_number||r.part_numbers.includes(filters.part_number))&&
  (!filters.sn||r.sn.toLowerCase().includes(String(filters.sn).toLowerCase())))}
// Reuse only within one immutable view snapshot; no global snapshot cache.
export function filterReuseCohorts(model,filters={}){
 const pcbas=selectCohortRows(model.pcbas.rows,filters),components=selectCohortRows(model.components.rows,filters);
 return {pcbas:{rows:pcbas,...summarizeReusePopulation(pcbas)},components:{rows:components,...summarizeReusePopulation(components)}};
}
