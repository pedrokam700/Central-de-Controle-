// An AT comment is shown under a failure mode only when it belongs to the
// occurrence. 3012 rows that merely share the PCBA are investigation
// candidates and must not inflate the current-failure comment ranking.
import {parseFailureInstant} from './data/production-evidence.mjs';
import {groupedFailureName} from './failure-group-evidence.mjs';

const text=value=>String(value??'').trim();
const clean=value=>text(value).replace(/\s+/g,' ');
const sameInstant=(a,b)=>{
  const left=parseFailureInstant(a),right=parseFailureInstant(b);
  return left!==null&&right!==null&&left===right;
};

// This is a match for displaying a labelled 3012 investigation candidate,
// never proof that an AT action repaired this particular failure occurrence.
// Both times must exist; SN + failure code alone are not enough.
export function failureOccurrenceCommentKey(row={}){
  const pcba=text(row.pcba_sn),code=text(row.defect_code),at=parseFailureInstant(row.defect_time);
  return pcba&&code&&at!==null?JSON.stringify([pcba,code,at]):'';
}

export function candidate3012CommentsByOccurrence(occurrences=[],history=[]){
  const candidates=new Map();
  for(const repair of history){
    const key=failureOccurrenceCommentKey(repair),comment=clean(repair?.repair_comment);
    if(!key||!comment)continue;
    const byComment=candidates.get(key)||new Map();
    const normalized=comment.toLocaleLowerCase('pt-BR');
    if(!byComment.has(normalized))byComment.set(normalized,{
      comment,source:'3012 · candidato (PCBA, falha e horário coincidentes)',candidate:true
    });
    candidates.set(key,byComment);
  }
  const observed=new Map();
  for(const occurrence of occurrences){
    const key=failureOccurrenceCommentKey(occurrence);
    if(key&&!observed.has(key))observed.set(key,[...(candidates.get(key)?.values()||[])]);
  }
  return observed;
}

export function candidate3012GroupCommentSummaries(occurrences=[],history=[],nameOf=groupedFailureName){
  const byOccurrence=candidate3012CommentsByOccurrence(occurrences,history),groups=new Map(),seen=new Set();
  for(const occurrence of occurrences){
    const key=failureOccurrenceCommentKey(occurrence);
    if(!key)continue;
    const group=nameOf(occurrence),unique=JSON.stringify([group,key]);
    if(seen.has(unique))continue;
    seen.add(unique);
    if(!groups.has(group))groups.set(group,new Map());
    for(const item of byOccurrence.get(key)||[]){
      const normalized=item.comment.toLocaleLowerCase('pt-BR');
      const prior=groups.get(group).get(normalized);
      if(prior)prior.count++;
      else groups.get(group).set(normalized,{...item,count:1});
    }
  }
  return Object.fromEntries([...groups].map(([name,items])=>[name,[...items.values()].sort(
    (a,b)=>b.count-a.count||a.comment.localeCompare(b.comment,'pt-BR'))]));
}

function commentsForOccurrence(occurrence){
  const present=[];
  const direct=clean(occurrence?.repair_comment);
  if(direct)present.push({comment:direct,source:'3028'});
  for(const repair of occurrence?.repair_evidence_3012||[]){
    const association=text(repair?.association).toLowerCase();
    if(repair?.repair_confirmed!==true||!['confirmed','exact_occurrence'].includes(association))continue;
    if(text(repair.pcba_sn)!==text(occurrence.pcba_sn)||
       text(repair.defect_code)!==text(occurrence.defect_code)||
       !sameInstant(repair.defect_time,occurrence.defect_time))continue;
    const comment=clean(repair.repair_comment);
    if(comment)present.push({comment,source:'3012'});
  }
  // Repeated import of one AT observation cannot increment its frequency.
  const unique=new Map();
  for(const item of present){const key=item.comment.toLocaleLowerCase('pt-BR');if(!unique.has(key))unique.set(key,item);}
  return [...unique.values()];
}

export function failureGroupCommentSummaries(rows=[],nameOf=groupedFailureName){
  const groups=new Map();
  for(const occurrence of rows){
    const name=nameOf(occurrence);
    if(!groups.has(name))groups.set(name,new Map());
    for(const item of commentsForOccurrence(occurrence)){
      const key=item.comment.toLocaleLowerCase('pt-BR');
      const existing=groups.get(name).get(key);
      if(existing)existing.count+=1;
      else groups.get(name).set(key,{...item,count:1});
    }
  }
  return Object.fromEntries([...groups].map(([name,items])=>[name,[...items.values()].sort(
    (a,b)=>b.count-a.count||a.comment.localeCompare(b.comment,'pt-BR'))]));
}
