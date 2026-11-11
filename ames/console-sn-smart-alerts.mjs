import {compareFailures,explainFailureComparison} from './data/failure-taxonomy.mjs';
import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {pcbaUsageEvidence} from './console-sn-history-detail.mjs';
import {parseFailureInstant,productionEvidenceForOccurrence} from './data/production-evidence.mjs';
import {provenRepairUserName} from './console-sn-repair-evidence.mjs';
import {a6900ForSnRepair,a6900ObservedForSn} from './data/a6900-technician.mjs';

const text=value=>String(value??'').trim();
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||text(value)===''?'—':String(value);
const evidenceList=alert=>(Array.isArray(alert?.evidence)?alert.evidence:[alert?.evidence]).filter(Boolean);
const itemIdentity=alert=>`${text(alert?.item_type)}|${text(alert?.item_sn)}`;

// Triage priority reflects DISTINCT 2114 occurrences on associated boards,
// including the investigated occurrence when it exists. It does not count
// exports, 3012 repair rows or 3022 passages as extra faults.
export function failureFrequencyPriority(count){
  if(count>=6)return 'critical';
  if(count>=4)return 'high';
  if(count>=3)return 'medium';
  return 'low';
}
const priorityMax=(a,b)=>SMART_SN_PRIORITY[a].order<=SMART_SN_PRIORITY[b].order?a:b;
function distinctFailureIdentity(f={},pcba=''){
  const board=text(pcba||f.pcba_sn),seq=f.hist_seq??f['Defect Hist Seq'],when=text(f.defect_time||f['Defect Time']);
  const code=text(f.defect_code||f['Defect Code']),desc=text(f.defect_desc||f['Defect Description']);
  if(seq!==null&&seq!==undefined&&text(seq)!=='')return JSON.stringify([board,'seq',text(seq)]);
  return JSON.stringify([board,'event',when,code,desc]);
}
function materialFailureFrequency(material={},current=null,board=''){
  const previous=new Set((material.previous_pcbas||[]).map(text).filter(Boolean));
  const entries=new Set();
  for(const h of material.history||[]){
    const f=h.failure,oldBoard=text(h.pcba_sn||f?.pcba_sn);
    if(!f||!text(f.defect_code||f.defect_desc)||!previous.has(oldBoard)||oldBoard===board)continue;
    const oldTime=parseFailureInstant(f.defect_time),currentTime=parseFailureInstant(current?.defect_time);
    if(currentTime!==null&&oldTime!==null&&oldTime>=currentTime)continue;
    entries.add(distinctFailureIdentity(f,oldBoard));
  }
  const historical=entries.size;
  if(current?.pcba_sn===board&&text(current.defect_code||current.defect_desc))
    entries.add(distinctFailureIdentity(current,board));
  return {total:entries.size,historical,currentIncluded:entries.size>historical};
}

function distinctAlerts(alerts=[]){
  const seen=new Set();
  return alerts.filter(alert=>{
    const key=[alert.kind,itemIdentity(alert),text(alert.pcba_sn),text(alert.prior_defect_code),text(alert.prior_defect_time),text(alert.prior_hist_seq)].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  });
}

function pcbaSecondUse(usage={}){
  return Number(usage.use_index)>=2||Number(usage.known_uses)>=2||Number(usage.previous_uses)>=1;
}

function proof2114(label,f,locale){
 if(!f||!f.pcba_sn)return '';
 const description=text(f.defect_desc)||t(locale,'Descrição da falha não disponível','Failure description unavailable');
 const code=f.defect_code?'<small>'+esc(t(locale,'Código MES (referência)','MES code (reference)'))+': '+esc(f.defect_code)+'</small>':'';
 const meta=[f.hist_seq==null?'':`Hist Seq ${f.hist_seq}`,f.defect_time?time(f.defect_time):t(locale,'Horário não comprovado','Time unproven')].filter(Boolean).join(' · ');
 const states=[f.repair_status==null?'':t(locale,'Vínculo 2114','2114 link')+': '+f.repair_status,
   f.defect_type==null?'':t(locale,'Tipo de análise 2114','2114 analysis type')+': '+f.defect_type].filter(Boolean).join(' · ');
 return `<div class="ames-sn-smart-proof"><small>${esc(label)} · 2114</small>
   <b>${esc(description)}</b>${code}<span>${esc(f.pcba_sn)} · ${esc(meta)}</span>
   ${states?`<small>${esc(states)} · ${esc(t(locale,'não identifica reparo executado','does not establish a performed repair'))}</small>`:''}
 </div>`;
}
function proof3012(repair,locale,label,result={},currentPcba=''){
  const id=text(repair.repair_user),technician=a6900ForSnRepair(repair,result,currentPcba),name=provenRepairUserName(repair,result,currentPcba);
  const actor=technician?technician.name+' ('+technician.id+')':t(locale,'Técnico da falha na A6900 não comprovado','Fault technician at A6900 not proven');
  const qualified=technician?.confidence==='nearby_repair_clock';
  return `<div class="ames-sn-smart-proof"><small>${esc(label)}</small>
    <b>${esc(actor)}</b>
    <small>${esc(qualified?t(locale,'A6900 observada próxima ao reparo · vínculo com a falha não comprovado','A6900 observed near repair · fault link unproven'):t(locale,'Técnico da falha · 3022 A6900','Fault technician · 3022 A6900'))}</small>
    <small>${esc(t(locale,'Usuário do reparo 3012 (papel distinto)','3012 repair user (different role)'))}: ${esc(name?name+' ('+id+')':fmt(id))}</small>
    <span>${esc(t(locale,'Horário do reparo 3012','3012 repair time'))}: ${esc(repair.repair_time?time(repair.repair_time):'—')}</span>
    <small>${esc(t(locale,'Comentário do AT (3012)','Technician comment (3012)'))}</small>
    <span style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(fmt(repair.repair_comment))}</span>
  </div>`;
}
function compactEvidence(alert,locale,result={},currentPcba=''){
  const proofs=evidenceList(alert);
  const rows=[];
  for(const proof of proofs){
    const failure=proof.failure||{};
    const binding=proof.binding||null;
    const ret=proof.return||null;
    if(proof.reuse){
      const reuse=proof.reuse;
      rows.push(`<div class="ames-sn-smart-proof" data-sn-alert-reuse-proof><small>3074 · ${esc(t(locale,'Reutilização física observada','Observed physical reuse'))}</small><b>${esc(fmt(reuse.item_type))} · ${esc(fmt(reuse.item_sn))}</b><span>${esc(t(locale,'Usos conhecidos','Known uses'))}: ${esc(fmt(reuse.known_uses))} · ${esc(t(locale,'Reusos anteriores','Previous reuses'))}: ${esc(fmt(reuse.previous_uses))}</span><small>${esc(t(locale,'Ocorrências 2114 nas PCBAs associadas','2114 occurrences on associated boards'))}: ${esc(fmt(reuse.failure_count))} (${esc(fmt(reuse.previous_failure_count))} ${esc(t(locale,'anteriores','previous'))}) · ${esc(t(locale,'PCBAs anteriores identificadas','Identified prior PCBAs'))}: ${esc((reuse.previous_pcbas||[]).join(', ')||'—')} · ${esc(t(locale,'PCBA investigada','Investigated PCBA'))}: ${esc(fmt(reuse.current_pcba))}</small></div>`);
    }
    if(failure.pcba_sn||failure.defect_code||failure.defect_time){
      rows.push(proof2114(t(locale,'Falha anterior','Previous failure'),failure,locale));
      // Only display the current occurrence on PCBA recurrence alerts, avoiding
      // duplicated current card for each physical component history.
      if(alert.kind?.startsWith('PCBA_'))rows.push(proof2114(t(locale,'Falha atual','Current failure'),proof.current_failure,locale));
      if(alert.kind?.startsWith('MATERIAL_HISTORICAL_'))rows.push(proof2114(t(locale,'Falha na outra PCBA vinculada','Failure on the other linked board'),proof.current_failure,locale));
    }
    if(proof.material_historical_confidence)rows.push('<p class="ames-sn-alert-rule-note">'+esc(proof.material_historical_confidence==='proven'
      ?t(locale,'Os dois registros estão dentro dos vínculos temporais observados na 3074; correlação não comprova causa.','Both failures fall within observed 3074 binding intervals; correlation does not prove cause.')
      :t(locale,'Mesma falha nas PCBAs associadas ao Material SN, mas a montagem no instante de uma ou ambas as falhas não foi comprovada.','Same failure on boards linked to this Material SN, but mounting at one or both failure times is unproven.'))+'</p>');
    if(proof.binding_temporal_unproven)rows.push('<p class="ames-sn-alert-rule-note">'+esc(t(locale,
      'A mesma falha consta na 2114 da PCBA vinculada pela 3074. Não há prova de que o componente estivesse montado no instante da falha. Este aviso é uma investigação, não uma reincidência comprovada do material.',
      'The same failure appears in 2114 on a PCBA linked by 3074. Mounting of this part at the failure time is unproven. This is an investigation lead, not a proven recurring part failure.'))+'</p>');
    if(alert.kind==='PCBA_SAME_FAILURE'&&failure.defect_type&&proof.current_failure?.defect_type&&
       String(failure.defect_type).trim().toLowerCase()!==String(proof.current_failure.defect_type).trim().toLowerCase()){
      rows.push(`<p class="notice warn">${esc(t(locale,
      'Tipos de análise diferentes na 2114: comparar os comentários e resultados dos ATs; isso não demonstra erro no diagnóstico anterior.',
      'Different 2114 analysis types: compare technician comments/results; this does not prove the earlier diagnosis was wrong.'))}</p>`);
    }
    if(proof.order_basis==='hist_seq_same_clock'||proof.order_basis==='hist_seq_only'){
      rows.push(`<p class="notice warn">${esc(t(locale,
       'A sequência Defect Hist Seq distingue os dois registros 2114; os horários não individualizam a intervenção do AT.',
       'Defect Hist Seq distinguishes the 2114 records; timestamps do not identify which technician performed an intervention.'))}</p>`);
    }
    if(proof.comparison)rows.push(`<p>${esc(explainFailureComparison(proof.comparison,locale))} · ${esc(t(locale,'Regra','Rule'))} ${esc(proof.comparison.version)}</p>`);
    if(binding)rows.push(`<div class="ames-sn-smart-proof"><small>3074 · ${esc(t(locale,'Vínculo comprovado','Proven binding'))}</small><b>${esc(fmt(binding.item_sn))}</b><span>${esc(fmt(binding.previous_pcba))} → ${esc(fmt(binding.current_pcba))}</span></div>`);
    if(alert.kind==='COMPONENT_TYPE_COMPATIBLE'&&proof.current_failure){
      const match=alert.match||{};
      rows.push(proof2114(t(locale,'Última falha registrada nesta PCBA','Last failure recorded on this PCBA'),proof.current_failure,locale));
      rows.push(`<p class="ames-sn-alert-rule-note">${esc(t(locale,
        'Correspondência física entre o tipo de componente reutilizado e o subsistema da falha; não comprova que a peça falhou ou causou o defeito.',
        'Physical compatibility between reused component type and failure subsystem; does not prove the part failed or caused the defect.'))} · ${esc(fmt(match.classification))} · ${esc(fmt(match.reason))} · ${esc(fmt(match.version))}</p>`);
    }
    // A single chronological 3012 section above all cards retains every
    // distinct repair record; repeating them per board/component proof was
    // visually noisy and could suggest duplicated technician interventions.
    if(alert.kind?.startsWith('PCBA_')&&!(proof.current_3012||[]).length&&!(proof.ambiguous_3012||[]).length&&!(proof.candidates_3012||[]).length)
      rows.push(`<p class="mes-context">${esc(t(locale,'Análise atual do AT não comprovada nesta consulta 3012; isso não indica que não foi realizada.','Current technician analysis not proven by this 3012 query; this does not mean it never occurred.'))}</p>`);
    if(ret)rows.push(`<div class="ames-sn-smart-proof"><small>3022 · ${esc(t(locale,'Retorno comprovado','Proven return'))}</small><b>${esc([ret.station,ret.operation].filter(Boolean).join(' · ')||'—')}</b><span>${esc(ret.time?time(ret.time):'—')}</span></div>`);
  }
  if(alert.technician_comment&&!rows.some(row=>row.includes(esc(alert.technician_comment))))rows.push(`<div class="ames-sn-smart-proof"><small>Repair Comment</small><b>${esc(alert.technician_comment)}</b></div>`);
  const sources=[...new Set((alert.sources||[]).filter(Boolean))];
  if(sources.length)rows.push(`<div class="ames-sn-smart-proof"><small>${esc(t(locale,'Fontes','Sources'))}</small><b>${esc(sources.join(' + '))}</b></div>`);
  return rows.join('')||`<div class="ames-sn-forensic-empty">${esc(t(locale,'A correlação existe, mas a evidência detalhada não foi projetada nesta resposta.','The correlation exists, but detailed evidence was not projected in this response.'))}</div>`;
}


