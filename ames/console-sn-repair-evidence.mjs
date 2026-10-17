const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const pcbaOf=row=>text(value(row,'pcba_sn','PCBA','Lot Id','current_pcba_sn'));
const operatorId=row=>text(value(row,'operator_id','Operator ID','Tran User Id','Transaction User Id','Employee ID','User Id'));
const operatorName=row=>text(value(row,'operator_name','Operator Name','Tran User Name','Transaction User Name','Employee Name','User Name'));

function processRows(result={}){
  const trace=result.trace_3022||{};
  return [...(trace.operator_evidence||[]),...(trace.process_passages||[]),...(trace.rows||[])];
}

export function provenRepairUserName(repair={},result={},currentPcba=''){
  const id=text(repair.repair_user),pcba=text(repair.pcba_sn);if(!id||!pcba)return null;
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
  if(user){user.textContent=name?`${name} (${id})`:(id||'—');user.title=name?`3022 · ${name} · ${id}`:id;}
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
