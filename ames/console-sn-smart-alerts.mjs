import {explainFailureComparison} from './data/failure-taxonomy.mjs';
import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {pcbaUsageEvidence} from './console-sn-history-detail.mjs';
import {parseFailureInstant,productionEvidenceForOccurrence} from './data/production-evidence.mjs';
import {provenRepairUserName} from './console-sn-repair-evidence.mjs';

const text=value=>String(value??'').trim();
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||text(value)===''?'—':String(value);
const evidenceList=alert=>(Array.isArray(alert?.evidence)?alert.evidence:[alert?.evidence]).filter(Boolean);
const itemIdentity=alert=>`${text(alert?.item_type)}|${text(alert?.item_sn)}`;

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
  const id=text(repair.repair_user),name=provenRepairUserName(repair,result,currentPcba);
  const actor=name?name+' ('+id+')':t(locale,'Nome não comprovado · código','Name unproven · ID')+' '+fmt(id);
  return `<div class="ames-sn-smart-proof"><small>${esc(label)}</small>
    <b>${esc(actor)}</b>
    <span>${esc(t(locale,'Horário da análise','Analysis time'))}: ${esc(repair.repair_time?time(repair.repair_time):'—')}</span>
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
    if(failure.pcba_sn||failure.defect_code||failure.defect_time){
      rows.push(proof2114(t(locale,'Falha anterior','Previous failure'),failure,locale));
      // Only display the current occurrence on PCBA recurrence alerts, avoiding
      // duplicated current card for each physical component history.
      if(alert.kind?.startsWith('PCBA_'))rows.push(proof2114(t(locale,'Falha atual','Current failure'),proof.current_failure,locale));
    }
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
    for(const repair of proof.repairs||[])rows.push(proof3012(repair,locale,t(locale,'3012 · registro anterior associado','3012 · associated prior record'),result,currentPcba));
    for(const repair of proof.current_3012||[])rows.push(proof3012(repair,locale,t(locale,'3012 · registro atual candidato','3012 · candidate current record'),result,currentPcba));
    for(const repair of proof.ambiguous_3012||[])rows.push(proof3012(repair,locale,t(locale,'3012 · não atribuído à sequência 2114','3012 · unassigned to 2114 sequence'),result,currentPcba));
    for(const repair of proof.candidates_3012||[])rows.push(proof3012(repair,locale,t(locale,'3012 · registro candidato, sem ciclo comprovado','3012 · candidate, cycle unproven'),result,currentPcba));
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
      'Comentários 3012 já aparecem acima, sem repetição. Uma correlação não confirma a causa raiz.',
      '3012 comments are shown above without duplication. Correlation does not establish root cause.'))+'</small>'+
    '</div>';
}

function shortTechnicianEvidence(alerts,locale,result,currentPcba){
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
  const rows=[...entries.values()].sort((a,b)=>String(a.repair.repair_time||'').localeCompare(String(b.repair.repair_time||'')));
  if(!rows.length)return '';
  const evidence=({repair,label})=>{
    const id=text(repair.repair_user),name=provenRepairUserName(repair,result,currentPcba);
    const person=name?name+(id?' ('+id+')':''):(id?t(locale,'Nome não comprovado · ','Name not proven · ')+id:'—');
    return '<div class="ames-sn-alert-tech-preview" data-sn-alert-repair-row><div class="ames-sn-alert-tech-id">'+
      '<small>'+esc(label)+'</small><b>'+esc(person)+'</b><time>'+esc(repair.repair_time?time(repair.repair_time):'—')+'</time></div>'+
      '<p>'+esc(fmt(repair.repair_comment))+'</p></div>';
  };
  const maxVisible=3;
  return '<section data-sn-alert-technician-preview class="ames-sn-alert-white ames-sn-alert-technicians">'+
    '<div class="ames-sn-alert-evidence-head"><b>'+esc(t(locale,'ATs e comentários · 3012','Technicians and comments · 3012'))+
    '</b><span>'+rows.length+' '+esc(t(locale,'registro(s)','record(s)'))+'</span></div>'+
    '<p class="ames-sn-alert-muted">'+esc(t(locale,
      'Nomes apresentados somente quando comprovados. Registros sem vínculo temporal não são atribuídos individualmente à sequência 2114.',
      'Names appear only with evidence. Rows without temporal linkage are not assigned to individual 2114 sequences.'))+'</p>'+
    '<div class="ames-sn-alert-technician-list">'+rows.slice(0,maxVisible).map(evidence).join('')+'</div>'+
    (rows.length>maxVisible?'<details class="ames-sn-alert-extra-repairs"><summary>'+
      esc(t(locale,'Outros comentários 3012','Other 3012 comments'))+' ('+(rows.length-maxVisible)+')</summary>'+
      rows.slice(maxVisible).map(evidence).join('')+'</details>':'')+
    '</section>';
}

function card({id,title,summary,severity='medium',alerts=[],usage=null},locale,result={},currentPcba='',model={}){
  const high=severity==='high',boardAlert=id.startsWith('pcba-')||id.startsWith('mainboard-');
  const tone=high?'var(--danger,#d92d20)':'var(--warning,#b54708)';
  const background=high?'var(--danger-soft,#fef3f2)':'var(--warning-soft,#fffaeb)';
  const badge=high?t(locale,'ALTA PRIORIDADE','HIGH PRIORITY'):t(locale,'PRIORIDADE MÉDIA','MEDIUM PRIORITY');
  const usageLine=usage?.proven?'<span>'+esc(t(locale,'Uso da PCBA','PCBA use'))+': <b>'+
    esc(usage.use_index?String(usage.use_index)+'º':fmt(usage.known_uses))+'</b>'+
    (usage.previous_uses!==null?' · '+esc(t(locale,'reusos anteriores','previous reuses'))+': '+esc(fmt(usage.previous_uses)):'')+'</span>':'';
  const boardRows=boardAlert?sameBoardHistory(alerts,model,currentPcba):[];
  const analysisKinds=boardAlert
    ? [...new Set(boardRows.map(entry=>text(entry.failure.defect_type).replace(/_/g,' ')).filter(Boolean))].join(' → ')
    : [...new Set(alerts.flatMap(a=>evidenceList(a).map(p=>
      [p.failure?.defect_type,p.current_failure?.defect_type].filter(Boolean).join(' → '))).filter(Boolean))].join(' · ');
  const countLine=boardRows.length?'<small class="ames-sn-alert-history-count">'+
    esc(boardRows.length+' '+t(locale,'registros distintos na 2114','distinct 2114 records'))+'</small>':'';
  const proof=boardAlert?uniqueBoardProof(alerts,model,locale,currentPcba):
    alerts.map(alert=>compactEvidence(alert,locale,result,currentPcba)).join('');
  const header='<div class="ames-sn-alert-header"><span aria-hidden="true" class="ames-sn-alert-symbol">⚠</span>'+
    '<div class="ames-sn-alert-intro"><b class="ames-sn-alert-title">'+esc(title)+'</b><p>'+esc(summary)+'</p>'+
    usageLine+countLine+(analysisKinds?'<small>'+esc(analysisKinds)+'</small>':'')+'</div>'+
    '<span class="ames-sn-alert-priority" style="color:'+tone+'">'+esc(badge)+'</span></div>';
  return '<article class="ames-sn-smart-alert" data-smart-alert="'+esc(id)+'" style="border:1px solid color-mix(in srgb,'+
    tone+' 35%,transparent);border-left:6px solid '+tone+';background:'+background+';border-radius:10px;padding:13px 14px">'+
    header+(boardAlert?productionSnapshot(model,result,locale,currentPcba):'')+
    shortTechnicianEvidence(alerts,locale,result,currentPcba)+
    '<details style="margin-top:8px"><summary>'+esc(t(locale,'Ver evidências ('+alerts.length+')','View evidence ('+alerts.length+')'))+
    '</summary><div class="ames-sn-alert-proof-body">'+proof+'</div>'+
    '<small class="ames-sn-alert-final-warning">'+esc(t(locale,
    'Correlação técnica — não confirma causa raiz.','Technical correlation — does not confirm root cause.'))+
    '</small></details></article>';
}

export function buildSmartSnAlerts(model={},result={}){
  const alerts=distinctAlerts(model.alerts||[]),usage=pcbaUsageEvidence(model,result),out=[];
  // 2114 Hist Seq can distinguish records with the same timestamp but cannot
  // prove which 3012 repair row belongs to which AT cycle. Display every
  // PCBA+Defect Code row (including its full comment), without inventing links.
  const board=text(model.current_pcba),code=text(model.current?.defect_code);
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
  const sameFailure=byKind('PCBA_SAME_FAILURE'),sameFamily=byKind('PCBA_SAME_FAMILY');
  if(sameFailure.length){
    const second=pcbaSecondUse(usage);
    out.push({id:'pcba-same-failure',severity:'high',title:second?'PCBA 2º+ uso com mesma falha':'Mesma falha já ocorreu nesta PCBA',summary:second?'A própria placa possui evidência de reutilização e a mesma falha aparece no histórico anterior.':'A mesma falha atual aparece em ocorrência anterior comprovada desta PCBA.',alerts:sameFailure,usage:usage.proven?usage:null});
  }
  if(sameFamily.length)out.push({id:'pcba-same-family',severity:'medium',title:pcbaSecondUse(usage)?'PCBA 2º+ uso com mesma família de falha':'Mesma família de falha já ocorreu nesta PCBA',summary:'Existe ocorrência anterior comprovada da mesma família técnica nesta PCBA.',alerts:sameFamily,usage:usage.proven?usage:null});

  const componentSame=byKind('COMPONENT_SAME_FAILURE'),componentFamily=byKind('COMPONENT_SAME_FAMILY');
  if(componentSame.length){
    const count=new Set(componentSame.map(itemIdentity)).size;
    out.push({id:'component-same-failure',severity:'high',title:`${count} componente${count===1?'':'s'} reutilizado${count===1?'':'s'} com mesma falha`,summary:'O componente estava anteriormente vinculado a outra PCBA com a mesma falha e o vínculo temporal foi comprovado.',alerts:componentSame});
  }
  if(componentFamily.length){
    const count=new Set(componentFamily.map(itemIdentity)).size;
    out.push({id:'component-same-family',severity:'medium',title:`${count} componente${count===1?'':'s'} reutilizado${count===1?'':'s'} com mesma família`,summary:'Há componente reutilizado vindo de PCBA com falha da mesma família técnica.',alerts:componentFamily});
  }
  const compatible=byKind('COMPONENT_TYPE_COMPATIBLE');
  if(compatible.length){
    const count=new Set(compatible.map(itemIdentity)).size;
    out.push({id:'component-compatible-failure',severity:'medium',
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
  if(distinct.size>=3&&!sameFailure.length&&!sameFamily.length)
    out.push({id:'pcba-diverse-history',severity:'medium',title:`${distinct.size} falhas anteriores diferentes nesta PCBA`,
      summary:'Histórico múltiplo na 2114: requer revisão, mesmo sem recorrência igual ou similar. Não prova defeito da placa.',
      alerts:[{kind:'PCBA_DIVERSE_FAILURE_HISTORY',pcba_sn:model.current_pcba,
        evidence:[...distinct.values()].map(f=>({failure:f,order_basis:'history_only'}))}]});
  const boardHistory=byKind('PCBA_MAINBOARD_REPAIR_HISTORY');
  if(boardHistory.length)out.push({id:'mainboard-history',severity:'medium',title:'Histórico de MainBoard repair',summary:'Existe reparo MainBoard anterior comprovado na própria PCBA.',alerts:boardHistory});
  return out;
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
  title=title.replace(/^(\d+) componentes? reutilizados? com mesma falha$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} with the same failure`)
    .replace(/^(\d+) componentes? reutilizados? com mesma família$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} with the same family`);
  title=title.replace(/^(\d+) componentes? reutilizados? compatíve(?:l|is) com a falha$/,(_,n)=>`${n} reused component${n==='1'?'':'s'} compatible with the failure`);
  const summaries={
    'A própria placa possui evidência de reutilização e a mesma falha aparece no histórico anterior.':'The board itself has reuse evidence and the same failure appears in its prior history.',
    'A mesma falha atual aparece em ocorrência anterior comprovada desta PCBA.':'The current failure appears in a proven prior occurrence of this PCBA.',
    'Existe ocorrência anterior comprovada da mesma família técnica nesta PCBA.':'A proven prior occurrence from the same technical family exists on this PCBA.',
    'O componente estava anteriormente vinculado a outra PCBA com a mesma falha e o vínculo temporal foi comprovado.':'The component was previously bound to another PCBA with the same failure and the temporal binding was proven.',
    'Há componente reutilizado vindo de PCBA com falha da mesma família técnica.':'A reused component came from a PCBA with a failure in the same technical family.',
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
  if(!alerts.length)return `<section class="ames-sn-smart-alerts" data-sn-smart-alerts data-has-smart-alerts="false"><h3>${esc(t(locale,'Alertas inteligentes da consulta','Smart lookup alerts'))}</h3><p>${esc(t(locale,'Nenhum alerta técnico comprovado com as evidências atuais. Isso não prova ausência de histórico.','No technical alert is proven from current evidence. This does not prove absence of history.'))}</p></section>`;
  const high=alerts.filter(alert=>alert.severity==='high').length;
  return `<section class="ames-sn-smart-alerts" data-sn-smart-alerts data-has-smart-alerts="true" style="display:grid;gap:8px"><div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Alertas inteligentes da Consulta por SN','Smart Query-by-SN alerts'))}</h3><p>${esc(t(locale,'Prioriza relações de reuso, recorrência e reparo que merecem investigação. Cada alerta abre a evidência que o sustenta.','Prioritizes reuse, recurrence and repair relationships that deserve investigation. Each alert opens its supporting evidence.'))}</p></div><span class="status warn">${esc(`${alerts.length}${high?` · ${high} ${t(locale,'alta','high')}`:''}`)}</span></div>${alerts.map(alert=>card(alert,locale,result,model.current_pcba,model)).join('')}</section>`;
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
