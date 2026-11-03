// Grouped 3028 context is investigative, never an exact reuse/defect denominator.
// A reported association needs the same PCBA + defect code + MES defect instant;
// a PCBAs-only join must not borrow an unrelated occurrence's correlation.
import {parseFailureInstant,sameFailureOccurrence} from './data/production-evidence.mjs';
import {boardHistSeqRecurrence} from './data/reuse-cohorts.mjs';
import {compareFailures} from './data/failure-taxonomy.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {knownDescription} from './defect-label.mjs';

const nonempty=v=>v!==null&&v!==undefined&&String(v).trim()!==''?String(v).trim():'';
const first=(row,keys)=>keys.map(k=>nonempty(row?.[k])).find(Boolean)||'';
const pcba=row=>first(row,['current_pcba_sn','PCBA atual','pcba_sn','pcba','PCBA']);
const code=row=>first(row,['defect_code','Defect Code atual','Defect Code']);
const when=row=>first(row,['defect_time','Defect Time atual','Defect Time']);
const named=(snapshot,key)=>Array.isArray(snapshot?.insights?.drilldowns?.[key])?snapshot.insights.drilldowns[key]:[];
const keysOf=(snapshot,keys)=>keys.flatMap(k=>named(snapshot,k));
const identity=row=>{const board=pcba(row),defect=code(row),at=parseFailureInstant(when(row));return board&&defect&&at!==null?JSON.stringify([board,defect,at]):null;};
// An observed DISTINCT count is exact for the rows inspected, even when the
// overall MES extraction is partial. Keep population completeness separate.
const result=(set,allowed)=>({count:[...set].filter(x=>allowed.has(x)).length,
  observed:true,population_complete:false});
export function groupedFailureName(row={}){return knownDescription(row.defect_desc)||nonempty(row.defect_code)||'Falha não identificada';}
export function evidenceCountLabel(value){const n=Number(value?.count||0);
  return value?.exact?String(n):n>0?(value?.observed?String(n):'≥ '+n):'—';}
export function formatFailureLastOccurrence(value){const s=formatFactoryDateTime(value,{seconds:false});return s==='—'?s:s.replace(/\s+(\d{2}:\d{2})$/,' · $1');}


const value=(row,fields)=>fields.map(k=>nonempty(row?.[k])).find(Boolean)||'';
const material=row=>value(row,['material_sn','item_sn','Material SN']);
const ordinal=(row,fields)=>{const v=value(row,fields),m=/^([1-9]\d*)\s*(?:[º°.]?\s*(?:uso|use))?$/i.exec(v);return m?Number(m[1]):null;};
const boardUse=row=>ordinal(row,['_pcba_use_index','pcba_use_index','use_index','Uso da PCBA na falha','Uso PCBA']);
const materialUse=row=>ordinal(row,['material_use_index','known_use_count','total_pcba_count_known_now','Usos conhecidos material','Uso material na falha']);
const unpack=v=>{if(Array.isArray(v))return v;try{const x=JSON.parse(v);if(Array.isArray(x))return x;}catch{}return typeof v==='string'?v.split(/[|,;\n]/).map(x=>x.trim()).filter(Boolean):[];};
const exactFailure=(a,b)=>compareFailures(code(a),a.defect_desc,code(b),b.defect_desc).classification==='EXACT';
const earlier=(h,e)=>{const htime=parseFailureInstant(h.defect_time),etime=parseFailureInstant(e.defect_time);return htime!==null&&etime!==null&&htime<etime;};
function exactEvent(row,event){
 if(pcba(row)!==nonempty(event.pcba_sn))return false;
 const suppliedCode=code(row),suppliedTime=when(row),key=value(row,['current_defect_key','defect_key']);
 if(key&&event.defect_key&&key===nonempty(event.defect_key))
  return sameFailureOccurrence(event,{...row,pcba_sn:pcba(row),defect_key:key});
 return Boolean(suppliedCode&&suppliedTime&&sameFailureOccurrence(event,{...row,pcba_sn:pcba(row),defect_code:suppliedCode,defect_time:suppliedTime}));
}
function boundAtFailure(row,event){
 const time=parseFailureInstant(event.defect_time);if(time===null)return false;
 const from=value(row,['bind_time_utc','bind_time','Bind Time']),to=value(row,['unbind_time_utc','unbind_time','Unbind Time']);
 const started=from?parseFailureInstant(from):null,ended=to?parseFailureInstant(to):null;
 if(from&&started===null||to&&ended===null)return false;
 if(started!==null&&started>time||ended!==null&&ended<=time)return false;
 return Boolean(started!==null||(materialUse(row)>=2&&value(row,['Uso material na falha']))||
 ['Y','YES','TRUE','1'].includes(value(row,['linked_at_defect','binding_active_at_defect','is_current_at_failure']).toUpperCase()));
}
const observed=set=>({count:set.size,observed:true,population_complete:false});

/** Four investigation counts: all units are distinct CURRENT PCBAs by failure
 * mode. Ten reused materials on one board are ONE affected board.
 * Every current component correlation requires an exact occurrence and
 * a source-supported binding at that defect; unknown is not a proven zero.
 */
export function failureGroupReuseSummaries(snapshot,rows=[],nameOf=groupedFailureName){
 const boardReused=new Set(keysOf(snapshot,['pcba_second_use','pcba_3plus_use','pcba_reused_with_prior_failure']).map(pcba).filter(Boolean));
 for(const row of named(snapshot,'pcba_analysis'))if(pcba(row)&&boardUse(row)>=2)boardReused.add(pcba(row));
 const history=snapshot?.pcba_history?.records||[];
 const components=[...(snapshot?.material_trace?.records||[]),...named(snapshot,'material_analysis')];
 const grouped=new Map();
 for(const e of rows){const group=nameOf(e);if(!grouped.has(group))grouped.set(group,{events:[],b:new Set(),bSame:new Set(),materialBoards:new Set(),materialSame:new Set()});if(e.pcba_sn)grouped.get(group).events.push(e);}
 for(const g of grouped.values())for(const e of g.events){
  const board=nonempty(e.pcba_sn);
  if(boardReused.has(board)){
   g.b.add(board);
   if(history.some(h=>pcba(h)===board&&earlier(h,e)&&exactFailure(h,e))||
      boardHistSeqRecurrence(e,history).some(h=>exactFailure(h,e))||
      keysOf(snapshot,['pcba_same_failure','pcba_second_use_same_failure']).some(h=>exactEvent(h,e)))g.bSame.add(board);
  }
  const links=components.filter(r=>material(r)&&materialUse(r)>=2&&exactEvent(r,e)&&boundAtFailure(r,e));
  if(!links.length)continue;
  g.materialBoards.add(board);
  for(const link of links){
   const previous=[...new Set(unpack(value(link,['previous_pcbas_json','previous_pcbas','PCBAs desvinculadas'])).filter(Boolean))];
   if(!previous.length)continue;
   const same=history.some(h=>previous.includes(pcba(h))&&earlier(h,e)&&exactFailure(h,e))||
    keysOf(snapshot,['material_same_failure','correlation_same_failure']).some(h=>material(h)===material(link)&&exactEvent(h,e));
   if(same){g.materialSame.add(board);break;}
  }
 }
 const out={};
 for(const [name,g] of grouped)out[name]={pcbaReuse:observed(g.b),pcbaSameFailure:observed(g.bSame),
  componentAffected:observed(g.materialBoards),componentSameFailureAffected:observed(g.materialSame)};
 return out;
}
