import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {relationLabel} from './data/sn-forensics.mjs';
import {provenRepairUserName} from './console-sn-repair-evidence.mjs';

const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const number=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
const instant=value=>{const raw=text(value);if(!raw)return null;const n=Date.parse(raw);return Number.isFinite(n)?n:null;};
const same=(a,b)=>text(a)!==''&&text(a)===text(b);
const sameInstant=(a,b)=>{const aa=instant(a),bb=instant(b);return aa!==null&&bb!==null&&aa===bb;};
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);

function ordinal(n,locale){
  if(!Number.isFinite(Number(n))||Number(n)<1)return '—';
  n=Number(n);
  if(!String(locale||'pt-BR').startsWith('en'))return `${n}º uso`;
  const mod100=n%100,mod10=n%10,suffix=mod100>=11&&mod100<=13?'th':mod10===1?'st':mod10===2?'nd':mod10===3?'rd':'th';
  return `${n}${suffix} use`;
}

function occurrenceMatch(row,current={}){
  const pcba=value(row,'PCBA','pcba_sn','PCBA atual','current_pcba_sn');
  if(current.pcba_sn&&pcba&&!same(pcba,current.pcba_sn))return -1;
  let score=pcba&&same(pcba,current.pcba_sn)?8:0;
  const code=value(row,'Defect Code','defect_code','Defect Code atual');
  const at=value(row,'Defect Time','defect_time','Defect Time atual');
  if(current.defect_code&&code&&same(code,current.defect_code))score+=4;
  if(current.defect_time&&at&&sameInstant(at,current.defect_time))score+=4;
  return score;
}

function usageCandidates(model={},result={}){
  const local=result.local_snapshot||{};
  const lists=[
    result.pcba_usage_rows,
    result.trace_insights?.pcba_rows,
    result.insights?.pcba_rows,
    local.trace_insights?.pcba_rows,
    local.pcba_rows,
  ];
  const rows=lists.flatMap(list=>Array.isArray(list)?list:[]);
  if(model.current?.raw)rows.push(model.current.raw);
  rows.push(...(model.process_contexts||[]));
  return rows;
}

export function pcbaUsageEvidence(model={},result={}){
  const current=model.current||{};
  const ranked=usageCandidates(model,result).map(row=>({row,score:occurrenceMatch(row,current)})).filter(item=>item.score>=0).sort((a,b)=>b.score-a.score);
  const row=ranked[0]?.row||{};
  const useIndex=number(value(row,'_pcba_use_index','Uso da PCBA na falha','pcba_use_index','use_index'));
  const knownUses=number(value(row,'Usos conhecidos da PCBA','pcba_known_use_count','known_use_count'));
  const previousUses=number(value(row,'Reusos anteriores da PCBA','pcba_previous_use_count','previous_use_count','reuse_count'));
  const proven=useIndex!==null||knownUses!==null||previousUses!==null;
  return {
    proven,
    use_index:useIndex,
    known_uses:knownUses,
    previous_uses:previousUses,
    source:proven?text(value(row,'source','Fonte','source_view'))||'V0.16 / evidência local':null,
  };
}

function sortedFailures(model={}){
  const rows=[...(model.own_history||[]),...(model.current?[model.current]:[])];
  return rows.map(row=>({row,at:instant(row.defect_time)})).sort((a,b)=>{
    if(a.at===null&&b.at===null)return 0;if(a.at===null)return 1;if(b.at===null)return -1;return a.at-b.at;
  }).map(item=>item.row);
}

function sortedRepairs(failure={}){
  return (failure.repairs||[]).filter(row=>row?.association==='exact_occurrence').slice().sort((a,b)=>{
    const aa=instant(a.repair_time),bb=instant(b.repair_time);if(aa===null&&bb===null)return 0;if(aa===null)return 1;if(bb===null)return -1;return aa-bb;
  });
}