function sameBoardHistory(alerts,model={},currentPcba=''){
  const seen=new Map(),pcba=text(currentPcba),current=model.current||null;
  const add=(failure,isCurrent=false)=>{
    if(!failure||text(failure.pcba_sn)!==pcba||!pcba)return;
    const key=[pcba,failure.hist_seq===null||failure.hist_seq===undefined?'?':failure.hist_seq,
      text(failure.defect_code),text(failure.defect_time)].join('|');
    const prev=seen.get(key);
    if(!prev||isCurrent)seen.set(key,{failure,current:isCurrent});
  };
  for(const failure of model.own_history||[])add(failure,false);
  for(const alert of alerts)for(const proof of evidenceList(alert)){
    add(proof.failure,false);
    add(proof.current_failure,true);
  }
  add(current,true);
  return [...seen.values()].sort((a,b)=>{
    const aa=Number(a.failure.hist_seq),bb=Number(b.failure.hist_seq);
    if(a.failure.hist_seq!=null&&b.failure.hist_seq!=null&&Number.isFinite(aa)&&Number.isFinite(bb)&&aa!==bb)return aa-bb;
    const at=parseFailureInstant(a.failure.defect_time),bt=parseFailureInstant(b.failure.defect_time);
    return (at??0)-(bt??0);
  });
}

function productionSnapshot(model={},result={},locale='pt-BR',currentPcba=''){
  const current=model.current||{},board=text(currentPcba);
  const trusted=productionEvidenceForOccurrence(current,model.process_contexts||[]);
  // A real 3022 assembly station passage is not proof of the instant the
  // defect began. Require the exact PCBA and an actual timestamp before MES.
  const failedAt=parseFailureInstant(current.defect_time);
  const trace=result.trace_3022||{};
  const passages=[...(trace.process_passages||[])].filter(row=>{
    const name=text(row.operation_name||row.process||row['Working Oper']||row['Operation Name']);
    const rowBoard=text(row.pcba_sn||row.PCBA);
    const at=parseFailureInstant(row.event_time||row['Event Time']);
    return rowBoard===board&&at!==null&&failedAt!==null&&at<=failedAt&&
      /(assembly|montagem)/i.test(name);
  }).sort((a,b)=>
    parseFailureInstant(b.event_time||b['Event Time'])-parseFailureInstant(a.event_time||a['Event Time']));
  const assembly=passages[0]||null;
  const sourceLabel=t(locale,'3022 · montagem e referência produtiva','3022 · assembly and production reference');
  const fields=[];
  if(assembly){
    const station=text(assembly.station||assembly.operation_code||assembly['Working Oper Code']);
    const at=assembly.event_time||assembly['Event Time'];
    fields.push('<div><small>'+esc(t(locale,'Passagem em montagem (3022)','Assembly station passage (3022)'))+'</small><b>'+
      esc(time(at))+'</b><span>'+esc(station||'—')+'</span></div>');
  }
  if(trusted.trusted){
    fields.push('<div><small>'+esc(t(locale,'Referência produtiva comprovada (3022)','Proven production reference (3022)'))+'</small><b>'+
      esc(time(trusted.event_time))+'</b><span>'+esc(trusted.station||'—')+
      (trusted.shift?' · '+esc(trusted.shift):'')+'</span></div>');
  }
  if(!fields.length)fields.push('<p class="ames-sn-alert-muted">'+esc(t(locale,
    'Horário de montagem não comprovado para esta ocorrência. As passagens 3022 continuam disponíveis na aba Processo 3022.',
    'Assembly time is not proven for this occurrence. 3022 passages remain available in the Process 3022 tab.'))+'</p>');
  return '<section class="ames-sn-alert-white ames-sn-alert-production" data-sn-alert-production><h4>'+esc(sourceLabel)+
    '</h4><div class="ames-sn-alert-production-grid">'+fields.join('')+'</div>'+
    (fields.length&&assembly?'<small>'+esc(t(locale,
      'Passagem registrada no posto; não prova quando o defeito começou.',
      'Recorded station passage; does not prove when the defect began.'))+'</small>':'')+'</section>';
}

function uniqueBoardProof(alerts,model,locale,currentPcba){
  const observations=sameBoardHistory(alerts,model,currentPcba);
  const rows=observations.map(({failure,current},i)=>proof2114(
    current?t(locale,'Falha atual','Current failure'):t(locale,'Falha anterior','Previous failure'),
    failure,locale)).filter(Boolean);
  const proofRows=alerts.flatMap(alert=>evidenceList(alert));
  const ordered=proofRows.some(p=>p.order_basis==='hist_seq_same_clock'||p.order_basis==='hist_seq_only');
  const kinds=new Set(observations.map(p=>text(p.failure.defect_type)).filter(Boolean));
  const messages=[];
  if(ordered)messages.push(t(locale,
    'Defect Hist Seq ordena os registros 2114, mas não identifica quem realizou cada análise.',
    'Defect Hist Seq orders 2114 records but does not identify the technician for each analysis.'));
  if(kinds.size>1)messages.push(t(locale,
    'Tipos de análise diferentes na 2114: comparar os comentários e resultados dos ATs; isso não demonstra erro no diagnóstico anterior.',
    'Different 2114 analysis types: compare technician comments and outcomes; this does not prove an earlier diagnosis was wrong.'));
  const comparisons=[...new Map(proofRows.filter(p=>p.comparison).map(p=>[
    JSON.stringify([p.comparison.version,p.comparison.kind,p.comparison.reason]),p.comparison
  ])).values()];
  const rest=[];
  for(const p of proofRows){
    if(p.binding)rest.push('<div class="ames-sn-smart-proof"><small>3074 · '+esc(t(locale,'Vínculo comprovado','Proven binding'))+'</small><b>'+
      esc(fmt(p.binding.item_sn))+'</b><span>'+esc(fmt(p.binding.previous_pcba))+' → '+esc(fmt(p.binding.current_pcba))+'</span></div>');
    if(p.return)rest.push('<div class="ames-sn-smart-proof"><small>3022 · '+esc(t(locale,'Retorno comprovado','Proven return'))+'</small><b>'+
      esc([p.return.station,p.return.operation].filter(Boolean).join(' · ')||'—')+'</b><span>'+
      esc(p.return.time?time(p.return.time):'—')+'</span></div>');
  }
  const uniqueRest=[...new Set(rest)];
  return '<div class="ames-sn-alert-evidence-content" data-sn-alert-2114-evidence>'+
    '<div class="ames-sn-alert-evidence-head"><b>'+esc(t(locale,'Registros 2114 distintos','Distinct 2114 records'))+
    '</b><span>'+observations.length+'</span></div>'+
    '<div class="ames-sn-alert-evidence-grid">'+rows.join('')+'</div>'+
    messages.map(m=>'<p class="ames-sn-alert-rule-note">'+esc(m)+'</p>').join('')+
    (comparisons.length?'<p class="ames-sn-alert-muted">'+comparisons.map(c=>esc(explainFailureComparison(c,locale))+
      (c.version?' · '+esc(t(locale,'Regra','Rule'))+' '+esc(c.version):'')).join(' · ')+'</p>':'')+
    uniqueRest.join('')+
    '<small class="ames-sn-alert-muted">'+esc(t(locale,
      'Comentários 3012, quando disponíveis, aparecem acima sem repetição. Uma correlação não confirma a causa raiz.',
      '3012 comments appear above when available without duplication. Correlation does not establish root cause.'))+'</small>'+
    '</div>';
}

