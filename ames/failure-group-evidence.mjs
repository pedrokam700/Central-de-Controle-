// Grouped 3028 context is investigative, never an exact reuse/defect denominator.
// A reported association needs the same PCBA + defect code + MES defect instant;
// a PCBAs-only join must not borrow an unrelated occurrence's correlation.
import {reuseLinks} from './data/reuse-analysis.mjs';
import {parseFailureInstant} from './data/production-evidence.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {knownDescription} from './defect-label.mjs';

const nonempty=v=>v!==null&&v!==undefined&&String(v).trim()!==''?String(v).trim():'';
const first=(row,keys)=>keys.map(k=>nonempty(row?.[k])).find(Boolean)||'';
const pcba=row=>first(row,['current_pcba_sn','PCBA atual','pcba_sn','PCBA']);
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

export function failureGroupReuseSummaries(snapshot,rows=[],nameOf=groupedFailureName){
 const reuseBoards=new Set(keysOf(snapshot,['pcba_second_use','pcba_3plus_use','pcba_reused_with_prior_failure']).map(pcba).filter(Boolean));
 const itemBoards=new Set(reuseLinks(snapshot||{}).map(x=>nonempty(x.pcba)).filter(Boolean));
 // The newer canonical insight may expose a numeric or a human-readable ordinal
 // instead of the old categorical drilldowns. Count these only when they
 // explicitly prove 2nd+ use; do not infer use from past defects alone.
 const reuseOrdinal=(row,keys)=>{
   const raw=first(row,keys),match=/^(\d+)\s*(?:[º°.]?\s*(?:uso|use))?$/i.exec(raw);
   return match?Number(match[1]):null;
 };
 for(const row of named(snapshot,'pcba_analysis'))
   if(reuseOrdinal(row,['pcba_use_index','use_index','Uso da PCBA na falha','Uso PCBA'])>=2&&pcba(row))reuseBoards.add(pcba(row));
 for(const row of named(snapshot,'material_analysis'))
   if(reuseOrdinal(row,['material_use_index','use_index','known_use_count','Uso material na falha','Usos conhecidos material'])>=2
      &&first(row,['material_sn','item_sn','Material SN'])&&pcba(row))itemBoards.add(pcba(row));
 // Association rows without a concrete defect code/time are not sufficient.
 const relatedIds=new Set(keysOf(snapshot,[
   'pcba_same_failure','pcba_same_family','pcba_second_use_same_failure','pcba_second_use_same_family',
   'correlation_same_failure','correlation_same_family','material_same_failure','material_same_family'
 ]).map(identity).filter(Boolean));
 const grouped=new Map();
 for(const row of rows){
   const group=nameOf(row);if(!grouped.has(group))grouped.set(group,{boards:new Set(),occurrences:new Map()});
   const current=grouped.get(group),board=nonempty(row.pcba_sn),key=identity(row);
   if(board)current.boards.add(board);
   if(key)current.occurrences.set(key,board);
 }
 const output={};
 for(const [name,g] of grouped){
   const relatedBoards=new Set([...g.occurrences].filter(([k])=>relatedIds.has(k)).map(([,board])=>board));
   output[name]={
     pcbaReuse:result(reuseBoards,g.boards),
     itemReuse:result(itemBoards,g.boards),
     sameFailureOrFamily:{count:relatedBoards.size,observed:true,population_complete:false},
   };
 }
 return output;
}