function repairTimeline(failure,result,currentPcba,locale){
  const exact=sortedRepairs(failure),candidates=(failure.repairs||[]).filter(row=>row?.association!=='exact_occurrence');
  if(!exact.length){
    const note=candidates.length?t(locale,'Existem registros 3012 da mesma PCBA, mas sem vínculo exato com esta ocorrência.','There are 3012 records for the same PCBA, but without an exact link to this occurrence.'):t(locale,'Nenhum reparo 3012 foi vinculado exatamente a esta ocorrência.','No 3012 repair was exactly linked to this occurrence.');
    return `<div class="ames-sn-forensic-empty">${esc(note)}</div>`;
  }
  return `<div class="ames-sn-repair-cycles">${exact.map((repair,index)=>{
    const name=provenRepairUserName(repair,result,currentPcba),id=text(repair.repair_user),person=name?`${name} (${id})`:(id||'—');
    return `<article class="ames-sn-repair-story" data-sn-repair-cycle="${index+1}"><div><small>${esc(t(locale,`Reparo ${index+1}`,`Repair ${index+1}`))}</small><b>${esc(time(repair.repair_time))}</b></div><div><small>Repair User</small><b>${esc(person)}</b></div><div><small>Repair Code</small><b>${esc(fmt(repair.repair_code))}</b></div><div><small>${esc(t(locale,'Local reparado','Repaired location'))}</small><b>${esc(fmt(repair.repaired_location))}</b></div><div class="wide"><small>Repair Comment</small><b data-repair-comment-full style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(fmt(repair.repair_comment))}</b></div><div class="wide"><small>${esc(t(locale,'Motivo / descrição','Reason / description'))}</small><b>${esc(fmt(repair.reason_desc||repair.repair_desc))}</b></div></article>`;
  }).join('')}</div>`;
}

function processEvidence(failure,locale){
  const event=failure?.analysis_event;if(!event)return `<div class="ames-sn-forensic-empty">${esc(t(locale,'Sem passagem 3022 vinculada a esta ocorrência.','No 3022 passage linked to this occurrence.'))}</div>`;
  const person=[event.operator_name,event.operator_id].filter(Boolean).join(' · ')||'—';
  return `<div class="ames-sn-process-story"><div><small>${esc(t(locale,'Posto','Station'))}</small><b>${esc(fmt(event.station))}</b></div><div><small>${esc(t(locale,'Processo','Process'))}</small><b>${esc(fmt(event.operation_name))}</b></div><div><small>${esc(t(locale,'Operador','Operator'))}</small><b>${esc(person)}</b></div><div><small>${esc(t(locale,'Horário','Time'))}</small><b>${esc(time(event.event_time))}</b></div></div>`;
}

function failureDetails(failure,{current=false,result={},currentPcba='',locale='pt-BR',index=0}={}){
  const title=current?t(locale,'Falha atual','Current failure'):t(locale,`Falha anterior ${index}`,`Previous failure ${index}`);
  const histSeq=value(failure?.raw,'Defect Hist Seq','hist_seq');
  return `<details class="ames-sn-history-detail-item" ${current?'open':''} data-sn-pcba-failure><summary><span>${esc(title)}</span><b>${esc(fmt(failure?.defect_code))} · ${esc(fmt(failure?.defect_desc))}</b><time>${esc(time(failure?.defect_time))}</time></summary><div class="ames-sn-history-detail-body"><div class="ames-sn-repair-story"><div><small>PCBA</small><b>${esc(fmt(failure?.pcba_sn))}</b></div><div><small>Defect Time</small><b>${esc(time(failure?.defect_time))}</b></div><div><small>Manual / Automatic</small><b>${esc(fmt(failure?.manual_or_auto))}</b></div><div><small>Repair Status</small><b>${esc(fmt(failure?.repair_status))}</b></div><div><small>Defect Hist Seq</small><b>${esc(fmt(histSeq))}</b></div><div><small>${esc(t(locale,'Família','Family'))}</small><b>${esc(fmt(failure?.failure_family))}</b></div><div class="wide"><small>${esc(t(locale,'Fonte da falha','Failure source'))}</small><b>${esc(fmt(failure?.source))}</b></div></div><h5>3012 · ${esc(t(locale,'Reparos vinculados','Linked repairs'))}</h5>${repairTimeline(failure,result,currentPcba,locale)}<h5>3022 · ${esc(t(locale,'Processo comprovado','Proven process'))}</h5>${processEvidence(failure,locale)}</div></details>`;
}

function bindingRows(item={},currentPcba=''){
  const seen=new Set(),rows=[];
  for(const binding of item.bindings||[]){
    const pcba=text(binding?.pcba_sn);if(!pcba)continue;
    const key=JSON.stringify([pcba,text(binding.bind_time),text(binding.unbind_time),text(binding.offset),Number(binding.event_count)||1]);if(seen.has(key))continue;seen.add(key);
    rows.push({pcba_sn:pcba,bind_time:binding.bind_time||null,unbind_time:binding.unbind_time||null,offset:binding.offset||undefined,event_count:Math.max(1,Number(binding.event_count)||1),source:binding.source||'3074'});
  }
  rows.sort((a,b)=>{const aa=instant(a.bind_time),bb=instant(b.bind_time);if(aa===null&&bb===null)return a.pcba_sn.localeCompare(b.pcba_sn);if(aa===null)return 1;if(bb===null)return -1;return aa-bb;});
  const orderProven=rows.length>0&&rows.every(row=>instant(row.bind_time)!==null&&row.event_count===1);
  return rows.map((row,index)=>({...row,role:same(row.pcba_sn,currentPcba)?'current':'previous',use_index:orderProven?index+1:null,order_proven:orderProven}));
}