function shortTechnicianEvidence(alerts,locale,result,currentPcba,boardRepairs=[]){
  const entries=new Map();
  const add=(repair,label)=>{
    const id=text(repair?.repair_user),comment=text(repair?.repair_comment);
    if(!id&&!comment)return;
    // Stable physical repair row first. A fallback uses the exact PCBA,
    // technician, instant and comment; do not dedupe by technician alone.
    const key=repair?.row_key?'key:'+text(repair.row_key):
      'fields:'+JSON.stringify([repair?.pcba_sn,repair?.repair_time,id,comment,repair?.defect_code]);
    const prev=entries.get(key);
    if(!prev||label==='3012 · análise anterior associada')entries.set(key,{repair,label});
  };
  for(const alert of alerts)for(const proof of evidenceList(alert)){
    for(const item of proof.repairs||[])add(item,'3012 · análise anterior associada');
    for(const item of proof.current_3012||[])add(item,'3012 · registro atual candidato');
    for(const item of proof.ambiguous_3012||[])add(item,'3012 · não atribuído à sequência 2114');
    for(const item of proof.candidates_3012||[])add(item,'3012 · registro candidato');
  }
  // A low-risk, different-failure alert often has no correlation proof carrying
  // 3012 rows. Keep same-board repair context visible without assigning it to
  // any 2114 Hist Seq or claiming it caused the alert.
  for(const repair of boardRepairs)if(text(repair.pcba_sn)===text(currentPcba))
    add(repair,'3012 · contexto da PCBA sem associação individual comprovada');
  const rows=[...entries.values()].sort((a,b)=>String(a.repair.repair_time||'').localeCompare(String(b.repair.repair_time||'')));
  const observations=a6900ObservedForSn(result,currentPcba);
  if(!rows.length&&!observations.length)return '';
  const seenTimes=new Map();
  for(const {repair} of rows){
    const stamp=text(repair.repair_time),id=text(repair.repair_user);
    if(!stamp)continue;
    const key=JSON.stringify([text(repair.pcba_sn),stamp,id]);
    seenTimes.set(key,(seenTimes.get(key)||0)+1);
  }
  const repeated=[...seenTimes.values()].filter(n=>n>1);
  const evidence=({repair,label})=>{
    const id=text(repair.repair_user),name=provenRepairUserName(repair,result,currentPcba),technician=a6900ForSnRepair(repair,result,currentPcba);
    const person=technician?`${technician.name} (${technician.id})`:t(locale,'Técnico da falha A6900 não comprovado','A6900 fault technician unproven');
    const stationLabel=technician?.confidence==='nearby_repair_clock'?t(locale,
      '3022 A6900 próximo ao horário 3012; possível diferença de relógio, vínculo com esta falha não comprovado',
      '3022 A6900 near 3012 time; possible clock discrepancy, fault link unproven'):'3022 A6900';
    return '<div class="ames-sn-alert-tech-preview" data-sn-alert-repair-row><div class="ames-sn-alert-tech-id">'+
      '<small>'+esc(label)+' · '+esc(stationLabel)+'</small><b>'+esc(person)+'</b><small>'+esc(t(locale,'Usuário do reparo 3012','3012 repair user'))+': '+esc(name?name+' ('+id+')':id||'—')+'</small><time>'+esc(repair.repair_time?time(repair.repair_time):'—')+'</time></div>'+
      '<p>'+esc(fmt(repair.repair_comment))+'</p></div>';
  };
  const maxVisible=3;
  const observedRow=event=>'<div class="ames-sn-alert-tech-preview" data-sn-alert-3022-a6900><div class="ames-sn-alert-tech-id">'+
    '<small>3022 · '+esc(t(locale,'A6900 observada nesta PCBA','A6900 observed on this board'))+'</small><b>'+esc(event.name)+' ('+esc(event.id)+')</b><time>'+esc(time(event.event_time))+'</time></div>'+
    '<p>'+esc(t(locale,'Evento MES comprovado; vínculo com uma ocorrência 2114 ou um reparo 3012 não é automático.',
      'MES event proven; association with a specific 2114 failure or 3012 repair is not automatic.'))+'</p></div>';
  const direct3022=observations.slice(0,3).map(observedRow).join('')+
    (observations.length>3?'<details class="ames-sn-alert-extra-a6900"><summary>'+esc(t(locale,
      'Outras passagens A6900','More A6900 events'))+' ('+(observations.length-3)+')</summary>'+
      observations.slice(3).map(observedRow).join('')+'</details>':'');
  if(!rows.length)return '<section data-sn-alert-technician-preview class="ames-sn-alert-white ames-sn-alert-technicians">'+
    '<div class="ames-sn-alert-evidence-head"><b>'+esc(t(locale,'Técnicos observados · 3022 A6900','Observed technicians · 3022 A6900'))+
    '</b><span>'+observations.length+' '+esc(t(locale,'registro(s)','record(s)'))+'</span></div>'+
    '<p class="ames-sn-alert-muted">'+esc(t(locale,'Comentário 3012 não disponível nesta consulta. A6900 identifica uma passagem MES, sem vínculo individual automático com a falha 2114.',
      '3012 comment unavailable in this query. A6900 identifies a MES event, without automatic attribution to a 2114 failure.'))+'</p>'+direct3022+'</section>';
  return '<section data-sn-alert-technician-preview class="ames-sn-alert-white ames-sn-alert-technicians">'+
    '<div class="ames-sn-alert-evidence-head"><b>'+esc(t(locale,'ATs e comentários · 3012','Technicians and comments · 3012'))+
    '</b><span>'+rows.length+' '+esc(t(locale,'registro(s)','record(s)'))+'</span></div>'+
    '<p class="ames-sn-alert-muted">'+esc(t(locale,
      'Contexto 3012 da PCBA investigada. Nomes somente quando comprovados; registros sem vínculo temporal não são atribuídos individualmente à sequência 2114 nem ao risco deste alerta.',
      '3012 context for the investigated PCBA. Names appear only with evidence; rows without temporal linkage are not assigned to a 2114 sequence or to this alert.'))+'</p>'+
    (repeated.length?'<p class="ames-sn-alert-rule-note" data-sn-alert-duplicate-repair-clock>'+esc(t(locale,
      'A 3012 retornou '+repeated.reduce((a,b)=>a+b,0)+' registros com horário e usuário repetidos; isso não comprova intervenções distintas. Os registros originais permanecem na auditoria.',
      '3012 returned repeated repair times and users; this does not prove distinct interventions. Raw records remain available for audit.'))+'</p>':'')+
    '<div class="ames-sn-alert-technician-list">'+rows.slice(0,maxVisible).map(evidence).join('')+'</div>'+
    (rows.length>maxVisible?'<details class="ames-sn-alert-extra-repairs"><summary>'+
      esc(t(locale,'Outros comentários 3012','Other 3012 comments'))+' ('+(rows.length-maxVisible)+')</summary>'+
      rows.slice(maxVisible).map(evidence).join('')+'</details>':'')+
    (observations.length?'<details class="ames-sn-alert-observed-a6900"><summary>'+esc(t(locale,
      'Passagens A6900 observadas na 3022 (sem atribuição individual)',
      'A6900 events observed in 3022 (without individual attribution)'))+' ('+observations.length+')</summary>'+direct3022+'</details>':'')+
    '</section>';
}


// Severity reflects the strength and repetition of EVIDENCE, never presumed root cause.
// A third distinct proven failure of the same type warrants a very-high review;
// possible type compatibility alone is deliberately low priority.
export const SMART_SN_PRIORITY={
  critical:{labelPt:'MUITO ALTA',labelEn:'VERY HIGH',tone:'#a42318',background:'#fff0ef',order:0},
  high:{labelPt:'ALTA',labelEn:'HIGH',tone:'#d92d20',background:'#fef3f2',order:1},
  medium:{labelPt:'MÉDIA',labelEn:'MEDIUM',tone:'#b54708',background:'#fff8ec',order:2},
  low:{labelPt:'BAIXA',labelEn:'LOW',tone:'#506579',background:'#f3f6fa',order:3},
};
const severityOrder=x=>SMART_SN_PRIORITY[x?.severity]?.order??SMART_SN_PRIORITY.medium.order;
const cloneEvidence=alert=>({...alert,evidence:Array.isArray(alert.evidence)
  ?alert.evidence.map(e=>({...e})):alert.evidence?{...alert.evidence}:alert.evidence});
