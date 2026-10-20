import {factoryWallMinute} from './history.mjs';
import {normalizeCanonical} from './canonical.mjs';
import {buildReuseCohorts} from './reuse-cohorts.mjs';
const DAY=86400000;
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const dayOf=e=>factoryWallMinute(e.period_start)?.slice(0,10);
// A single CPH observed among defects is the minimum evidence for
// comparable historical slices. Mixed or missing CPH must fail closed.
const observedCph=point=>{
 const keys=[...new Set((point?.snapshot?.occurrences||[]).map(r=>String(r.product_key||'').trim()).filter(Boolean))];
 return keys.length===1?keys[0]:null;
};
const identity=e=>JSON.stringify([e.line_id,e.source_id,String(e.snapshot_id),e.snapshot_revision,e.content_hash||e.hash]);
const dailyModes=new Set(['today','live','monitor_today','previous_day','historical_refresh']);
function dailyWindow(entry){
 const start=factoryWallMinute(entry.period_start),end=factoryWallMinute(entry.period_end);
 return start?.endsWith('T07:00')&&end>start&&end<=shiftDay(start.slice(0,10),1)+'T07:00';
}
function order(a,b){
 if(String(a.snapshot_id)===String(b.snapshot_id))return Number(b.snapshot_revision)-Number(a.snapshot_revision);
 return String(factoryWallMinute(b.period_end)).localeCompare(String(factoryWallMinute(a.period_end)))||
  ((Date.parse(b.collected_at)||0)-(Date.parse(a.collected_at)||0))||String(b.snapshot_id).localeCompare(String(a.snapshot_id));
}
export function planHistoryDays(entries,{line,source='',endDate,days=7}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||!Number.isInteger(days)||days<1||days>366)throw Error('Invalid history range');
 const rows=entries.filter(e=>e.line_id===line&&(!source||e.source_id===source)&&Number.isInteger(e.snapshot_revision)&&e.snapshot_revision>0&&dailyWindow(e));
 return Array.from({length:days},(_,i)=>{
  const date=shiftDay(endDate,i-days+1),candidates=rows.filter(e=>dayOf(e)===date).sort(order);
  const sources=[...new Set(candidates.map(e=>e.source_id))];
  return {date,status:sources.length>1?'source_conflict':candidates.length?'indexed':'not_collected',candidates};
 });
}
export function trendPoint(snapshot,entry,filters={}){
 const filtered=Object.values(filters).some(Boolean),cohorts=buildReuseCohorts(snapshot,filters);
 const occurrences=snapshot.occurrences.filter(r=>(!filters.product||r.product_key===filters.product)&&(!filters.defect||r.defect_code===filters.defect));
 const componentFilter=filters.item_type||filters.part_number||filters.sn;
 const ids=new Set(cohorts.components.rows.flatMap(r=>r.events.map(e=>e.occurrence_id||e.evidence_ref)));
 const rows=componentFilter?occurrences.filter(e=>ids.has(e.occurrence_id||e.evidence_ref)):occurrences;
 const sourceComplete=snapshot.canonical?.coverage?.defects?.source_complete===true;
 const fullDay=factoryWallMinute(entry.period_end)===shiftDay(dayOf(entry),1)+'T07:00';
 return {date:dayOf(entry),status:sourceComplete&&fullDay?'complete':'partial',entry,snapshot,cohorts,rows,
  fpy:filtered?null:snapshot.summary.fpy,check_fpy:filtered?null:snapshot.summary.check_fpy,
  quantity:filtered?null:snapshot.summary.quantity,observed_failures:rows.length,
  // Occurrence rows can contain multiple failures of one unit. Never call this a defective-unit rate.
  occurrences_per_1000:!filtered&&sourceComplete&&snapshot.summary.quantity>0?rows.length/snapshot.summary.quantity*1000:null,
  pcba_reused:componentFilter?null:cohorts.pcbas.counts.reused,component_reused:cohorts.components.counts.reused,
  component_associated:cohorts.components.rows.some(r=>r.use_index!==null)?cohorts.components.counts.associated:null,
  component_verified_no_failure:cohorts.components.counts.verified_no_failure,
  component_failure_rate:cohorts.components.failure_rate,
  component_denominator:cohorts.components.cohort_size_proven,
  pcba_prior_failure:cohorts.pcbas.rows.some(r=>r.use_index!==null)?cohorts.pcbas.counts.prior_failure:null,
  population_coverage:'unproven'};
}
/** Session-local memo of immutable reads, not a second store or publication path. */
export function createHistoryTrendReader(history){
 const cache=new Map();
 async function open(entry){
  const key=identity(entry);if(cache.has(key))return cache.get(key);
  const payload=await history.open(entry),snapshot=normalizeCanonical(payload);
  if(snapshot.line_id!==entry.line_id||snapshot.source_id!==entry.source_id||String(snapshot.snapshot_id)!==String(entry.snapshot_id)||snapshot.snapshot_revision!==entry.snapshot_revision||
   factoryWallMinute(payload.summary.period?.start_at)!==factoryWallMinute(entry.period_start)||factoryWallMinute(payload.summary.period?.end_at)!==factoryWallMinute(entry.period_end))throw Error('History revision/scope mismatch');
  if(entry.content_hash&&payload.content_hash!==entry.content_hash)throw Error('History content mismatch');
  cache.set(key,snapshot);if(cache.size>366)cache.delete(cache.keys().next().value);return snapshot;
 }
 return {clear(){cache.clear();},async read(options){
  const entries=await history.list(options.line),plan=planHistoryDays(entries,options),points=[];
  for(const day of plan){
   if(day.status!=='indexed'){points.push({...day,candidates:undefined});continue;}
   let point=null;
   for(const entry of day.candidates){
    try{const snapshot=await open(entry);
     // Custom queries are distinct identities, even when their bounds look like a day.
     if(!dailyModes.has(snapshot.canonical.summary.period?.mode))continue;
     point={...trendPoint(snapshot,entry,options.filters),stored_revisions:day.candidates.length};break;
    }catch(error){point={date:day.date,status:'unavailable',error:error.message,entry};break;}
   }
   points.push(point||{date:day.date,status:'not_collected'});
  }
  return {points,sources:[...new Set(entries.filter(e=>e.line_id===options.line).map(e=>e.source_id))].sort()};
 }};
}
export function compareHistoryDays(a,b){
 const comparable=Boolean(a?.snapshot&&b?.snapshot&&a.entry.source_id===b.entry.source_id&&a.entry.line_id===b.entry.line_id&&
  a.status===b.status&&observedCph(a)!==null&&observedCph(a)===observedCph(b)&&
  factoryWallMinute(a.entry.period_end)?.slice(10)===factoryWallMinute(b.entry.period_end)?.slice(10));
 return {comparable,fpy_delta:comparable&&a.fpy!==null&&b.fpy!==null?a.fpy-b.fpy:null,
  observed_failure_delta:comparable?a.observed_failures-b.observed_failures:null};
}
export function historyWeekSummary(points,endDate){
 const monday=shiftDay(endDate,-((new Date(endDate+'T12:00Z').getUTCDay()+6)%7));
 const summarize=(start,end)=>{
  const days=points.filter(p=>p.date>=start&&p.date<=end),loaded=days.filter(p=>p.snapshot);
  const scopes=[...new Set(loaded.map(p=>JSON.stringify([p.entry.source_id,p.entry.line_id,observedCph(p)])))];
  const scopeKnown=loaded.length>0&&scopes.length===1&&observedCph(loaded[0])!==null;
  return {start,end,observed_days:loaded.length,expected_days:Math.round((Date.parse(end)-Date.parse(start))/DAY)+1,
   scope_key:scopeKnown?scopes[0]:null,scope_mixed:loaded.length>0&&!scopeKnown,
   observed_failures:loaded.length?loaded.reduce((n,p)=>n+p.observed_failures,0):null,
   quantity:loaded.length&&loaded.every(p=>p.quantity!==null)?loaded.reduce((n,p)=>n+p.quantity,0):null,
   complete:loaded.length===7&&loaded.every(p=>p.status==='complete'),fpy:null};
 };
 return {current:summarize(monday,endDate),previous:summarize(shiftDay(monday,-7),shiftDay(monday,-1))};
}
