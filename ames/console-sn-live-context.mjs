import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {buildLiveSnForensics} from './data/sn-forensics.mjs';
import {productionEvidenceForOccurrence,trustedProductionEvidence} from './data/production-evidence.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {decorateSnMaterialBindings} from './console-sn-material-bindings.mjs';
import {decorateSnRepairEvidence} from './console-sn-repair-evidence.mjs';
import {decorateSnHistoryDetail} from './console-sn-history-detail.mjs';

const lang=()=>globalThis.document?.documentElement?.lang||'pt-BR';
const t=(pt,en)=>lang().startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);

export function snLiveSummaryEvidence(result={}){
  const model=buildLiveSnForensics(result),trace2114=result.trace_2114||null;
  const current=model.current||null,previous=Array.isArray(model.own_history)?model.own_history:[];
  const has2114=Boolean(current||previous.length||(trace2114&&Array.isArray(trace2114.previous_failures)));
  const contexts=result.local_snapshot?.process_contexts||[];
  const production=current?productionEvidenceForOccurrence(current,contexts):trustedProductionEvidence({});
  return {model,current,previous,has2114,production};
}

function setKpi(root,labelRx,value,title=''){
  for(const row of root.querySelectorAll('.ames-sn-kpi-row')){
    const card=[...row.children].find(el=>labelRx.test(el.querySelector('small')?.textContent?.trim()||''));
    const target=card?.querySelector('b');if(!target)continue;target.textContent=String(value);if(title)target.title=title;
  }
}
function failureCards(root){return [...root.querySelectorAll('.ames-sn-digest-card')].filter(card=>/^(Falha da PCBA|PCBA failure)$/i.test(card.querySelector('h3')?.textContent?.trim()||''));}
function processCards(root){return [...root.querySelectorAll('.ames-sn-digest-card')].filter(card=>/^(Processo 3022|3022 process)$/i.test(card.querySelector('h3')?.textContent?.trim()||''));}
function patchFailureCards(root,current,previousCount){
  if(!current)return;
  const description=current.defect_desc||t('Descrição não informada','Description not provided');
  for(const card of failureCards(root)){
    card.classList.add('ames-sn-digest-primary');
    card.innerHTML=`<h3>${t('Falha da PCBA','PCBA failure')}</h3><strong>${esc(description)}</strong><dl><dt>${t('Registro da falha (MES)','Failure record (MES)')}</dt><dd>${esc(time(current.defect_time))}</dd><dt>Manual / Automatic</dt><dd>${esc(fmt(current.manual_or_auto))}</dd><dt>${t('Falhas anteriores','Previous failures')}</dt><dd>${previousCount}</dd></dl>`;
  }
}
function patchProcessCards(root,production){
  const station=production.trusted?production.station:'—';
  const eventTime=production.trusted?time(production.event_time):'—';
  const shift=production.trusted?production.shift:'—';
  for(const card of processCards(root)){
    card.innerHTML=`<h3>${t('Processo 3022','3022 process')}</h3><dl><dt>${t('Posto de referência (3022)','Reference station (3022)')}</dt><dd>${esc(fmt(station))}</dd><dt>${t('Horário de geração (3022)','Generation time (3022)')}</dt><dd>${esc(fmt(eventTime))}</dd><dt>${t('Turno comprovado (3022)','Proven shift (3022)')}</dt><dd>${esc(fmt(shift))}</dd></dl>${production.trusted?'':`<small>${t('Sem referência 3022 comprovada para classificar geração/turno.','No proven 3022 reference to classify generation/shift.')}</small>`}`;
  }
}
function decorate(root,result){
  const evidence=snLiveSummaryEvidence(result);
  if(evidence.has2114){
    setKpi(root,/^(Falha atual|Current failure)$/i,evidence.current?1:0,'2114');
    setKpi(root,/^(Falhas antigas PCBA|Previous PCBA failures)$/i,evidence.previous.length,'2114');
    setKpi(root,/^(Histórias 2114|2114 histories)$/i,evidence.previous.length+(evidence.current?1:0),'2114');
  }
  patchFailureCards(root,evidence.current,evidence.previous.length);
  patchProcessCards(root,evidence.production);
  decorateSnRepairEvidence(root,evidence.model,result);
  decorateSnMaterialBindings(root,evidence.model);
  decorateSnHistoryDetail(root,evidence.model,result);
}

export function withSnLiveContext(base,root,store){
  return {
    render(){
      base.render();
      const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;
      if(result)decorate(root,result);
    },
    clear(){base.clear?.();}
  };
}
