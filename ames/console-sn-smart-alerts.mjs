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

function compactEvidence(alert,locale){
  const proofs=evidenceList(alert);
  const rows=[];
  for(const proof of proofs){
    const failure=proof.failure||{};
    const binding=proof.binding||null;
    const ret=proof.return||null;
    if(failure.pcba_sn||failure.defect_code||failure.defect_time)rows.push(`<div class="ames-sn-smart-proof"><small>${esc(t(locale,'Falha histórica','Historical failure'))}</small><b>${esc([failure.pcba_sn,failure.defect_code,failure.defect_desc].filter(Boolean).join(' · ')||'—')}</b><span>${esc(failure.defect_time?time(failure.defect_time):'—')}</span></div>`);
    if(proof.comparison)rows.push(`<p>${esc(explainFailureComparison(proof.comparison,locale))} · ${esc(t(locale,'Regra','Rule'))} ${esc(proof.comparison.version)}</p>`);
    if(binding)rows.push(`<div class="ames-sn-smart-proof"><small>3074 · ${esc(t(locale,'Vínculo comprovado','Proven binding'))}</small><b>${esc(fmt(binding.item_sn))}</b><span>${esc(fmt(binding.previous_pcba))} → ${esc(fmt(binding.current_pcba))}</span></div>`);
    for(const repair of proof.repairs||[])rows.push(`<div class="ames-sn-smart-proof"><small>3012 · ${esc(t(locale,'Reparo','Repair'))}</small><b>${esc([repair.repair_code,repair.repair_user].filter(Boolean).join(' · ')||'—')}</b><span>${esc(repair.repair_time?time(repair.repair_time):'—')}${repair.repair_comment?` · ${esc(repair.repair_comment)}`:''}</span></div>`);
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
  return {...alert,title,summary:summaries[alert.summary]||alert.summary};
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