function distinctBoardSameFailureCount(alerts,model={}){
  const pcba=text(model.current_pcba),codes=new Set(alerts.map(x=>text(x.prior_defect_code)).filter(Boolean));
  const last=model.current||model.board_failure_reference||null;
  const records=sameBoardHistory(alerts,model.board_reference_is_historical
    ?{...model,current:last}:model,pcba)
    .filter(x=>codes.has(text(x.failure.defect_code))&&text(x.failure.pcba_sn)===pcba);
  return records.length;
}
function compactCurrentPrior(alerts,model={},locale='pt-BR',currentPcba=''){
  const history=sameBoardHistory(alerts,model.board_reference_is_historical
    ?{...model,current:model.board_failure_reference}:model,currentPcba);
  const current=history.filter(x=>x.current).at(-1)||history.at(-1);
  const prior=history.filter(x=>!x.current).at(-1)||null;
  if(!current?.failure&&!prior?.failure)return '';
  const tile=(entry,label)=>{
    if(!entry?.failure)return '';
    const f=entry.failure;
    const meta=[
      text(f.defect_type).replaceAll('_',' '),
      f.defect_time?time(f.defect_time):t(locale,'Horário 2114 não comprovado','2114 timestamp unproven')
    ].filter(Boolean).join(' · ');
    return '<div class="ames-sn-alert-summary-card" data-sn-alert-history-segment>'+
      '<small>'+esc(label)+' · 2114</small>'+
      '<b>'+esc(text(f.defect_desc)||t(locale,'Descrição não informada','Description unavailable'))+'</b>'+
      '<span>'+esc(meta||'—')+'</span></div>';
  };
  return '<section class="ames-sn-alert-summary-grid" data-sn-alert-current-prior>'+
    tile(current,t(locale,'Falha atual / referência','Current failure / reference'))+
    tile(prior,t(locale,'Falha anterior','Previous failure'))+
    '</section>';
}
function compactComponentPrior(alerts=[],locale='pt-BR'){
  const observed=new Map();
  // Use prior board evidence from the correlation model, never infer an
  // earlier technician by borrowing the currently investigated PCBA.
  for(const a of alerts)for(const proof of evidenceList(a)){
    const sn=text(a.item_sn)||text(proof.binding?.item_sn);
    if(!sn)continue;
    const group=observed.get(sn)||{sn,type:text(a.item_type),boards:new Set(),failures:new Map(),repairs:new Map()};
    const board=text(proof.binding?.previous_pcba||proof.failure?.pcba_sn);
    if(board)group.boards.add(board);
    if(proof.failure?.defect_desc){
      const f=proof.failure,key=JSON.stringify([board,f.hist_seq,f.defect_code,f.defect_time]);
      if(!group.failures.has(key))group.failures.set(key,{pcba:board,description:text(f.defect_desc),at:f.defect_time,type:text(f.defect_type)});
    }
    for(const rep of proof.repairs||[]){
      // 3012 notes from a previous PCBAs only with explicit matching SN.
      if(!board||text(rep.pcba_sn)!==board)continue;
      const key=text(rep.row_key)||JSON.stringify([board,rep.repair_time,rep.repair_user,rep.repair_comment]);
      if(!group.repairs.has(key))group.repairs.set(key,rep);
    }
    observed.set(sn,group);
  }
  if(!observed.size)return '';
  const all=[...observed.values()],tiles=all.map((a,i)=>{
    const rows=[...a.failures.values()];
    const earlier=rows.map(f=>
      '<div class="ames-sn-alert-component-prior-failure" data-sn-prior-pcba-failure>'+
      '<small>'+esc(t(locale,'Falha da PCBA anterior · 2114','Previous PCBA failure · 2114'))+'</small>'+
      '<b>'+esc(f.description)+'</b>'+
      '<span>'+esc(f.pcba||'—')+' · '+esc(f.at?time(f.at):t(locale,'Horário não comprovado','Time unproven'))+
      (f.type?' · '+esc(f.type.replaceAll('_',' ')):'')+'</span></div>').join('');
    const notes=[...a.repairs.values()].map(r=>
      '<div class="ames-sn-alert-component-prior-failure" data-sn-prior-pcba-repair>'+
      '<small>'+esc(t(locale,'AT da PCBA anterior · 3012','Previous PCBA technician · 3012'))+'</small>'+
      '<b>'+esc(text(r.repair_user)||t(locale,'Identificação não comprovada','Identity unproven'))+'</b>'+
      '<span>'+esc(r.repair_time?time(r.repair_time):'—')+' · '+esc(text(r.repair_comment)||'—')+'</span></div>').join('');
    return '<div class="ames-sn-alert-summary-card" data-sn-alert-component-segment>'+
      '<small>'+esc(t(locale,'Material reutilizado · 3074','Reused material · 3074'))+'</small>'+
      '<b>'+esc(a.type||t(locale,'Material','Material'))+' · '+esc(a.sn)+'</b>'+
      '<span>'+esc(t(locale,'PCBAs anteriores','Previous PCBAs'))+': '+esc([...a.boards].join(', ')||'—')+'</span>'+
      '<details '+(i===0?'open ':'')+'data-sn-reused-material-details><summary>'+rows.length+' '+esc(t(locale,'falha(s) histórica(s)','historical failure(s)'))+' · '+a.repairs.size+' '+esc(t(locale,'registro(s) de AT','technician record(s)'))+'</summary>'+
      earlier+notes+'</details>'+
      '</div>';
  }).join('');
  return '<section class="ames-sn-alert-summary-grid" data-sn-alert-components>'+
    tiles+
    '</section>';
}

function compactComponentReuse(alerts=[],locale='pt-BR'){
  const entries=alerts.map(a=>({...a,evidence:evidenceList(a).find(p=>p.reuse)?.reuse})).filter(a=>a.evidence);
  return '<section class="ames-sn-alert-summary-grid" data-sn-alert-components data-sn-alert-observed-reuse>'+entries.map(({evidence:r})=>
    '<div class="ames-sn-alert-summary-card" data-sn-alert-component-segment><small>'+esc(t(locale,'Material em 2º uso ou mais · 3074','2nd+ use material · 3074'))+'</small><b>'+esc(fmt(r.item_type))+' · '+esc(fmt(r.item_sn))+'</b><span>'+esc(t(locale,'Usos conhecidos','Known uses'))+': '+esc(fmt(r.known_uses))+' · '+esc(t(locale,'Reusos anteriores','Previous reuses'))+': '+esc(fmt(r.previous_uses))+'</span><small>'+esc(t(locale,'Ocorrências 2114 nas PCBAs associadas','2114 occurrences on associated boards'))+': '+esc(fmt(r.failure_count))+' · '+esc(t(locale,'PCBAs anteriores','Previous PCBAs'))+': '+esc(r.previous_pcbas.join(', ')||'—')+'</small></div>'
  ).join('')+'</section>';
}

function observedReusedComponents(model={}){
  const currentPcba=text(model.current_pcba),observed=new Map();
  for(const material of model.materials||[]){
    const sn=text(material.item_sn),type=text(material.item_type),raw=material.raw||{};
    const uses=Number(material.known_use_count),reuses=Number(material.reuse_count);
    // The selection must concern the currently investigated board. A failed
    // or explicitly unconfirmed 3074 lookup cannot become a positive alert.
    if(!currentPcba||!sn||raw.current_pcba_confirmed===false||raw.is_reused===false||
      material.error||raw.error||!Number.isFinite(uses)||uses<2||
      (material.reuse_count!=null&&(!Number.isFinite(reuses)||reuses<1)))continue;
    const previous=[...new Set((material.previous_pcbas||[]).map(text).filter(p=>p&&p!==currentPcba))];
    if(!previous.length&&!(reuses>=1))continue;
    const key=type+'|'+sn;
    const frequency=materialFailureFrequency(material,model.current,currentPcba);
    const reuse={item_sn:sn,item_type:type||null,known_uses:uses,
      previous_uses:material.reuse_count==null?uses-1:reuses,
      previous_pcbas:previous,current_pcba:currentPcba,
      failure_count:frequency.total,previous_failure_count:frequency.historical,
      current_failure_counted:frequency.currentIncluded};
    const old=observed.get(key);
    if(!old||reuse.known_uses>old.evidence.reuse.known_uses||
      reuse.failure_count>old.evidence.reuse.failure_count)
      observed.set(key,{kind:'COMPONENT_REUSE_OBSERVED',item_sn:sn,item_type:type,
        pcba_sn:currentPcba,sources:['3074'],evidence:{reuse}});
  }
  return [...observed.values()];
}

