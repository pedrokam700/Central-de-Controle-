const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const pcbaOf=row=>text(value(row,'pcba_sn','PCBA','Lot Id','current_pcba_sn'));
const operatorId=row=>text(value(row,'operator_id','Operator ID','Tran User Id','Tran User ID','Transaction User Id','Employee ID','User Id'));
const normalizedId=v=>text(v).normalize('NFKC').toUpperCase();
const namedField=(row,id,keys)=>keys.map(k=>text(row?.[k])).find(n=>n&&normalizedId(n)!==normalizedId(id))||'';
const operatorName=row=>namedField(row,operatorId(row),['Tran User Name','Employee Name','User Full Name','Tran User Desc','tran_user_name','Operator Name','Transaction User Name','User Name','operator_name','Tran User']);
const scopeOf=row=>({
 source_id:text(value(row,'source_id')??value(row?.provenance,'source_id')),
 line_id:text(value(row,'line_id','line')??value(row?.provenance,'line_id','line'))
});
// Explicit conflicts are rejection evidence; absent metadata in historical MES
// events is not proof of another source, and is not automatically a conflict.
const sameExplicitScope=(left={},right={})=>['source_id','line_id'].every(key=>
 !left[key]||!right[key]||left[key]===right[key]);
const explicitRepairName=repair=>{
 const id=text(value(repair,'repair_user','Repair User'));
 const raw=repair?.raw?.raw&&typeof repair.raw.raw==='object'?repair.raw.raw:repair?.raw||{};
 const keys=['repair_user_name','Repair User Name','RepairUserName','repairUserName','repairUserDesc','repair_user_desc','Repair User Desc','repair_technician_name'];
 return namedField(repair,id,keys)||namedField(raw,id,keys)||null;
};
function resolvedRepairName(repair,operators=[]){
 const id=text(value(repair,'repair_user','Repair User')),pcba=pcbaOf(repair);
 if(!pcba)return null;
 // Direct 3012 fields are proof of the repairer's name independently of
 // the 3022 event used only as a possible identity source.
 const direct=explicitRepairName(repair);if(direct)return direct;
 if(!id)return null;
 const names=new Set(),scope=scopeOf(repair);
 for(const row of operators){
  if(pcbaOf(row)!==pcba||normalizedId(operatorId(row))!==normalizedId(id)||
     !sameExplicitScope(scope,scopeOf(row)))continue;
  const name=operatorName(row);
  if(name&&name!==id)names.add(name);
 }
 return names.size===1?[...names][0]:null;
}


// Older 3022 records can store named staff inside the source adapter. A
// technician name is recovered from that same row, never from a global BRM map.
export function normalize3022OperatorRows(rows=[],{currentPcba='',allowCurrentScope=false}={}){
 const normalized=[],seen=new Set();
 for(const wrapper of rows||[]){
  if(!wrapper||typeof wrapper!=='object')continue;
  const adapter=wrapper.provenance?.adapter||{};
  const nested=[wrapper,wrapper.raw,adapter.operator_evidence,...(adapter.operator_events||[])];
  for(const entry of nested){
   if(!entry||typeof entry!=='object')continue;
   const raw=entry.raw?.raw&&typeof entry.raw.raw==='object'?entry.raw.raw:entry.raw||{};
   const explicit=pcbaOf(entry)||pcbaOf(raw)||pcbaOf(wrapper)||pcbaOf(wrapper.raw);
   const pcba=explicit||(allowCurrentScope?text(currentPcba):'');
   const id=operatorId(entry)||operatorId(raw),name=operatorName(entry)||operatorName(raw);
   if(!pcba||!id||!name||normalizedId(id)===normalizedId(name))continue;
   if(pcbaOf(wrapper)&&pcbaOf(wrapper)!==pcba)continue;
   const station=text(value(raw,'Working Oper Code','Station Code','Station')||
    value(entry,'station','operation_code','Working Oper Code')||
    value(wrapper,'station','operation_code'));
   const eventTime=text(value(raw,'Tran Time','Transaction Time','Event Time')||
    value(entry,'event_time','Tran Time','Event Time')||value(wrapper,'event_time'));
   const wrapperScope=scopeOf(wrapper),entryScope=scopeOf(entry);
   if(!sameExplicitScope(wrapperScope,entryScope))continue;
   const source_id=wrapperScope.source_id||entryScope.source_id;
   const line_id=wrapperScope.line_id||entryScope.line_id;
   const key=JSON.stringify([pcba,id,name,station,eventTime,source_id,line_id]);
   if(seen.has(key))continue;seen.add(key);
   normalized.push({pcba_sn:pcba,operator_id:id,operator_name:name,
    station,event_time:eventTime,source_view:'3022',source_id,line_id});
  }
 }
 return normalized;
}
function processRows(result={}){
 const trace=result.trace_3022||{},current=text(result.sn||result.query_sn);
 const live=[...(trace.operator_evidence||[]),...(trace.process_passages||[]),...(trace.rows||[]),
  ...(trace.pcbas||[]).flatMap(entry=>(entry?.result?.rows||[]).map(row=>({
   ...row,pcba_sn:pcbaOf(row)||entry.pcba_sn})))];
 const local=(result.local_snapshot?.process_events||[]).filter(row=>pcbaOf(row)||pcbaOf(row?.raw));
 return [...normalize3022OperatorRows(live,{currentPcba:current,allowCurrentScope:true}),
  ...normalize3022OperatorRows(local)];
}
export function provenRepairUserName(repair={},result={},currentPcba=''){
 // Same resolver as the 3012 table; current-PCBA scoping is only allowed
 // for raw 3022 rows attached to this exact SN query, not other boards.
 return resolvedRepairName(repair,processRows({...result,
  sn:result.sn||result.query_sn||currentPcba}));
}

