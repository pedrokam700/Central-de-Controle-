import {reuseLinks} from './data/reuse-analysis.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {knownDescription} from './defect-label.mjs';

const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const asRows=(drill,key)=>Array.isArray(drill?.[key])?drill[key]:[];
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??'';
const pcbaOf=row=>String(first(row?.current_pcba_sn,row?.pcba_sn,row?.['PCBA atual'],row?.PCBA,row?.['PCBA'])).trim();
const addPcbas=(target,rows)=>{for(const row of rows){const pcba=pcbaOf(row);if(pcba)target.add(pcba);}return target;};
const intersects=(set,allowed)=>{let count=0;for(const value of set)if(allowed.has(value))count++;return count;};

export function groupedFailureName(row={}){
  return knownDescription(row.defect_desc)||String(row.defect_code||'').trim()||'Falha não identificada';
}

export function evidenceCountLabel(value){
  const count=Number(value?.count||0);
  if(value?.exact)return String(count);
  return count>0?`${count}+`:'—';
}

export function formatFailureLastOccurrence(value){
  const formatted=formatFactoryDateTime(value,{seconds:false});
  if(formatted==='—')return formatted;
  return formatted.replace(/\s+(\d{2}:\d{2})$/,' · $1');
}

export function failureGroupReuseSummaries(snapshot,rows=[],nameOf=groupedFailureName){
  const drill=snapshot?.insights?.drilldowns||{};
  const ownReuse=new Set();
  for(const key of ['pcba_second_use','pcba_3plus_use','pcba_reused_with_prior_failure'])addPcbas(ownReuse,asRows(drill,key));
  const ownReuseExact=own(drill,'pcba_second_use')&&own(drill,'pcba_3plus_use');

  const ownRelated=new Set();
  for(const key of ['pcba_same_failure','pcba_same_family','pcba_second_use_same_failure','pcba_second_use_same_family'])addPcbas(ownRelated,asRows(drill,key));
  const ownRelatedExact=own(drill,'pcba_same_failure')&&own(drill,'pcba_same_family');

  const links=reuseLinks(snapshot||{});
  const componentReuse=new Set(),componentRelated=new Set();
  for(const link of links){
    const pcba=String(link?.pcba||'').trim();if(!pcba)continue;
    componentReuse.add(pcba);
    const relation=String(link.relations||'').toUpperCase();
    if(relation.includes('MESMA FALHA')||relation.includes('MESMA FAMÍLIA'))componentRelated.add(pcba);
  }
  for(const key of ['correlation_same_failure','correlation_same_family','material_same_failure','material_same_family'])addPcbas(componentRelated,asRows(drill,key));
  const componentReuseExact=own(drill,'material_analysis')||(own(drill,'material_second_use')&&own(drill,'material_3plus_use'));
  const componentRelatedExact=(own(drill,'correlation_same_failure')&&own(drill,'correlation_same_family'))||(own(drill,'material_same_failure')&&own(drill,'material_same_family'));

  const byFailure=new Map();
  for(const row of rows){
    const name=nameOf(row),pcba=String(row?.pcba_sn||'').trim();
    if(!byFailure.has(name))byFailure.set(name,new Set());
    if(pcba)byFailure.get(name).add(pcba);
  }
  const result={};
  for(const [name,pcbas] of byFailure){
    const related=new Set([...ownRelated,...componentRelated]);
    result[name]={
      pcbaReuse:{count:intersects(ownReuse,pcbas),exact:ownReuseExact},
      itemReuse:{count:intersects(componentReuse,pcbas),exact:componentReuseExact},
      sameFailureOrFamily:{count:intersects(related,pcbas),exact:ownRelatedExact&&componentRelatedExact},
    };
  }
  return result;
}
