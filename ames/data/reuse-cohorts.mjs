import {compareFailures} from './failure-taxonomy.mjs';
// Read-only populations. A defect investigation is never a production denominator.
import {factoryWallMinute} from './history.mjs';
import {processBackedBoardReuses,contextBackedBoardReuses} from './reuse-cycle-evidence.mjs';
const value=(r,...keys)=>keys.map(k=>r?.[k]).find(v=>v!==undefined&&v!==null&&v!=='')??null;
const unique=items=>[...new Set(items.filter(v=>v!==null&&v!==undefined&&v!==''))];
const list=v=>{if(Array.isArray(v))return v;try{const x=JSON.parse(v);if(Array.isArray(x))return x;}catch{}return typeof v==='string'?v.split(/[|,;\n]/).map(x=>x.trim()).filter(Boolean):[];};
const sn=r=>String(value(r,'pcba_sn','current_pcba_sn','PCBA','PCBA atual')||'');
const code=r=>String(value(r,'defect_code','Defect Code','Defect Code atual')||'');
const time=r=>factoryWallMinute(value(r,'defect_time','Defect Time','Defect Time atual'));
const family=r=>value(r,'defect_family','failure_family','Família falha');
const index=v=>{const m=/^([1-9]\d*)(?:[ºoª]?\s*uso)?$/i.exec(String(v??'').trim());return m?Number(m[1]):null;};
const useIndex=(r,kind)=>index(kind==='pcba'?value(r,'_pcba_use_index','pcba_use_index','Uso da PCBA na falha'):value(r,'material_use_index','Uso material na falha'));
const eventKey=r=>JSON.stringify([sn(r),code(r),time(r),r.occurrence_id||r.record_id||null]);
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
 const pcba=sn(occurrence);
 if(!pcba||!code(occurrence))return [];
 const own=history.filter(r=>sn(r)===pcba&&sequence(r)!==null&&code(r));
 const bySeq=new Map();
 for(const row of own){
  const seq=sequence(row);
  if(!bySeq.has(seq))bySeq.set(seq,row);
 }
 const ordered=[...bySeq].sort((a,b)=>a[0]-b[0]);
 if(ordered.length<2)return [];
 const latest=ordered.at(-1)[1];
 if(compareFailures(code(occurrence),occurrence.defect_desc,code(latest),latest.defect_desc).classification!=='EXACT')return [];
 return ordered.slice(0,-1).map(([,old])=>({...old,history_order_basis:'HIST_SEQ_ONLY',history_timestamp_proven:Boolean(time(old))}));
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
  const key=JSON.stringify([sequence(r),code(r),value(r,'defect_desc','Defect Description'),value(r,'defect_type','Defect Type'),value(r,'repair_status','Repair Status')]);
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>{
  const sa=sequence(a),sb=sequence(b);
  return sa===null&&sb===null?0:sa===null?1:sb===null?-1:sa-sb;
 });
 const earlier=[];
 return records.map(row=>{
  const seq=sequence(row),hasOrder=seq!==null;
  const prior=hasOrder?earlier.filter(r=>sequence(r)!==null&&sequence(r)<seq):[];
  const exact=prior.filter(r=>compareFailures(code(row),value(row,'defect_desc','Defect Description'),code(r),value(r,'defect_desc','Defect Description')).classification==='EXACT');
  const similar=prior.filter(r=>compareFailures(code(row),value(row,'defect_desc','Defect Description'),code(r),value(r,'defect_desc','Defect Description')).classification==='SIMILAR');
  earlier.push(row);
  return {hist_seq:seq,defect_code:code(row),defect_desc:value(row,'defect_desc','Defect Description')||null,
   defect_type:value(row,'defect_type','Defect Type')||null,
   analysis_scope:analysisScope2114(value(row,'defect_type','Defect Type')),
   repair_status:value(row,'repair_status','Repair Status')||null,
   manual_or_auto:value(row,'manual_or_auto','TestTools Auto Defect Or Defect By Hand')||null,
   defect_oper:value(row,'defect_oper','Defect Oper')||null,
   defect_time:value(row,'defect_time','Defect Time')||null,
   history_order_proven:hasOrder,
   repeat_exact_prior_count:exact.length,repeat_family_prior_count:similar.length,
   recurrence_basis:hasOrder?'2114_HIST_SEQ':'NO_ORDER_PROOF',
   record_id:row.record_id||null};
 });
}