function unprovenHistoricalReuseMatches(model={},reused=[],proven=[]){
  const present=new Set(proven.map(itemIdentity)),current=model.current;
  if(!current)return [];
  const matches=[];
  for(const item of reused){
    if(present.has(itemIdentity(item)))continue;
    const sameMaterials=(model.materials||[]).filter(m=>text(m.item_sn)===item.item_sn&&text(m.item_type)===item.item_type);
    if(!sameMaterials.length)continue;
    const previous=new Set(item.evidence.reuse.previous_pcbas);
    const found=new Set();
    for(const h of sameMaterials.flatMap(m=>m.history||[])){
      const old=h.failure,board=text(h.pcba_sn||old?.pcba_sn);
      if(!old||!board||!previous.has(board)||board===text(model.current_pcba))continue;
      const relation=compareFailures(current.defect_code,current.defect_desc,old.defect_code,old.defect_desc);
      if(!['EXACT','SIMILAR'].includes(relation.classification))continue;
      const oldTime=parseFailureInstant(old.defect_time),nowTime=parseFailureInstant(current.defect_time);
      if(oldTime!==null&&nowTime!==null&&oldTime>=nowTime)continue;
      const key=[board,text(old.defect_code),text(old.defect_time),String(old.hist_seq??'')].join('|');
      if(found.has(key))continue;found.add(key);
      matches.push({kind:relation.classification==='EXACT'?'COMPONENT_HISTORICAL_SAME_FAILURE_UNPROVEN':'COMPONENT_HISTORICAL_SAME_FAMILY_UNPROVEN',item_sn:item.item_sn,item_type:item.item_type,
        pcba_sn:board,current_pcba:model.current_pcba,prior_defect_code:old.defect_code,
        prior_defect_time:old.defect_time,prior_hist_seq:old.hist_seq??null,sources:['3074','2114'],
        evidence:{failure:old,comparison:relation,binding_temporal_unproven:true,
          binding:{item_sn:item.item_sn,previous_pcba:board,current_pcba:model.current_pcba}}});
    }
  }
  return matches;
}

function compactMaterialHistory(alerts=[],locale='pt-BR'){
  const boards=new Map();
  for(const a of alerts)for(const p of evidenceList(a))for(const f of [p.failure,p.current_failure]){
    if(!f?.pcba_sn||!f.defect_code)continue;
    const key=JSON.stringify([f.pcba_sn,f.defect_code]);
    if(!boards.has(key))boards.set(key,f);
  }
  return '<section class="ames-sn-alert-summary-grid" data-sn-alert-material-historical>'+[...boards.values()].slice(0,4).map(f=>
    '<div class="ames-sn-alert-summary-card"><small>'+esc(t(locale,'Falha histórica · PCBA vinculada','Historical failure · linked board'))+'</small><b>'+esc(f.defect_desc||f.defect_code)+'</b><span>'+esc(f.pcba_sn)+' · '+esc(f.defect_time?time(f.defect_time):t(locale,'Horário não comprovado','Unproven timestamp'))+'</span></div>').join('')+
    (boards.size>4?'<small>+'+(boards.size-4)+' '+esc(t(locale,'outros registros nas evidências','more records in evidence'))+'</small>':'')+'</section>';
}

// A physical Material SN may have TEN distinct 2114 failures without any
// exact cross-board repetition. The historical AT report must exist in that
// case too; recurrence and attribution to a mounting instant remain separate.
export function materialHistoricalEvidence(result={}){
  const investigation=result.material_investigation;
  if(result.detected_type!=='MATERIAL_SN'||!investigation)return {failures:[],boards:[],exactRepeated:[],query:''};
  const query=text(investigation.query_material_sn||result.sn);
  const linked=new Set((investigation.observed_cycles||[]).map(c=>text(c.pcba_sn)).filter(Boolean));
  const links=investigation.failure_links||{},seen=new Map();
  const add=(source,pcba,confidence)=>{
    pcba=text(pcba);if(!linked.has(pcba)||!source)return;
    const code=text(source['Defect Code']||source.defect_code);
    const desc=text(source['Defect Description']||source.defect_desc);
    if(!code&&!desc)return;
    const at=text(source['Defect Time']||source.defect_time)||null;
    const seq=source['Defect Hist Seq']??source.hist_seq??null;
    const identity=seq!==null&&text(seq)!==''?`seq:${text(seq)}`:`clock:${at||'?'}:${desc}`;
    const key=JSON.stringify([pcba,identity,code]);
    const value={pcba_sn:pcba,defect_code:code,defect_desc:desc,defect_time:at,
      hist_seq:seq,defect_type:text(source['Defect Type']||source.defect_type),
      repair_status:text(source['Repair Status']||source.repair_status),confidence};
    const prior=seen.get(key),priority={historical:0,candidate:1,proven:2};
    if(!prior||priority[confidence]>priority[prior.confidence]||(!prior.defect_time&&at))
      seen.set(key,{...prior,...value,defect_time:at||prior?.defect_time||null,
        confidence:priority[confidence]>=priority[prior?.confidence]||!prior?confidence:prior.confidence});
  };
  // All available 2114 history is important, including faults outside the
  // 3074 time interval. Such records are historical board context, not faults
  // attributable to the component's physical presence at that instant.
  for(const entry of result.trace_2114?.pcbas||[]){
    if(entry?.status&&entry.status!=='COMPLETE')continue;
    for(const row of entry?.result?.rows||[])add(row,entry.pcba_sn,'historical');
  }
  for(const row of links.excluded||[])add(row.history,row.pcba_sn||row.cycle?.pcba_sn,'historical');
  for(const row of links.candidates||[])add(row.history,row.pcba_sn||row.cycle?.pcba_sn,'candidate');
  for(const row of links.proven||[])add(row.history,row.pcba_sn||row.cycle?.pcba_sn,'proven');
  const failures=[...seen.values()].sort((a,b)=>a.pcba_sn.localeCompare(b.pcba_sn)||
    Number(a.hist_seq??Infinity)-Number(b.hist_seq??Infinity)||text(a.defect_time).localeCompare(text(b.defect_time)));
  const byBoard=new Map();for(const f of failures){const rows=byBoard.get(f.pcba_sn)||[];rows.push(f);byBoard.set(f.pcba_sn,rows);}
  const groups=[];
  for(const f of failures){
    let group=groups.find(g=>compareFailures(g.defect_code,g.defect_desc,f.defect_code,f.defect_desc).classification==='EXACT');
    if(!group){group={defect_code:f.defect_code,defect_desc:f.defect_desc,pcbas:new Set()};groups.push(group);}
    group.pcbas.add(f.pcba_sn);
  }
  const exactRepeated=groups.filter(g=>g.pcbas.size>1).map(g=>({
    defect_code:g.defect_code,defect_desc:g.defect_desc,pcbas:[...g.pcbas].sort()}));
  return {query,failures,boards:[...byBoard].map(([pcba_sn,failures])=>({pcba_sn,failures})),exactRepeated};
}

function materialHistoricalAlerts(result={}){
  const history=materialHistoricalEvidence(result);
  if(!history.failures.length)return [];
  const repeated=history.exactRepeated.length>0;
  return [{id:repeated?'material-historical-same-failure':'material-history-linked-boards',
    severity:repeated?priorityMax('high',failureFrequencyPriority(history.failures.length)):failureFrequencyPriority(history.failures.length),
    title:repeated?'Mesma falha histórica em PCBAs distintas deste componente':'Histórico de falhas nas PCBAs vinculadas ao componente',
    summary:`${history.failures.length} registro(s) 2114 disponíveis em ${history.boards.length} PCBA(s) vinculadas · ${history.exactRepeated.length} falha(s) repetida(s) entre placas. Falha da PCBA não comprova defeito do componente.`,
    materialHistory:history,
    alerts:history.failures.map(f=>({kind:'MATERIAL_BOARD_HISTORY',item_type:'MATERIAL_SN',item_sn:history.query,
      sources:['3074','2114'],evidence:{failure:f,material_historical_confidence:f.confidence}}))}];
}

