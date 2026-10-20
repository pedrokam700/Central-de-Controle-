import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {productionEvidenceForOccurrence,genericReturnEvidence,sameFailureOccurrence} from './data/production-evidence.mjs';

const text=value=>String(value??'').trim();
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||text(value)===''?'—':String(value);
const pcbaOf=row=>text(value(row,'pcba_sn','PCBA Consultada','PCBA','Lot Id','current_pcba_sn'));
const eventTime=row=>value(row,'event_time','Tran Time','Transaction Time','Event Time')||value(row?.raw,'Tran Time','Transaction Time','Event Time');
const stationOf=row=>value(row,'station','operation_code','Working Oper Code','Current Oper Code')||value(row?.raw,'Working Oper Code','Station','Station Code','Current Oper Code');
const operationOf=row=>value(row,'operation_name','process','Working Oper','Current Oper')||value(row?.raw,'Working Oper','Operation Name','Current Oper');
const operatorOf=row=>[value(row,'operator_name','Operator Name','Tran User Name','Transaction User Name'),value(row,'operator_id','Operator ID','Tran User Id','Transaction User Id')].filter(Boolean).join(' · ')||'—';

function instant(value){
  const raw=text(value);if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw))return null;
  const prepared=/[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw)?raw:raw.replace(' ','T')+'-03:00';
  const n=Date.parse(prepared);return Number.isFinite(n)?n:null;
}

function exactContext(failure,contexts=[]){return (contexts||[]).find(context=>sameFailureOccurrence(failure,context))||null;}