function materialDetail(item,model,result,locale){
  const bindings=bindingRows(item,model.current_pcba),history=item.history||[];
  const relation=relationLabel(item.relation)||'—';
  return `<details class="ames-sn-history-detail-item ames-sn-material-detail" data-sn-material-detail><summary><span>${esc(fmt(item.item_type||t(locale,'Material','Material')))}</span><b>${esc(fmt(item.item_sn))}</b><small>${esc(t(locale,'Usos conhecidos','Known uses'))}: ${esc(fmt(item.known_use_count))} · ${esc(t(locale,'Reusos','Reuses'))}: ${esc(fmt(item.reuse_count))} · ${esc(relation)}</small></summary><div class="ames-sn-history-detail-body"><h5>3074 · ${esc(t(locale,'Linha do tempo de vínculos','Binding timeline'))}</h5>${bindings.length?`<div class="ames-sn-binding-timeline">${bindings.map(row=>{
    const use=row.use_index?ordinal(row.use_index,locale):t(locale,'Ordem não comprovada','Order not proven');
    const role=row.role==='current'?t(locale,'PCBA atual','Current PCBA'):t(locale,'PCBA anterior','Previous PCBA');
    return `<article class="ames-sn-repair-story ames-sn-binding-story"><div><small>${esc(use)}</small><b>${esc(row.pcba_sn)}</b><span>${esc(role)}</span></div><div><small>${esc(t(locale,'Vínculo','Bound'))}</small><b>${esc(row.bind_time?time(row.bind_time,{naiveOffset:row.offset}):'—')}</b></div><div><small>${esc(t(locale,'Desvínculo','Unbound'))}</small><b>${esc(row.unbind_time?time(row.unbind_time,{naiveOffset:row.offset}):'—')}</b></div><div><small>${esc(t(locale,'Fonte','Source'))}</small><b>${esc(row.source)}</b>${row.event_count>1?`<span>${esc(`${row.event_count} ${t(locale,'eventos agregados','aggregated events')}`)}</span>`:''}</div></article>`;
  }).join('')}</div>`:`<div class="ames-sn-forensic-empty">${esc(t(locale,'3074 confirmou o reuso, mas não retornou horários de vínculo suficientes para numerar os usos.','3074 confirmed reuse but did not return enough binding times to number the uses.'))}</div>`}<h5>2114 + 3012 · ${esc(t(locale,'PCBAs anteriores e falhas','Previous PCBAs and failures'))}</h5>${history.length?history.map((entry,index)=>{
    const failure=entry.failure;
    return `<section class="ames-sn-component-pcba"><div class="ames-sn-repair-story"><div><small>${esc(t(locale,'PCBA anterior','Previous PCBA'))}</small><b>${esc(fmt(entry.pcba_sn))}</b></div><div><small>${esc(t(locale,'Relação','Relation'))}</small><b>${esc(relationLabel(entry.relation)||'—')}</b></div><div class="wide"><small>${esc(t(locale,'Motivo','Reason'))}</small><b>${esc(fmt(entry.reason))}</b></div></div>${failure?failureDetails(failure,{current:false,result,currentPcba:model.current_pcba,locale,index:index+1}):`<div class="ames-sn-forensic-empty">${esc(t(locale,'PCBA confirmada pela 3074, sem falha 2114 comprovada nesta resposta.','PCBA confirmed by 3074, with no proven 2114 failure in this response.'))}</div>`}</section>`;
  }).join(''):`<div class="ames-sn-forensic-empty">${esc(t(locale,'Nenhuma PCBA anterior com histórico 2114 foi comprovada nesta resposta.','No previous PCBA with 2114 history was proven in this response.'))}</div>`}${model.current?`<details class="ames-sn-current-context"><summary>${esc(t(locale,'Ver falha atual da PCBA como contexto do material','View current PCBA failure as material context'))}</summary><p>${esc(t(locale,'Contexto não significa causa do componente.','Context does not mean the component caused the failure.'))}</p>${failureDetails(model.current,{current:true,result,currentPcba:model.current_pcba,locale})}</details>`:''}</div></details>`;
}