// Both the SN story and the 3012 table resolve from identical explicit 3012
// names or an exactly matching PCBA+MES ID, rejecting source/line conflicts.
export function projectRepairTechnicianNames(repairs=[],events=[]){
 const operators=normalize3022OperatorRows(events);
 // A named 3012 row is also an identity witness for the same board and MES ID.
 for(const r of repairs||[]){
  const name=explicitRepairName(r);
  if(name&&r.repair_user&&pcbaOf(r))operators.push({...scopeOf(r),pcba_sn:pcbaOf(r),operator_id:r.repair_user,operator_name:name});
 }
 const witnesses=new Map();
 const key=(board,id)=>JSON.stringify([board,normalizedId(id)]);
 for(const person of operators){
  const k=key(pcbaOf(person),operatorId(person));
  if(!witnesses.has(k))witnesses.set(k,new Map());
  witnesses.get(k).set(JSON.stringify([scopeOf(person),operatorName(person)]),person);
 }
 return (repairs||[]).map(repair=>{
  const people=witnesses.get(key(pcbaOf(repair),value(repair,'repair_user','Repair User')));
  return {...repair,repair_technician_name:resolvedRepairName(repair,people?.values()||[])};
 });
}

const exactRepair=repairs=>(repairs||[]).find(repair=>repair?.association==='exact_occurrence')||null;
function field(block,label){return [...(block?.querySelectorAll('div')||[])].find(div=>div.querySelector('small')?.textContent?.trim()===label)||null;}
function patchRepairBlock(block,repair,result,currentPcba){
  if(!block||!repair)return;
  const user=field(block,'Repair User')?.querySelector('b'),id=text(repair.repair_user),name=provenRepairUserName(repair,result,currentPcba);
  if(user){user.textContent=name?`${name} (${id})`:(id||'—');user.title=name?`Nome registrado no MES · ${name} · ${id}`:'Nome não fornecido nesta evidência MES · '+(id||'sem código');}
  const comment=field(block,'Repair Comment')?.querySelector('b'),raw=repair.repair_comment;
  if(comment&&raw!==undefined&&raw!==null){
    comment.textContent=String(raw);comment.title=String(raw);comment.dataset.repairCommentFull='1';
    comment.style.whiteSpace='pre-wrap';comment.style.overflowWrap='anywhere';comment.style.wordBreak='break-word';comment.style.textOverflow='clip';comment.style.maxWidth='none';
  }
}
function storyRepairBlock(story){return [...(story?.querySelectorAll('.ames-sn-repair-story')||[])].find(block=>!block.classList.contains('ames-sn-binding-story'))||null;}

export function decorateSnRepairEvidence(root,model={},result={}){
  const currentPcba=model.current_pcba||result.sn||'';
  patchRepairBlock(storyRepairBlock(root.querySelector('.ames-sn-current-story')),exactRepair(model.current?.repairs),result,currentPcba);

  const ownStories=[...root.querySelectorAll('.ames-sn-own-history .ames-sn-history-story')];
  ownStories.forEach((story,index)=>patchRepairBlock(storyRepairBlock(story),exactRepair(model.own_history?.[index]?.repairs),result,currentPcba));

  const materialArticles=[...root.querySelectorAll('.ames-sn-material-story')];
  materialArticles.forEach((article,itemIndex)=>{
    const entries=model.materials?.[itemIndex]?.history||[],stories=[...article.querySelectorAll('.ames-sn-history-story')];
    stories.forEach((story,historyIndex)=>{
      const entry=entries[historyIndex]||{},repairs=entry.failure?.repairs||entry.repairs||[];
      patchRepairBlock(storyRepairBlock(story),exactRepair(repairs),result,currentPcba);
    });
  });
}