function processRows(result={}){
  const trace=result.trace_3022||{};
  const rows=[...(trace.process_passages||[]),...(trace.rows||[])];
  const seen=new Set();
  return rows.filter(row=>{
    const key=JSON.stringify([pcbaOf(row),text(eventTime(row)),text(stationOf(row)),text(operationOf(row)),operatorOf(row)]);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}

function previousPassages(failure,result,currentPcba){
  const defectAt=instant(failure?.defect_time);if(defectAt===null)return [];
  return processRows(result).map(row=>({row,at:instant(eventTime(row))})).filter(({row,at})=>{
    if(at===null||at>=defectAt)return false;
    const board=pcbaOf(row);
    return !board||board===text(currentPcba);
  }).sort((a,b)=>a.at-b.at).map(({row})=>({
    station:stationOf(row)||null,operation:operationOf(row)||null,event_time:eventTime(row)||null,operator:operatorOf(row),source:'3022',
  }));
}

export function temporalProofForFailure(failure={},result={},currentPcba=''){
  const contexts=result.local_snapshot?.process_contexts||[];
  const context=exactContext(failure,contexts);
  const production=productionEvidenceForOccurrence(failure,contexts);
  const returnEvidence=context?genericReturnEvidence(context):genericReturnEvidence({});
  const repairAt=context?.repair_event_time||null;
  const repairInstant=instant(repairAt),returnInstant=instant(returnEvidence.event_time);
  const returnAfterRepair=Boolean(returnEvidence.proven&&repairInstant!==null&&returnInstant!==null&&returnInstant>repairInstant);
  return {
    defect_time:failure.defect_time||null,
    defect_time_source:failure.defect_time_source||'2114',
    production,
    reference_operation:production.trusted?(context?.reference_operation_name||null):null,
    repair_event_time:repairAt,
    return:returnAfterRepair?returnEvidence:genericReturnEvidence({}),
    analysis_event:failure.analysis_event||null,
    previous_passages:previousPassages(failure,result,currentPcba),
    exact_context:Boolean(context),
  };
}

function passageRows(rows,locale){
  if(!rows.length)return `<div class="ames-sn-forensic-empty">${esc(t(locale,'Nenhuma passagem 3022 anterior foi comprovada nesta resposta.','No earlier 3022 passage was proven in this response.'))}</div>`;
  return `<div class="ames-sn-temporal-passages">${rows.map(row=>`<article class="ames-sn-process-story"><div><small>${esc(t(locale,'Posto','Station'))}</small><b>${esc(fmt(row.station))}</b></div><div><small>${esc(t(locale,'Processo','Process'))}</small><b>${esc(fmt(row.operation))}</b></div><div><small>${esc(t(locale,'Operador','Operator'))}</small><b>${esc(fmt(row.operator))}</b></div><div><small>${esc(t(locale,'Horário','Time'))}</small><b>${esc(time(row.event_time))}</b></div></article>`).join('')}</div>`;
}

function renderFailureTemporal(failure,proof,locale,index,current){
  const production=proof.production,ret=proof.return,analysis=proof.analysis_event;
  const title=current?t(locale,'Falha atual','Current failure'):t(locale,`Falha anterior ${index}`,`Previous failure ${index}`);
  const referenceLabel=production.trusted?[production.station,proof.reference_operation].filter(Boolean).join(' · '):'—';
  const returnLabel=ret.proven?[ret.station,ret.operation].filter(Boolean).join(' · '):'—';
  return `<details class="ames-sn-history-detail-item ames-sn-temporal-proof" ${current?'open':''} data-sn-temporal-proof><summary><span>${esc(title)}</span><b>${esc(fmt(failure.defect_code))} · ${esc(time(failure.defect_time))}</b></summary><div class="ames-sn-history-detail-body"><div class="ames-sn-repair-story"><div><small>${esc(String(proof.defect_time_source||'2114'))} · Defect Time</small><b>${esc(time(proof.defect_time))}</b></div><div><small>${esc(t(locale,'3022 · passagem de referência','3022 · reference passage'))}</small><b>${esc(referenceLabel)}</b></div><div><small>${esc(t(locale,'Horário de referência','Reference time'))}</small><b>${esc(production.trusted?time(production.event_time):'—')}</b></div><div><small>${esc(t(locale,'Turno comprovado','Proven shift'))}</small><b>${esc(fmt(production.trusted?production.shift:null))}</b></div><div><small>${esc(t(locale,'Dia de produção','Production day'))}</small><b>${esc(fmt(production.trusted?production.operational_date:null))}</b></div><div><small>3012 · Repair Time</small><b>${esc(proof.repair_event_time?time(proof.repair_event_time):'—')}</b></div><div><small>${esc(t(locale,'3022 · retorno após reparo','3022 · return after repair'))}</small><b>${esc(returnLabel)}</b></div><div><small>${esc(t(locale,'Horário do retorno','Return time'))}</small><b>${esc(ret.proven?time(ret.event_time):'—')}</b></div></div>${analysis?`<details class="ames-sn-current-context"><summary>${esc(t(locale,'Ver evento de processo associado','View associated process event'))}</summary><div class="ames-sn-process-story"><div><small>${esc(t(locale,'Posto','Station'))}</small><b>${esc(fmt(analysis.station))}</b></div><div><small>${esc(t(locale,'Processo','Process'))}</small><b>${esc(fmt(analysis.operation_name))}</b></div><div><small>${esc(t(locale,'Operador','Operator'))}</small><b>${esc([analysis.operator_name,analysis.operator_id].filter(Boolean).join(' · ')||'—')}</b></div><div><small>${esc(t(locale,'Horário','Time'))}</small><b>${esc(time(analysis.event_time))}</b></div></div><p>${esc(t(locale,'Este evento é evidência de processo; não substitui Defect Time nem prova causa raiz.','This event is process evidence; it does not replace Defect Time or prove root cause.'))}</p></details>`:''}<details class="ames-sn-current-context"><summary>${esc(t(locale,`Ver passagens anteriores comprovadas (${proof.previous_passages.length})`,`View proven earlier passages (${proof.previous_passages.length})`))}</summary>${passageRows(proof.previous_passages,locale)}</details>${production.trusted?'':`<div class="ames-sn-forensic-empty">${esc(t(locale,'Sem referência 3022 comprovada para turno/dia de produção.','No proven 3022 reference for shift/production day.'))}</div>`}${proof.repair_event_time&&!ret.proven?`<div class="ames-sn-forensic-empty">${esc(t(locale,'Existe Repair Time, mas não há retorno 3022 posterior comprovado para esta ocorrência.','A Repair Time exists, but no later 3022 return is proven for this occurrence.'))}</div>`:''}</div></details>`;
}

export function renderSnTemporalProof(model={},result={},locale='pt-BR'){
  const failures=[...(model.own_history||[]),...(model.current?[model.current]:[])];
  const currentKey=model.current?JSON.stringify([model.current.pcba_sn,model.current.defect_code,model.current.defect_time]):'';
  failures.sort((a,b)=>(instant(a.defect_time)??Infinity)-(instant(b.defect_time)??Infinity));
  return `<div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Prova temporal 3022','3022 temporal proof'))}</h3><p>${esc(t(locale,'Defect Time, passagem produtiva, reparo e retorno permanecem eventos diferentes. A Central mostra somente estação/operação realmente comprovada e nunca assume uma estação fixa como retorno.','Defect Time, production passage, repair and return remain different events. Central shows only the station/operation actually proven and never assumes a fixed return station.'))}</p></div><span class="status">3022</span></div>${failures.length?failures.map((failure,index)=>{
    const key=JSON.stringify([failure.pcba_sn,failure.defect_code,failure.defect_time]),current=Boolean(currentKey&&key===currentKey);
    return renderFailureTemporal(failure,temporalProofForFailure(failure,result,model.current_pcba),locale,index+1,current);
  }).join(''):`<div class="ames-sn-forensic-empty">${esc(t(locale,'Sem ocorrência 2114 para ancorar a prova temporal 3022.','No 2114 occurrence is available to anchor 3022 temporal proof.'))}</div>`}`;
}

export function decorateSnTemporalProof(root,model={},result={}){
  root.querySelector('[data-sn-temporal-detail]')?.remove();
  const host=root.querySelector('[data-sn-tab-panel="story"]')||root.querySelector('.ames-sn-forensic-panel')||root.querySelector('[data-sn-result]');
  if(!host)return;
  const section=host.ownerDocument.createElement('section');
  section.dataset.snTemporalDetail='1';section.className='mes-context-panel ames-sn-temporal-detail';section.setAttribute('data-no-i18n','');
  section.innerHTML=renderSnTemporalProof(model,result,host.ownerDocument.documentElement?.lang||'pt-BR');
  host.append(section);
}