export function renderSnHistoryDetail(model={},result={},locale='pt-BR'){
  const usage=pcbaUsageEvidence(model,result),failures=sortedFailures(model),currentKey=model.current?JSON.stringify([model.current.pcba_sn,model.current.defect_code,model.current.defect_time]):'';
  const previousCount=model.own_history?.length||0,repairCount=failures.reduce((sum,failure)=>sum+sortedRepairs(failure).length,0);
  const usageLabel=usage.use_index!==null?ordinal(usage.use_index,locale):'—';
  return `<div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Histórico detalhado da própria PCBA','Detailed PCBA history'))}</h3><p>${esc(t(locale,'Falhas 2114, reparos 3012 e processo 3022 ficam separados em ordem cronológica. Número de uso só aparece quando existe evidência específica; falha não é tratada como uso.','2114 failures, 3012 repairs and 3022 process stay separated chronologically. Use number is shown only when specific evidence exists; a failure is not treated as a use.'))}</p></div><span class="status">${esc(fmt(model.current_pcba))}</span></div><div class="ames-inline-facts"><span>${esc(t(locale,'Uso da PCBA na ocorrência','PCBA use at occurrence'))} <b>${esc(usageLabel)}</b></span><span>${esc(t(locale,'Usos conhecidos da PCBA','Known PCBA uses'))} <b>${esc(fmt(usage.known_uses))}</b></span><span>${esc(t(locale,'Reusos anteriores da PCBA','Previous PCBA reuses'))} <b>${esc(fmt(usage.previous_uses))}</b></span><span>${esc(t(locale,'Falhas anteriores 2114','Previous 2114 failures'))} <b>${esc(previousCount)}</b></span><span>${esc(t(locale,'Reparos 3012 vinculados','Linked 3012 repairs'))} <b>${esc(repairCount)}</b></span></div>${usage.proven?`<small class="ames-sn-evidence-note">${esc(t(locale,'Evidência de uso','Use evidence'))}: ${esc(usage.source||'—')}</small>`:`<div class="ames-sn-forensic-empty">${esc(t(locale,'O número de uso da própria PCBA não foi comprovado pelas fontes desta consulta; permanece — e não é inferido pelo número de falhas.','The queried sources did not prove this PCBA use number; it remains — and is not inferred from the number of failures.'))}</div>`}<div class="ames-sn-pcba-timeline">${failures.length?failures.map((failure,index)=>{
    const key=JSON.stringify([failure.pcba_sn,failure.defect_code,failure.defect_time]),isCurrent=currentKey&&key===currentKey;
    return failureDetails(failure,{current:isCurrent,result,currentPcba:model.current_pcba,locale,index:index+1});
  }).join(''):`<div class="ames-sn-forensic-empty">${esc(t(locale,'Nenhum histórico 2114 comprovado para esta PCBA nesta resposta.','No proven 2114 history for this PCBA in this response.'))}</div>`}</div><div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Histórico detalhado dos componentes reutilizados','Detailed reused-component history'))}</h3><p>${esc(t(locale,'Cada material mantém Material SN, PCBA atual/anterior, vínculo 3074, falha 2114, reparos 3012 e comentários quando comprovados.','Each material keeps Material SN, current/previous PCBA, 3074 binding, 2114 failure, 3012 repairs and comments when proven.'))}</p></div><span class="status">${esc(fmt(model.materials?.length??0))}</span></div>${model.materials?.length?model.materials.map(item=>materialDetail(item,model,result,locale)).join(''):`<div class="ames-sn-forensic-empty">${esc(t(locale,'Nenhum componente reutilizado foi confirmado nesta resposta.','No reused component was confirmed in this response.'))}</div>`}`;
}

export function decorateSnHistoryDetail(root,model={},result={}){
  root.querySelector('[data-sn-history-detail]')?.remove();
  const host=root.querySelector('[data-sn-tab-panel="story"]')||root.querySelector('.ames-sn-forensic-panel')||root.querySelector('[data-sn-result]');
  if(!host)return;
  const section=host.ownerDocument.createElement('section');
  section.dataset.snHistoryDetail='1';section.className='mes-context-panel ames-sn-history-detail';section.setAttribute('data-no-i18n','');
  section.innerHTML=renderSnHistoryDetail(model,result,host.ownerDocument.documentElement?.lang||'pt-BR');
  host.append(section);
}
