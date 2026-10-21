import {explainFailureComparison} from './data/failure-taxonomy.mjs';
import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {pcbaUsageEvidence} from './console-sn-history-detail.mjs';

const text=value=>String(value??'').trim();
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||text(value)===''?'—':String(value);
const evidenceList=alert=>(Array.isArray(alert?.evidence)?alert.evidence:[alert?.evidence]).filter(Boolean);
const itemIdentity=alert=>`${text(alert?.item_type)}|${text(alert?.item_sn)}`;

function distinctAlerts(alerts=[]){
  const seen=new Set();
  return alerts.filter(alert=>{
    const key=[alert.kind,itemIdentity(alert),text(alert.pcba_sn),text(alert.prior_defect_code),text(alert.prior_defect_time)].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  });
}

function pcbaSecondUse(usage={}){
  return Number(usage.use_index)>=2||Number(usage.known_uses)>=2||Number(usage.previous_uses)>=1;
}

function proof2114(label,f,locale){
 if(!f||!f.pcba_sn)return '';
 const parts=[f.defect_code,f.defect_desc].filter(Boolean).join(' · ');
 const meta=[f.hist_seq==null?'':`Hist Seq ${f.hist_seq}`,f.defect_time?time(f.defect_time):t(locale,'Horário não comprovado','Time unproven')].filter(Boolean).join(' · ');
 const states=[f.repair_status==null?'':t(locale,'Vínculo 2114','2114 link')+': '+f.repair_status,
   f.defect_type==null?'':'Defect Type: '+f.defect_type].filter(Boolean).join(' · ');
 return `<div class="ames-sn-smart-proof"><small>${esc(label)} · 2114</small>
   <b>${esc(parts||'—')}</b><span>${esc(f.pcba_sn)} · ${esc(meta)}</span>
   ${states?`<small>${esc(states)} · ${esc(t(locale,'não identifica reparo executado','does not establish a performed repair'))}</small>`:''}
 </div>`;
}
function proof3012(repair,locale,label){
 const author=[repair.repair_user_name,repair.repair_user].filter(Boolean).join(' · ');
 return `<div class="ames-sn-smart-proof"><small>${esc(label)}</small>
 <b>${esc([author,repair.repair_code].filter(Boolean).join(' · ')||t(locale,'AT não identificado','Technician not identified'))}</b>
 <span>${esc(repair.repair_time?time(repair.repair_time):'—')}${repair.repair_comment?` · ${esc(repair.repair_comment)}`:''}</span>
 </div>`;
}
function compactEvidence(alert,locale){
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
    if(proof.order_basis==='hist_seq_same_clock'||proof.order_basis==='hist_seq_only'){
      rows.push(`<p class="notice warn">${esc(t(locale,
       'A sequência Defect Hist Seq distingue os dois registros 2114; os horários não individualizam a intervenção do AT.',
       'Defect Hist Seq distinguishes the 2114 records; timestamps do not identify which technician performed an intervention.'))}</p>`);
    }
    if(proof.comparison)rows.push(`<p>${esc(explainFailureComparison(proof.comparison,locale))} · ${esc(t(locale,'Regra','Rule'))} ${esc(proof.comparison.version)}</p>`);
    if(binding)rows.push(`<div class="ames-sn-smart-proof"><small>3074 · ${esc(t(locale,'Vínculo comprovado','Proven binding'))}</small><b>${esc(fmt(binding.item_sn))}</b><span>${esc(fmt(binding.previous_pcba))} → ${esc(fmt(binding.current_pcba))}</span></div>`);
    for(const repair of proof.repairs||[])rows.push(proof3012(repair,locale,t(locale,'3012 · análise anterior associada; execução não certificada','3012 · associated prior analysis; execution unverified')));
    for(const repair of proof.current_3012||[])rows.push(proof3012(repair,locale,t(locale,'3012 · análise atual candidata','3012 · candidate current analysis')));
    for(const repair of proof.ambiguous_3012||[])rows.push(proof3012(repair,locale,t(locale,'3012 · autoria por ocorrência indeterminada','3012 · assignment to occurrence unproven')));
    if(alert.kind?.startsWith('PCBA_')&&!(proof.current_3012||[]).length&&!(proof.ambiguous_3012||[]).length)
      rows.push(`<p class="mes-context">${esc(t(locale,'Análise atual do AT não comprovada nesta consulta 3012; isso não indica que não foi realizada.','Current technician analysis not proven by this 3012 query; this does not mean it never occurred.'))}</p>`);
    if(ret)rows.push(`<div class="ames-sn-smart-proof"><small>3022 · ${esc(t(locale,'Retorno comprovado','Proven return'))}</small><b>${esc([ret.station,ret.operation].filter(Boolean).join(' · ')||'—')}</b><span>${esc(ret.time?time(ret.time):'—')}</span></div>`);
  }
  if(alert.technician_comment&&!rows.some(row=>row.includes(esc(alert.technician_comment))))rows.push(`<div class="ames-sn-smart-proof"><small>Repair Comment</small><b>${esc(alert.technician_comment)}</b></div>`);
  const sources=[...new Set((alert.sources||[]).filter(Boolean))];
  if(sources.length)rows.push(`<div class="ames-sn-smart-proof"><small>${esc(t(locale,'Fontes','Sources'))}</small><b>${esc(sources.join(' + '))}</b></div>`);
  return rows.join('')||`<div class="ames-sn-forensic-empty">${esc(t(locale,'A correlação existe, mas a evidência detalhada não foi projetada nesta resposta.','The correlation exists, but detailed evidence was not projected in this response.'))}</div>`;
}