function materialHistoricalProof(history,result,locale){
  const repairRows=result.trace_3012?.rows||[],process=result.trace_3022||{};
  const processRows=[...(process.process_passages||[]),...(process.operator_evidence||[]),...(process.rows||[])];
  const repairOf=pcba=>{
    const rows=repairRows.filter(r=>text(r.pcba_sn||r['PCBA'])===pcba),seen=new Map();
    for(const r of rows){const key=text(r.row_key)||JSON.stringify([pcba,r.defect_code||r['Defect Code'],r.defect_time||r['Defect Time'],r.repair_time||r['Repair Time'],r.repair_user||r['Repair User'],r.repair_comment||r['Repair Comment']]);
      if(!seen.has(key))seen.set(key,r);}
    return [...seen.values()];
  };
  return '<div data-sn-material-history-full><p class="ames-sn-alert-rule-note">'+esc(t(locale,
    'Registros 2114 de PCBAs vinculadas pela 3074. Uma falha fora do intervalo de montagem é apenas histórico da placa. Comentários 3012 por PCBA são candidatos, salvo vínculo exato demonstrado; não atribuir automaticamente ao componente. Correlação não comprova causa.',
    '2114 records from boards linked in 3074. Faults outside a binding interval are only board history. Board-level 3012 comments are candidates unless exact association is proven. Correlation does not prove cause.'))+'</p>'+(
    history.failures.some(f=>f.confidence!=='proven')?'<p class="ames-sn-alert-rule-note">'+esc(t(locale,
      'A montagem no instante de uma ou ambas as falhas não foi comprovada; vínculo 3074 não atribui causa ao material.',
      'Mounting at the instant of one or more failures is unproven; the 3074 link does not assign cause to the material.'))+'</p>':'')+history.boards.map((board,i)=>{
    const repairs=repairOf(board.pcba_sn);
    const failures=board.failures.map(f=>{
      const candidates=repairs.filter(r=>compareFailures(f.defect_code,f.defect_desc,r.defect_code||r['Defect Code'],r.defect_desc||r['Defect Description']).classification==='EXACT');
      const repairClocks=[...new Set(candidates.map(r=>text(r.defect_time||r['Defect Time'])).filter(Boolean))];
      const timing=f.defect_time?'2114 · '+time(f.defect_time):repairClocks.length===1?'3012 · '+time(repairClocks[0])+' ('+t(locale,'candidato','candidate')+')':t(locale,'Horário da falha não comprovado','Failure time unproven');
      const meta=[f.hist_seq==null?'':'Hist Seq '+f.hist_seq,f.defect_type,
        f.repair_status?'Repair Status 2114: '+f.repair_status:''].filter(Boolean).join(' · ');
      return '<div class="ames-sn-smart-proof" data-sn-material-history-failure><small>'+esc(t(locale,'Falha registrada na PCBA','Failure recorded on board'))+'</small><b>'+esc(f.defect_desc||f.defect_code)+'</b><span>'+esc(timing)+'</span>'+ (meta?'<small>'+esc(meta)+'</small>':'')+'</div>';
    }).join('');
    const comments=repairs.map(r=>{
      const normalized={...r,pcba_sn:board.pcba_sn,repair_user:r.repair_user||r['Repair User'],repair_time:r.repair_time||r['Repair Time'],repair_comment:r.repair_comment||r['Repair Comment']};
      const name=provenRepairUserName(normalized,result,board.pcba_sn),id=text(normalized.repair_user),technician=a6900ForSnRepair(normalized,result,board.pcba_sn);
      return '<div class="ames-sn-smart-proof" data-sn-material-history-repair><small>3012 · '+esc(t(locale,'atendimento registrado nesta PCBA','repair record on this board'))+'</small><b>'+esc(technician?`${technician.name} (${technician.id})`:t(locale,'Técnico da falha A6900 não comprovado','A6900 fault technician unproven'))+'</b><small>3022 · A6900</small><small>'+esc(t(locale,'Usuário de reparo 3012','3012 repair user'))+': '+esc(name?name+(id?' ('+id+')':''):id||'—')+'</small><span>'+esc(normalized.repair_time?time(normalized.repair_time):'—')+'</span><small>'+esc([r.repair_code||r['Repair Code'],r.repair_desc||r['Repair Description']].filter(Boolean).join(' · ')||t(locale,'Finalização não informada','Completion not provided'))+'</small><span style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(normalized.repair_comment||t(locale,'Sem comentário disponível','No comment available'))+'</span></div>';
    }).join('');
    const passages=processRows.filter(p=>text(p.pcba_sn||p.PCBA)===board.pcba_sn&&text(p.event_time||p['Event Time'])).slice(0,4);
    return '<details '+(i===0?'open ':'')+'data-sn-material-history-board><summary>'+esc(board.pcba_sn)+' · '+board.failures.length+' '+esc(t(locale,'falha(s) 2114','2114 failure(s)'))+' · '+repairs.length+' '+esc(t(locale,'registro(s) 3012','3012 repair(s)'))+'</summary><div class="ames-sn-alert-evidence-grid">'+failures+'</div>'+
      (repairs.length?'<section class="ames-sn-alert-white"><h4>'+esc(t(locale,'ATs, resultado e comentários registrados · 3012','Technicians, outcome and comments · 3012'))+'</h4><div class="ames-sn-alert-evidence-grid">'+comments+'</div></section>':'<p class="ames-sn-alert-muted">'+esc(t(locale,'Nenhum comentário 3012 disponível para esta PCBA na cobertura atual.','No 3012 comment available for this board in current coverage.'))+'</p>')+
      (passages.length?'<small class="ames-sn-alert-muted">3022 · '+esc(t(locale,'Passagens de processo, não horários comprovados das falhas','Process passages, not proven failure times'))+': '+passages.map(p=>esc(time(p.event_time||p['Event Time']))).join(' · ')+'</small>':'')+'</details>';
  }).join('')+'</div>';
}


function card({id,title,summary,severity='medium',alerts=[],usage=null,materialHistory=null},locale,result={},currentPcba='',model={},sharedTechnicians='',showBoardHighlights=true) {
  const boardAlert=id.startsWith('pcba-')||id.startsWith('mainboard-');
  const tier=SMART_SN_PRIORITY[severity]||SMART_SN_PRIORITY.medium;
  const tone=tier.tone,background=tier.background;
  const badge=t(locale,severity==='medium'?'PRIORIDADE MÉDIA':severity==='low'?'PRIORIDADE BAIXA':tier.labelPt+' PRIORIDADE',tier.labelEn+' PRIORITY');
  const usageLine=usage?.proven?'<span>'+esc(t(locale,'Uso da PCBA','PCBA use'))+': <b>'+
    esc(usage.use_index?String(usage.use_index)+'º':fmt(usage.known_uses))+'</b>'+
    (usage.previous_uses!==null?' · '+esc(t(locale,'reusos anteriores','previous reuses'))+': '+esc(fmt(usage.previous_uses)):'')+'</span>':'';
  const boardRows=boardAlert?sameBoardHistory(alerts,
    model.board_reference_is_historical?{...model,current:model.board_failure_reference}:model,
    currentPcba):[];
  const analysisKinds=boardAlert
    ? [...new Set(boardRows.map(entry=>text(entry.failure.defect_type).replace(/_/g,' ')).filter(Boolean))].join(' → ')
    : [...new Set(alerts.flatMap(a=>evidenceList(a).map(p=>
      [p.failure?.defect_type,p.current_failure?.defect_type].filter(Boolean).join(' → '))).filter(Boolean))].join(' · ');
  const countLine=boardRows.length?'<small class="ames-sn-alert-history-count">'+
    esc(boardRows.length+' '+t(locale,'registros distintos na 2114','distinct 2114 records'))+'</small>':'';
  const proof=materialHistory?materialHistoricalProof(materialHistory,result,locale):boardAlert?uniqueBoardProof(alerts,model,locale,currentPcba):
    alerts.map(alert=>compactEvidence(alert,locale,result,currentPcba)).join('');
  const header='<div class="ames-sn-alert-header"><span aria-hidden="true" class="ames-sn-alert-symbol">⚠</span>'+
    '<div class="ames-sn-alert-intro"><b class="ames-sn-alert-title">'+esc(title)+'</b><p>'+esc(summary)+'</p>'+
    usageLine+countLine+'</div>'+
    '<span class="ames-sn-alert-priority" style="color:'+tone+'">'+esc(badge)+'</span></div>';
  const historicalNote=boardAlert&&model.board_reference_is_historical?
    '<p class="ames-sn-alert-rule-note">'+esc(t(locale,
      'Recorrência histórica desta PCBA na 2114. Existe uma montagem posterior: estes registros NÃO são falhas comprovadas dos componentes do novo ciclo.',
      'Historical recurrence of this board in 2114. A later mounting exists: these records are NOT proven faults of parts installed in the newer cycle.'))+'</p>':'';
  const coverageNote=id.startsWith('component-')&&model.source_states?.['3074']==='partial'
    ?'<p class="ames-sn-alert-rule-note" data-sn-alert-3074-partial>'+esc(t(locale,
      '3074 parcial: este alerta usa somente os vínculos observados; podem existir outras peças ou ocorrências não coletadas. O total não está comprovado.',
      '3074 partial: this alert uses only observed links; other parts or occurrences may not have been collected. The full total is unproven.'))+'</p>':'';
  const production=boardAlert&&!model.board_reference_is_historical?
    productionSnapshot(model,result,locale,currentPcba):'';
  const highlights=boardAlert?(id.startsWith('pcba-')&&showBoardHighlights?compactCurrentPrior(alerts,model,locale,currentPcba):''):
    materialHistory?compactMaterialHistory(alerts,locale):id.startsWith('component-reuse')?compactComponentReuse(alerts,locale):compactComponentPrior(alerts,locale);
  // Restore the compact alert agreed by the operator. No evidence is dropped:
  // 2114/3012/3022, timestamps and candidate limits open under one control.
  return '<article class="ames-sn-smart-alert ames-sn-alert-level-'+esc(severity)+'" data-smart-alert="'+esc(id)+'" data-sn-alert-severity="'+esc(severity)+'" style="border:1px solid color-mix(in srgb,'+
    tone+' 35%,transparent);border-left:6px solid '+tone+';background:'+background+';border-radius:10px;padding:13px 14px">'+
    header+coverageNote+highlights+sharedTechnicians+
    '<details style="margin-top:8px"><summary>'+esc(t(locale,'Ver evidências ('+alerts.length+')','View evidence ('+alerts.length+')'))+
    '</summary>'+historicalNote+production+
    '<div class="ames-sn-alert-proof-body">'+proof+'</div>'+
    '<small class="ames-sn-alert-final-warning">'+esc(t(locale,
    'Correlação técnica — não confirma causa raiz.','Technical correlation — does not confirm root cause.'))+
    '</small></details></article>';
}