function exactOccurrence(row,occurrences,kind){
 const candidates=occurrences.filter(o=>sn(o)===sn(row)&&
  (!code(row)||code(row)===code(o))&&(!time(row)||time(row)===time(o))&&
  (!row.current_defect_key||row.current_defect_key===o.defect_key));
 // An SN alone does not locate an occurrence, even if only one is currently loaded.
 const explicit=code(row)&&time(row)||row.current_defect_key;
 if(!explicit||candidates.length!==1)return null;
 const event=candidates[0],bound=factoryWallMinute(row.bind_time_utc);
 if(kind==='component'&&bound&&time(event)&&bound>time(event))return null;
 return event;
}
function reference(snapshot,row,source){
 return {source_id:snapshot.source_id||snapshot.canonical?.source_id||null,
  snapshot_id:snapshot.snapshot_id,snapshot_revision:snapshot.snapshot_revision||snapshot.revision||null,
  line_id:snapshot.line_id,source_view:source,record_id:row.record_id||null,
  period:snapshot.period||snapshot.canonical?.summary?.period||null,raw:row};
}
function finish(map,history=[]){
 const historyByPcba=new Map();
 for(const row of history){
  const id=sn(row);if(!id||!code(row))continue;
  if(!historyByPcba.has(id))historyByPcba.set(id,[]);
  historyByPcba.get(id).push(row);
 }
 return [...map.values()].map(row=>{
  row.uses=unique(row.uses);row.use_index=row.uses.length===1?row.uses[0]:null;
  row.use_conflict=row.uses.length>1;
  row.events=[...new Map(row.events.map(e=>[eventKey(e),e])).values()];
  row.prior_events=[...new Map(row.prior_events.map(e=>[eventKey(e),e])).values()];
  row.previous_pcbas=unique(row.previous_pcbas).sort();
  row.current_pcbas=unique(row.current_pcbas||[]).sort();
  row.products=unique(row.products).sort();row.part_numbers=unique(row.part_numbers).sort();
  row.outcome=row.kind==='pcba'&&row.events.length?'failed':'unknown';
  // Component association alone is never a diagnosed component failure.
  row.associated_current_failure=row.kind==='component'&&row.events.length>0;
  row.same_failure=row.prior_events.some(p=>row.events.some(e=>compareFailures(code(e),e.defect_desc,code(p),p.defect_desc).classification==='EXACT'));
  row.same_family=row.prior_events.some(p=>row.events.some(e=>compareFailures(code(e),e.defect_desc,code(p),p.defect_desc,{currentFamily:family(e)??undefined,oldFamily:family(p)??undefined}).classification==='SIMILAR'));
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
      const exact=row.events.some(e=>compareFailures(code(e),e.defect_desc,code(h),h.defect_desc).classification==='EXACT');
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
    let group=groups.find(g=>compareFailures(g.defect_code,g.defect_desc,failure.defect_code,failure.defect_desc).classification==='EXACT');
    if(!group){group={defect_code:failure.defect_code,defect_desc:failure.defect_desc,pcbas:new Set()};groups.push(group);}
    group.pcbas.add(binding.pcba_sn);
   }
   row.cross_board_recurrences=groups.filter(g=>g.pcbas.size>=2).map(g=>({
    defect_code:g.defect_code,defect_desc:g.defect_desc,pcbas:[...g.pcbas].sort(),pcba_count:g.pcbas.size
   }));
   for(const binding of row.binding_history)for(const failure of binding.failures){
    failure.recurrence_pcba_count=row.cross_board_recurrences.find(g=>
     compareFailures(g.defect_code,g.defect_desc,failure.defect_code,failure.defect_desc).classification==='EXACT')?.pcba_count||0;
   }
   row.cross_board_same_failure=row.cross_board_recurrences.length>0;
   row.same_failure=row.same_failure||row.cross_board_same_failure;
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
 const metrics={observed:rows,first_use:select(r=>r.use_index===1&&!r.use_lower_bound),
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
 function add(map,id,kind,row,event,source){
  if(!id||((row.line_id||row.line||row.Linha)&&String(row.line_id||row.line||row.Linha)!==snapshot.line_id))return;
  if(!map.has(id))map.set(id,{id,kind,sn:kind==='pcba'?sn(row):String(value(row,'item_sn','material_sn','Material SN')),
   item_type:kind==='component'?String(value(row,'item_type','material_type','Tipo material')||''):null,
   uses:[],events:[],prior_events:[],previous_pcbas:[],current_pcbas:[],products:[],part_numbers:[],evidence:[]});
  const item=map.get(id),use=useIndex(row,kind);
  // The factory report derives the PCBA use index from the board's own 3074
  // mounting cycles. It is valid physical-use evidence even when its 2114/3074
  // summary cannot be joined to one exact 3028 defect occurrence. Never turn
  // the missing occurrence join into "use unknown"; likewise, never use that
  // independent index to attribute a particular current defect or repair.
  const boardInScope=kind==='pcba'&&source==='2114/3074'&&occurrences.some(o=>sn(o)===id)&&
   (!time(row)||occurrences.some(o=>sn(o)===id&&time(o)&&time(o)>=time(row)));
  // The reused Material SN's physical 3074 mounting index is independently
  // observable, even when no unique 3028 event can be joined. A later 3074
  // binding must never be retroactively attached to the present defect.
  const componentBoard=kind==='component'?occurrences.filter(o=>sn(o)===sn(row)):[];
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
   const priorByClock=history.filter(h=>previous.includes(sn(h))&&time(h)&&cutoff&&time(h)<cutoff&&code(h));
   // Hist Seq is a valid order within one 2114 PCBA, including MES variants
   // that never return Defect Time. Never use this rule across materials/PCBAs.
   const priorBySeq=kind==='pcba'?boardHistSeqRecurrence(event,history):[];
   item.prior_events.push(...priorByClock,...priorBySeq);
  }
 }
 for(const o of occurrences)add(pcbas,sn(o),'pcba',o,o,'3028');
 for(const row of snapshot.insights?.drilldowns?.pcba_analysis||[]){
  add(pcbas,sn(row),'pcba',row,exactOccurrence(row,occurrences,'pcba'),'2114/3074');
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
  let event=exactOccurrence(normalized,occurrences,'component');
  // A summary cannot override a contradictory dated binding in canonical evidence.
  if(event&&candidates.some(r=>sn(r)===sn(row)&&String(value(r,'item_type','material_type','Tipo material')||type)===type&&
    factoryWallMinute(r.bind_time_utc)&&time(event)&&factoryWallMinute(r.bind_time_utc)>time(event)))event=null;
  add(components,JSON.stringify([String(item),type]),'component',normalized,event,'3074');
 }
 const filter=rows=>rows.filter(r=>(!filters.product||r.products.includes(filters.product))&&
  (r.kind==='pcba'||!filters.item_type||r.item_type===filters.item_type)&&(r.kind==='pcba'||!filters.part_number||r.part_numbers.includes(filters.part_number))&&
  (!filters.sn||r.sn.toLowerCase().includes(String(filters.sn).toLowerCase())));
 const pcbaRows=filter(finish(pcbas,history)),componentRows=filter(finish(components,history));
 // A PCBA's full 2114 sequence is always inspectable even when 3074 has
 // insufficient self-mounting evidence to determine a physical use count.
 // Keep it separate from the current 3028-vs-2114 recurrence KPI.
 for(const board of pcbaRows){
  board.history_2114=board2114Timeline(board.sn,history);
  board.history_2114_repeats=board.history_2114.filter(h=>h.repeat_exact_prior_count>0).length;
  // 3074 physical self-bindings take precedence. When the self-binding report
  // is absent, corroborated 2114 dismantling + later production 3022 provides
  // a conservative minimum: never count a 2114 row or 3022 station alone.
  const processProof=board.events.flatMap(event=>[
   processBackedBoardReuses(board.sn,event,history,snapshot.process_timeline?.events||[]),
   contextBackedBoardReuses(board.sn,event,history,snapshot.process_timeline?.contexts||[])
  ]).filter(proof=>proof.minimum_uses).sort((a,b)=>b.minimum_uses-a.minimum_uses)[0];
  board.process_reuse_evidence=processProof||null;
  if(!board.use_index&&board.uses.length===0&&processProof){
   board.use_index=processProof.minimum_uses;
   board.reused=board.use_index>=2;
   board.use_basis=processProof.basis;
   board.use_lower_bound=true;
  }else if(board.use_index)board.use_basis='3074_OWN_PCBA_CYCLES';
  if(!board.use_index){
   board.use_basis=board.use_conflict?'CONFLICTING_3074_ORDINALS':'INSUFFICIENT_MOUNTING_EVIDENCE';
   board.unproven_use_context={
    previous_2114_failures:board.prior_events.length,
    '2114_records':board.history_2114.length,
    '2114_dismantlings':board.history_2114.filter(h=>['board_disassembly','phone_disassembly'].includes(h.analysis_scope)).length,
    '3022_process_passages':(snapshot.process_timeline?.events||[]).filter(e=>sn(e)===board.sn).length,
    '3022_correlations':(snapshot.process_timeline?.contexts||[]).filter(e=>sn(e)===board.sn).length
   };
  }
 }
 // Process-correlated reuse must also be reflected in the metrics and KPI
 // drilldowns; compute only after the auditable cross-source pass above.
 const pcbaSummary=summarizeReusePopulation(pcbaRows);
 return {pcbas:{rows:pcbaRows,...pcbaSummary},
  components:{rows:componentRows,...summarizeReusePopulation(componentRows)}};
}