function card({id,title,summary,severity='medium',alerts=[],usage=null},locale){
  const high=severity==='high';
  const tone=high?'var(--danger,#d92d20)':'var(--warning,#b54708)';
  const background=high?'var(--danger-soft,#fef3f2)':'var(--warning-soft,#fffaeb)';
  const badge=high?t(locale,'ALTA PRIORIDADE','HIGH PRIORITY'):t(locale,'REVISAR','REVIEW');
  const usageLine=usage?.proven?`<span>${esc(t(locale,'Uso da PCBA','PCBA use'))}: <b>${esc(usage.use_index?`${usage.use_index}º`:fmt(usage.known_uses))}</b>${usage.previous_uses!==null?` · ${esc(t(locale,'reusos anteriores','previous reuses'))}: ${esc(fmt(usage.previous_uses))}`:''}</span>`:'';
  return `<article class="ames-sn-smart-alert" data-smart-alert="${esc(id)}" style="border:1px solid color-mix(in srgb,${tone} 35%,transparent);border-left:6px solid ${tone};background:${background};border-radius:10px;padding:11px 12px"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap"><span aria-hidden="true" style="font-size:18px">⚠</span><div style="min-width:0;flex:1"><b style="display:block">${esc(title)}</b><p style="margin:4px 0 0">${esc(summary)}</p>${usageLine}</div><span style="font-size:10px;font-weight:800;color:${tone}">${esc(badge)}</span></div><details style="margin-top:8px"><summary style="cursor:pointer;font-weight:750">${esc(t(locale,`Ver evidências (${alerts.length})`,`View evidence (${alerts.length})`))}</summary><div style="display:grid;gap:7px;margin-top:8px">${alerts.map(alert=>compactEvidence(alert,locale)).join('')}</div><small style="display:block;margin-top:8px;font-weight:700">${esc(t(locale,'Correlação técnica — não confirma causa raiz.','Technical correlation — does not confirm root cause.'))}</small></details></article>`;
}

export function buildSmartSnAlerts(model={},result={}){
  const alerts=distinctAlerts(model.alerts||[]),usage=pcbaUsageEvidence(model,result),out=[];
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
  const summaries={
    'A própria placa possui evidência de reutilização e a mesma falha aparece no histórico anterior.':'The board itself has reuse evidence and the same failure appears in its prior history.',
    'A mesma falha atual aparece em ocorrência anterior comprovada desta PCBA.':'The current failure appears in a proven prior occurrence of this PCBA.',
    'Existe ocorrência anterior comprovada da mesma família técnica nesta PCBA.':'A proven prior occurrence from the same technical family exists on this PCBA.',
    'O componente estava anteriormente vinculado a outra PCBA com a mesma falha e o vínculo temporal foi comprovado.':'The component was previously bound to another PCBA with the same failure and the temporal binding was proven.',
    'Há componente reutilizado vindo de PCBA com falha da mesma família técnica.':'A reused component came from a PCBA with a failure in the same technical family.',
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
  return `<section class="ames-sn-smart-alerts" data-sn-smart-alerts data-has-smart-alerts="true" style="display:grid;gap:8px"><div class="ames-sn-history-detail-head"><div><h3>${esc(t(locale,'Alertas inteligentes da Consulta por SN','Smart Query-by-SN alerts'))}</h3><p>${esc(t(locale,'Prioriza relações de reuso, recorrência e reparo que merecem investigação. Cada alerta abre a evidência que o sustenta.','Prioritizes reuse, recurrence and repair relationships that deserve investigation. Each alert opens its supporting evidence.'))}</p></div><span class="status warn">${esc(`${alerts.length}${high?` · ${high} ${t(locale,'alta','high')}`:''}`)}</span></div>${alerts.map(alert=>card(alert,locale)).join('')}</section>`;
}

export function decorateSmartSnAlerts(root,model={},result={}){
  root.querySelector('[data-sn-smart-alerts]')?.remove();
  const host=root.querySelector('[data-sn-tab-panel="story"]')||root.querySelector('.ames-sn-forensic-panel')||root.querySelector('[data-sn-result]');
  if(!host)return;
  const section=host.ownerDocument.createElement('div');section.setAttribute('data-no-i18n','');
  section.innerHTML=renderSmartSnAlerts(model,result,host.ownerDocument.documentElement?.lang||'pt-BR');
  const rendered=section.firstElementChild;if(rendered)host.prepend(rendered);
}