export function buildSmartSnAlerts(model={},result={}){
  const alerts=distinctAlerts(model.alerts||[]).map(cloneEvidence),usage=pcbaUsageEvidence(model,result),out=[];
  // 2114 Hist Seq can distinguish records with the same timestamp but cannot
  // prove which 3012 repair row belongs to which AT cycle. Display every
  // PCBA+Defect Code row (including its full comment), without inventing links.
  const board=text(model.current_pcba),code=text((model.current||model.board_failure_reference)?.defect_code);
  const candidateRows=(model.repairs||[]).filter(r=>text(r.pcba_sn)===board&&text(r.defect_code)===code);
  const distinctCandidates=[...new Map(candidateRows.map(r=>[
    JSON.stringify([r.row_key,r.repair_time,r.repair_user,r.repair_comment]),r])).values()]
    .sort((a,b)=>String(a.repair_time||'').localeCompare(String(b.repair_time||'')));
  for(const alert of alerts.filter(a=>a.kind==='PCBA_SAME_FAILURE')){
    for(const proof of evidenceList(alert)){
      if(['hist_seq_same_clock','hist_seq_only'].includes(proof.order_basis)){
        proof.repairs=[];proof.current_3012=[];proof.ambiguous_3012=distinctCandidates;
      }
    }
  }

  const byKind=kind=>alerts.filter(alert=>alert.kind===kind);
  out.push(...materialHistoricalAlerts(result));
  const sameFailure=byKind('PCBA_SAME_FAILURE'),sameFamily=byKind('PCBA_SAME_FAMILY');
  if(sameFailure.length){
    const second=pcbaSecondUse(usage);
    out.push({id:'pcba-same-failure',severity:distinctBoardSameFailureCount(sameFailure,model)>=3?'critical':'high',title:second?'PCBA 2º+ uso com mesma falha':'Mesma falha já ocorreu nesta PCBA',summary:second?'A própria placa possui evidência de reutilização e a mesma falha aparece no histórico anterior.':'A mesma falha atual aparece em ocorrência anterior comprovada desta PCBA.',alerts:sameFailure,usage:usage.proven?usage:null});
  }
  if(sameFamily.length)out.push({id:'pcba-same-family',severity:'high',title:pcbaSecondUse(usage)?'PCBA 2º+ uso com mesma família de falha':'Mesma família de falha já ocorreu nesta PCBA',summary:'Existe ocorrência anterior comprovada da mesma família técnica nesta PCBA.',alerts:sameFamily,usage:usage.proven?usage:null});

  const componentSame=byKind('COMPONENT_SAME_FAILURE'),componentFamily=byKind('COMPONENT_SAME_FAMILY');
  const observed=observedReusedComponents(model),frequencyOf=rows=>observed
    .filter(item=>rows.some(row=>itemIdentity(row)===itemIdentity(item)))
    .map(item=>failureFrequencyPriority(item.evidence.reuse.failure_count))
    .reduce((best,next)=>priorityMax(best,next),'low');
  if(componentSame.length){
    const count=new Set(componentSame.map(itemIdentity)).size;
    out.push({id:'component-same-failure',severity:priorityMax(count>=3?'critical':'high',frequencyOf(componentSame)),title:`${count} componente${count===1?'':'s'} reutilizado${count===1?'':'s'} com mesma falha`,summary:'O componente estava anteriormente vinculado a outra PCBA com a mesma falha e o vínculo temporal foi comprovado.',alerts:componentSame});
  }
  if(componentFamily.length){
    const count=new Set(componentFamily.map(itemIdentity)).size;
    out.push({id:'component-same-family',severity:priorityMax('medium',frequencyOf(componentFamily)),title:`${count} componente${count===1?'':'s'} reutilizado${count===1?'':'s'} com mesma família`,summary:'Há componente reutilizado vindo de PCBA com falha da mesma família técnica.',alerts:componentFamily});
  }
  // Reuse is a physical 3074 finding, independent of whether the old PCBA
  // experienced the same defect. The correlation-only alert pipeline used to
  // omit this entirely (e.g. four proven 2nd-use parts and zero alerts).
  // A more specific proven same-failure/family alert already covers its part.
  const compatible=byKind('COMPONENT_TYPE_COMPATIBLE');
  const historicalCandidates=unprovenHistoricalReuseMatches(model,observed,[...componentSame,...componentFamily]);
  // A part can have several old-board failures. Show the strongest relation
  // once per physical part while keeping all of its exact/similar proofs.
  const exactCandidates=historicalCandidates.filter(a=>a.kind==='COMPONENT_HISTORICAL_SAME_FAILURE_UNPROVEN');
  const exactIdentity=new Set(exactCandidates.map(itemIdentity));
  const familyCandidates=historicalCandidates.filter(a=>a.kind==='COMPONENT_HISTORICAL_SAME_FAMILY_UNPROVEN'&&!exactIdentity.has(itemIdentity(a)));
  for(const [id,rows,kind] of [
    ['component-historical-same-failure',exactCandidates,'falha'],
    ['component-historical-same-family',familyCandidates,'família'],
  ])if(rows.length){
    const count=new Set(rows.map(itemIdentity)).size;
    const priorities=observed.filter(a=>rows.some(row=>itemIdentity(row)===itemIdentity(a)))
      .map(a=>failureFrequencyPriority(a.evidence.reuse.failure_count));
    const severity=priorities.reduce((best,next)=>priorityMax(best,next),'high');
    out.push({id,severity,
      title:`${count} componente${count===1?'':'s'} de 2º+ uso · mesma ${kind} em PCBA anterior`,
      summary:'A 2114 registra correspondência em outra PCBA vinculada pela 3074. Prioridade de investigação alta; o vínculo no instante da falha e a causa no material ainda não foram comprovados.',
      alerts:rows});
  }
  const specific=new Set([...componentSame,...componentFamily,...compatible,...historicalCandidates].map(itemIdentity));
  const reused=observed.filter(item=>!specific.has(itemIdentity(item)));
  if(reused.length){
    for(const severity of ['critical','high','medium','low']){
      const rows=reused.filter(item=>failureFrequencyPriority(item.evidence.reuse.failure_count)===severity);
      if(!rows.length)continue;
      const count=rows.length;
      out.push({id:severity==='low'?'component-reuse':`component-reuse-${severity}`,severity,
        title:`${count} componente${count===1?'':'s'} em 2º uso ou mais · ${severity==='low'?'sem correlação comprovada':severity==='medium'?'3 falhas observadas':severity==='high'?'4–5 falhas observadas':'6+ falhas observadas'}`,
        summary:'Reutilização física observada na 3074. Contam-se ocorrências distintas da 2114 nas PCBAs associadas, não defeitos comprovadamente causados pelo material.',
        alerts:rows});
    }
  }
  if(compatible.length){
    const count=new Set(compatible.map(itemIdentity)).size;
    out.push({id:'component-compatible-failure',severity:priorityMax('low',frequencyOf(compatible)),
      title:`${count} componente${count===1?'':'s'} reutilizado${count===1?'':'s'} compatível${count===1?'':'is'} com a falha`,
      summary:'O tipo físico da peça já reutilizada é compatível com a falha registrada; exige investigação e não comprova defeito do material.',alerts:compatible});
  }

  const recurrence=byKind('PCBA_MAINBOARD_REPAIR_RECURRENCE');
  if(recurrence.length)out.push({id:'mainboard-recurrence',severity:'high',title:'Falha reapareceu após MainBoard repair',summary:'Há reparo MainBoard comprovado em ciclo anterior e uma nova falha posterior relacionada; retorno 3022 só entra quando comprovado.',alerts:recurrence});
  const repeated=byKind('PCBA_REPEATED_MAINBOARD_REPAIR');
  if(repeated.length)out.push({id:'mainboard-repeated',severity:'high',title:'Múltiplos reparos MainBoard nesta PCBA',summary:'Foram identificadas intervenções MainBoard distintas e temporalmente válidas nesta placa.',alerts:repeated});
  const unrelated=(model.own_history||[]).filter(f=>{
    const current=model.current||{},cmp=f&&current&&f.pcba_sn===model.current_pcba?
      // This card is a visibility marker for distinct prior faults, not
      // evidence of an actual repair or material root cause.
      (f.defect_code&&current.defect_code&&f.defect_code!==current.defect_code):false;
    return Boolean(cmp);
  });
  const distinct=new Map();
  for(const f of unrelated){
    const key=[f.hist_seq??'',f.defect_code||'',f.defect_time||''].join('|');
    if(!distinct.has(key))distinct.set(key,f);
  }
  if(distinct.size>=1&&!sameFailure.length&&!sameFamily.length){
    const count=distinct.size+(model.current?1:0);
    // A current, unrelated event is visible in the title, but only the
    // evidenced *prior* faults establish historical frequency/severity.
    out.push({id:'pcba-diverse-history',severity:failureFrequencyPriority(distinct.size),title:`${count} falhas distintas observadas nesta PCBA`,
      summary:'Histórico múltiplo na 2114: requer revisão, mesmo sem recorrência igual ou similar. Não prova defeito da placa.',
      alerts:[{kind:'PCBA_DIVERSE_FAILURE_HISTORY',pcba_sn:model.current_pcba,
        evidence:[...distinct.values()].map(f=>({failure:f,order_basis:'history_only'}))}]});
  }
  const boardHistory=byKind('PCBA_MAINBOARD_REPAIR_HISTORY');
  if(boardHistory.length)out.push({id:'mainboard-history',severity:'medium',title:'Histórico de MainBoard repair',summary:'Existe reparo MainBoard anterior comprovado na própria PCBA.',alerts:boardHistory});
  return out.sort((a,b)=>severityOrder(a)-severityOrder(b));
}

