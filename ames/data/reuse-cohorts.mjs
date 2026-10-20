// Read-only populations. A defect investigation is never a production denominator.
import {factoryWallMinute} from './history.mjs';
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
function finish(map){
 return [...map.values()].map(row=>{
  row.uses=unique(row.uses);row.use_index=row.uses.length===1?row.uses[0]:null;
  row.use_conflict=row.uses.length>1;
  row.events=[...new Map(row.events.map(e=>[eventKey(e),e])).values()];
  row.prior_events=[...new Map(row.prior_events.map(e=>[eventKey(e),e])).values()];
  row.previous_pcbas=unique(row.previous_pcbas).sort();
  row.products=unique(row.products).sort();row.part_numbers=unique(row.part_numbers).sort();
  row.outcome=row.kind==='pcba'&&row.events.length?'failed':'unknown';
  // Component association alone is never a diagnosed component failure.
  row.associated_current_failure=row.kind==='component'&&row.events.length>0;
  row.same_failure=row.prior_events.some(p=>code(p)&&row.events.some(e=>code(e)===code(p)));
  row.same_family=row.prior_events.some(p=>family(p)&&row.events.some(e=>family(e)===family(p)));
  row.reused=row.use_index>=2;
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
 const metrics={observed:rows,first_use:select(r=>r.use_index===1),second_use:select(r=>r.use_index===2),
  third_plus_use:select(r=>r.use_index>=3),unknown_use:select(r=>!r.use_index),
  reused,failed:reused.filter(r=>r.outcome==='failed'),
  associated:reused.filter(r=>r.associated_current_failure),prior_failure:reused.filter(r=>r.prior_events.length),
  same_failure:reused.filter(r=>r.same_failure),same_family:reused.filter(r=>r.same_family),
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
   uses:[],events:[],prior_events:[],previous_pcbas:[],products:[],part_numbers:[],evidence:[]});
  const item=map.get(id),use=useIndex(row,kind);if(use&&event)item.uses.push(use);
  item.evidence.push(reference(snapshot,row,source));
  item.products.push(value(row,'product_model','product_key','Modelo')||event?.product_key);
  item.part_numbers.push(value(row,'part_number','Part Number','material_id'));
  const previous=kind==='pcba'?[sn(row)]:list(value(row,'previous_pcbas_json','previous_pcbas','PCBAs desvinculadas'));
  if(kind==='component')item.previous_pcbas.push(...previous);
  if(event){item.events.push(event);const cutoff=time(event);
   item.prior_events.push(...history.filter(h=>previous.includes(sn(h))&&time(h)&&cutoff&&time(h)<cutoff&&code(h)));
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
 const pcbaRows=filter(finish(pcbas)),componentRows=filter(finish(components));
 return {pcbas:{rows:pcbaRows,...summarizeReusePopulation(pcbaRows)},
  components:{rows:componentRows,...summarizeReusePopulation(componentRows)}};
}
