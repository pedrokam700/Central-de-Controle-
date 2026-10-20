const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const pcbaOf=row=>text(value(row,'pcba_sn','PCBA','Lot Id','current_pcba_sn'));
const operatorId=row=>text(value(row,'operator_id','Operator ID','Tran User Id','Transaction User Id','Employee ID','User Id'));
const operatorName=row=>text(value(row,'operator_name','Operator Name','Tran User Name','Transaction User Name','Employee Name','User Name'));

function processRows(result={}){
  const trace=result.trace_3022||{};
  return [...(trace.operator_evidence||[]),...(trace.process_passages||[]),...(trace.rows||[]),...(result.process_events||[])].map(row=>({...row.raw,...row}));
}

export function provenRepairUserName(repair={},result={},currentPcba=''){
  const id=text(repair.repair_user),pcba=text(repair.pcba_sn);if(!id||!pcba)return null;
  // A name is trustworthy only if it is an explicit field belonging to this
  // same 3012 repair row, or comes from a 3022 row with the identical user ID
  // and PCBA. A bare BRM code is never reverse-guessed into a human name.
  const raw=repair.raw?.raw&&typeof repair.raw.raw==='object'?repair.raw.raw:repair.raw||{};
  const candidates=['repairUserName','Repair User Name','repair_user_name','RepairUserName'];
  const rawName=candidates.map(key=>text(raw[key])).find(name=>name&&name!==id);
  if(rawName)return rawName;
  const direct=text(repair.repair_user_name);
  if(direct&&direct!==id)return direct;
  const current=text(currentPcba||result.sn),names=new Set();
  for(const row of processRows(result)){
    const explicit=pcbaOf(row),rowPcba=explicit||current;
    // Rows without a board identity may only belong to the currently queried PCBA.
    if(rowPcba!==pcba||operatorId(row)!==id)continue;
    const name=operatorName(row);if(name)names.add(name);
  }
  return names.size===1?[...names][0]:null;
}

const exactRepair=repairs=>(repairs||[]).find(repair=>repair?.association==='exact_occurrence')||null;
function field(block,label){return [...(block?.querySelectorAll('div')||[])].find(div=>div.querySelector('small')?.textContent?.trim()===label)||null;}
function patchRepairBlock(block,repair,result,currentPcba){
  if(!block||!repair)return;
  const user=field(block,'Repair User')?.querySelector('b'),id=text(repair.repair_user),name=provenRepairUserName(repair,result,currentPcba);
  if(user){user.textContent=name?`${name} (${id})`:(id?id+' · '+(document.documentElement.lang.startsWith('en')?'name not identified':'nome não identificado'):'—');user.title=name?`Nome registrado no MES · ${name} · ${id}`:'Nome não fornecido nesta evidência MES · '+(id||'sem código');}
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