function translateAlert(alert,locale){
  if(!String(locale||'pt-BR').startsWith('en'))return alert;
  const map={
    'PCBA 2º+ uso com mesma falha':'2nd+ use PCBA with the same failure',
    'Mesma falha já ocorreu nesta PCBA':'The same failure already occurred on this PCBA',
    'PCBA 2º+ uso com mesma família de falha':'2nd+ use PCBA with the same failure family',
    'Mesma família de falha já ocorreu nesta PCBA':'The same failure family already occurred on this PCBA',
    'Falha reapareceu após MainBoard repair':'Failure reappeared after MainBoard repair',
    'Múltiplos reparos MainBoard nesta PCBA':'Multiple MainBoard repairs on this PCBA',
    'Histórico de MainBoard repair':'MainBoard repair history',
  };
  let title=map[alert.title]||alert.title;
  title=title.replace(/^(\d+) falhas anteriores diferentes nesta PCBA$/,(_,n)=>`${n} different previous failures on this PCBA`);
  title=title.replace(/^(\d+) falhas distintas observadas nesta PCBA$/,(_,n)=>`${n} distinct failures observed on this PCBA`);
  title=title.replace(/^(\d+) componentes? reutilizados? com mesma falha$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} with the same failure`)
    .replace(/^(\d+) componentes? reutilizados? com mesma família$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} with the same family`);
  title=title.replace(/^(\d+) componentes? reutilizados? compatíve(?:l|is) com a falha$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} compatible with the failure`);
  title=title.replace(/^(\d+) componentes? em 2º uso ou mais$/,(_,n)=>`${n} component${n==='1'?'':'s'} in 2nd use or later`);
  title=title.replace(/^(\d+) componentes? em 2º uso com mesma falha na PCBA anterior \(não comprovada no material\)$/,(_,n)=>`${n} 2nd-use component${n==='1'?'':'s'} with the same failure on a prior board (unproven for the part)`);
  title=title.replace(/^(\d+) componentes? de 2º\+ uso · mesma (falha|família) em PCBA anterior$/,(_,n,kind)=>`${n} 2nd+ use component${n==='1'?'':'s'} · same ${kind==='falha'?'failure':'family'} on prior PCBA`);
  title=title.replace(/^(\d+) componentes? em 2º uso ou mais · (sem correlação comprovada|3 falhas observadas|4–5 falhas observadas|6\+ falhas observadas)$/,(_,n,level)=>`${n} component${n==='1'?'':'s'} in 2nd+ use · ${{'sem correlação comprovada':'no proven correlation','3 falhas observadas':'3 observed failures','4–5 falhas observadas':'4–5 observed failures','6+ falhas observadas':'6+ observed failures'}[level]}`);
  const summaries={
    'A própria placa possui evidência de reutilização e a mesma falha aparece no histórico anterior.':'The board itself has reuse evidence and the same failure appears in its prior history.',
    'A mesma falha atual aparece em ocorrência anterior comprovada desta PCBA.':'The current failure appears in a proven prior occurrence of this PCBA.',
    'Existe ocorrência anterior comprovada da mesma família técnica nesta PCBA.':'A proven prior occurrence from the same technical family exists on this PCBA.',
    'O componente estava anteriormente vinculado a outra PCBA com a mesma falha e o vínculo temporal foi comprovado.':'The component was previously bound to another PCBA with the same failure and the temporal binding was proven.',
    'Há componente reutilizado vindo de PCBA com falha da mesma família técnica.':'A reused component came from a PCBA with a failure in the same technical family.',
    'Reutilização física observada na 3074. Não significa que a falha atual já ocorreu nesses materiais, nem comprova sua causa.':'Physical reuse observed in 3074. This does not mean the current failure previously occurred in these materials or establish its cause.',
    'A 2114 registra a mesma falha em PCBA anteriormente vinculada pela 3074, mas a presença física do componente no momento da falha não foi comprovada.':'2114 records the same failure on a board previously linked in 3074, but physical presence of the component at the failure time is unproven.',
    'A 2114 registra correspondência em outra PCBA vinculada pela 3074. Prioridade de investigação alta; o vínculo no instante da falha e a causa no material ainda não foram comprovados.':'2114 records a corresponding failure on another PCBA linked by 3074. Investigative priority is high; mounting at the failure time and a material cause remain unproven.',
    'Reutilização física observada na 3074. Contam-se ocorrências distintas da 2114 nas PCBAs associadas, não defeitos comprovadamente causados pelo material.':'Physical reuse observed in 3074. Distinct 2114 occurrences on associated PCBAs are counted, not defects proven to have been caused by this material.',
    'O tipo físico da peça já reutilizada é compatível com a falha registrada; exige investigação e não comprova defeito do material.':'The reused physical component type matches the recorded failure; investigate it, but a material defect is not established.',
    'Há reparo MainBoard comprovado em ciclo anterior e uma nova falha posterior relacionada; retorno 3022 só entra quando comprovado.':'A prior MainBoard repair is proven and a related later failure exists; 3022 return is included only when proven.',
    'Foram identificadas intervenções MainBoard distintas e temporalmente válidas nesta placa.':'Distinct, temporally valid MainBoard interventions were identified on this board.',
    'Existe reparo MainBoard anterior comprovado na própria PCBA.':'A prior MainBoard repair is proven on this PCBA.',
  };
  return {...alert,title,summary:summaries[alert.summary]||(
    alert.id==='pcba-diverse-history'?'Multiple previous 2114 faults merit review even without exact recurrence. This does not prove a board defect.':alert.summary)};
}

export function renderSmartSnAlerts(model={},result={},locale='pt-BR'){
  const alerts=buildSmartSnAlerts(model,result).map(alert=>translateAlert(alert,locale));
  if(!alerts.length)return '';
  const severityCounts=alerts.reduce((counts,a)=>(counts[a.severity]=(counts[a.severity]||0)+1,counts),{});
  const summary=['critical','high','medium','low'].filter(level=>severityCounts[level])
    .map(level=>severityCounts[level]+' '+t(locale,
      ({critical:'muito alta',high:'alta',medium:'média',low:'baixa'})[level],
      ({critical:'very high',high:'high',medium:'medium',low:'low'})[level])).join(' · ');
  const allProofs=alerts.flatMap(group=>group.alerts);
  const sharedTechnicians=shortTechnicianEvidence(allProofs,locale,result,model.current_pcba,model.repairs||[]);
  let boardHighlightsShown=false;
  const firstBoardIndex=alerts.findIndex(alert=>alert.id.startsWith('pcba-')||alert.id.startsWith('mainboard-'));
  const cards=alerts.map((alert,i)=>{
    const firstBoard=alert.id.startsWith('pcba-')&&!boardHighlightsShown;
    if(firstBoard)boardHighlightsShown=true;
    return card(alert,locale,result,model.current_pcba,model,i===(firstBoardIndex<0?0:firstBoardIndex)?sharedTechnicians:'',firstBoard);
  });
  return `<section class="ames-sn-smart-alerts" data-sn-smart-alerts data-has-smart-alerts="true" style="display:grid;gap:8px"><div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Alertas inteligentes da Consulta por SN','Smart Query-by-SN alerts'))}</h3><p>${esc(t(locale,'Prioriza relações de reuso, recorrência e reparo que merecem investigação. Cada alerta abre a evidência que o sustenta.','Prioritizes reuse, recurrence and repair relationships that deserve investigation. Each alert opens its supporting evidence.'))}</p></div><span class="status warn">${esc(`${alerts.length}${summary?` · ${summary}`:''}`)}</span></div>${cards.join('')}</section>`;
}

const expansionState=new WeakMap();
export function decorateSmartSnAlerts(root,model={},result={}){
  const scope=text(model.current_pcba)+'|'+text(result.sn);
  let state=expansionState.get(root);
  if(!state||state.scope!==scope){state={scope,open:new Set()};expansionState.set(root,state);}
  // Preserve operator-expanded evidence across background polling and DOM redraw.
  root.querySelectorAll('[data-smart-alert]').forEach(card=>{
    const details=card.querySelector(':scope > details'),key=card.dataset.smartAlert;
    if(details?.open)state.open.add(key);
    const extra=card.querySelector('.ames-sn-alert-extra-repairs');
    if(extra?.open)state.open.add(key+':extra');
  });
  root.querySelector('[data-sn-smart-alerts]')?.remove();
  // The operator's default tab is History / Complete story. Technical is optional.
  const host=root.querySelector('[data-sn-tab-panel="story"]')||root.querySelector('.ames-sn-forensic-panel')||root.querySelector('[data-sn-tab-panel="technical"]')||root.querySelector('[data-sn-result]');
  if(!host)return;
  const wrapper=host.ownerDocument.createElement('div');wrapper.setAttribute('data-no-i18n','');
  wrapper.innerHTML=renderSmartSnAlerts(model,result,host.ownerDocument.documentElement?.lang||'pt-BR');
  const panel=wrapper.firstElementChild;if(!panel)return;
  for(const card of panel.querySelectorAll('[data-smart-alert]')){
    const details=card.querySelector(':scope > details'),key=card.dataset.smartAlert;if(!details)continue;
    if(state.open.has(key))details.open=true;
    details.addEventListener('toggle',()=>{if(!details.isConnected)return;if(details.open)state.open.add(key);else state.open.delete(key);});
    const extra=card.querySelector('.ames-sn-alert-extra-repairs');
    if(extra){
      if(state.open.has(key+':extra'))extra.open=true;
      extra.addEventListener('toggle',()=>{if(!extra.isConnected)return;
        if(extra.open)state.open.add(key+':extra');else state.open.delete(key+':extra');
      });
    }
  }
  host.prepend(panel);
}
