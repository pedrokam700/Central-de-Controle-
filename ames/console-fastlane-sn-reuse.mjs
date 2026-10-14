import {createAdvancedTable} from './advanced-table.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {componentLabel} from './data/reuse-analysis.mjs';

// PR26 3012 enrichment uses the shared configurable table. The canonical SN
// view already renders 2114/3074/3022; this decorator reorganizes that evidence
// into the operator-first hierarchy validated in the standalone automation.
export const REPAIR_COLUMNS=[['pcba_sn','PCBA'],['line','Linha'],['product_model','Modelo'],['product_id','Product ID'],['sample_batch_id','Batch ID'],['defect_oper','Operation / Station'],['defect_code','Defect Code'],['defect_desc','Defect Description'],['defect_time','Defect Time'],['defect_user','Defect User'],['repair_user','Repair User'],['repair_time','Repair Time'],['repair_code','Repair Code'],['repair_comment','Repair Comment'],['defect_reason_type','Reason Type'],['defect_reason_desc','Reason Description']].map(([key,label])=>({key,label,en:label}));

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&String(item).trim()!=='');
const relationLabel=value=>({MESMA_FALHA:'Mesma falha',FALHA_SIMILAR:'Mesma família / similar',FALHA_DIFERENTE:'Outra falha',SEM_HISTORICO:'Sem histórico',SEM_FALHA_ATUAL:'Sem falha atual'})[value]||fmt(value);

function emptyCard(title,text){return `<section class="ames-sn-digest-card"><h3>${esc(title)}</h3><p>${esc(text)}</p></section>`;}

function operatorSummary(result,rows){
  const trace2114=result.trace_2114,trace3074=result.trace_3074,trace3022=result.trace_3022;
  const has2114=!!trace2114&&Array.isArray(trace2114.previous_failures),has3074=!!trace3074&&Array.isArray(trace3074.reused_components);
  const current=has2114?trace2114.current_failure||null:null,previous=has2114?trace2114.previous_failures:[],reused=has3074?trace3074.reused_components:[];
  const contexts=result.local_snapshot?.process_contexts||[],passages=Array.isArray(trace3022?.process_passages)?trace3022.process_passages:[];
  const processCount=trace3022?(Number.isFinite(result.summary?.['3022_events'])?result.summary['3022_events']:passages.length):'—';
  const previousPcba=new Set(reused.flatMap(item=>item.previous_pcbas||[]).filter(Boolean));
  const sameFailure=reused.filter(item=>item.relation_to_current_failure==='MESMA_FALHA').length;
  const currentDesc=current?value(current,'Defect Description','defect_desc')||t('Descrição não informada','Description not provided'):'';
  const currentTime=current?value(current,'Defect Time','defect_time'):'';
  const currentMode=current?value(current,'Manual/Automatic','manual_or_auto'):'';
  const materialPreview=reused.slice(0,4).map(item=>{const raw=String(value(item,'item_type')||t('Material','Material')),label=componentLabel(raw,document.documentElement.lang)||raw,detail=raw!==label?`${raw} · ${relationLabel(item.relation_to_current_failure)}`:relationLabel(item.relation_to_current_failure);return `<li><b>${esc(label)}</b><span>${esc(value(item,'item_sn')||'—')}</span><small>${esc(detail)}</small></li>`;}).join('');
  const context=contexts[0]||passages[0]||{};
  const station=value(context,'reference_station_code','operation_code','station')||'—';
  const eventTime=value(context,'reference_event_time','event_time','production_event_time')||'—';
  const productionShift=value(context,'production_shift')||'—';
  return `<div class="ames-sn-hero"><div><span>${t('SN consultada','Queried SN')}</span><strong>${esc(result.sn||'—')}</strong><small>${esc([result.detected_type,result.line,result.product_model].filter(Boolean).join(' · ')||'—')}</small></div><span class="status ok">${esc(result.detected_type||'SN')}</span></div>
    <div class="ames-sn-kpi-row">
      <div><small>${t('Falha atual','Current failure')}</small><b>${has2114?(current?'1':'0'):'—'}</b></div>
      <div><small>${t('Falhas antigas PCBA','Previous PCBA failures')}</small><b>${has2114?previous.length:'—'}</b></div>
      <div><small>${t('Materiais 2º+ uso','2nd+ use materials')}</small><b>${has3074?reused.length:'—'}</b></div>
      <div><small>${t('PCBAs anteriores','Previous PCBAs')}</small><b>${has3074?previousPcba.size:'—'}</b></div>
      <div><small>${t('Material · mesma falha','Material · same failure')}</small><b>${has3074?sameFailure:'—'}</b></div>
      <div><small>${t('Histórias 2114','2114 histories')}</small><b>${has2114?(previous.length+(current?1:0)):'—'}</b></div>
      <div><small>${t('Eventos 3022','3022 events')}</small><b>${esc(processCount)}</b></div>
      <div><small>${t('Reparos 3012','3012 repairs')}</small><b>${rows.length}</b></div>
    </div>
    <div class="ames-sn-digest-grid">
      ${current?`<section class="ames-sn-digest-card ames-sn-digest-primary"><h3>${t('Falha da PCBA','PCBA failure')}</h3><strong>${esc(currentDesc)}</strong><dl><dt>Defect Time</dt><dd>${esc(fmt(currentTime))}</dd><dt>Manual / Automatic</dt><dd>${esc(fmt(currentMode))}</dd><dt>${t('Falhas anteriores','Previous failures')}</dt><dd>${previous.length}</dd></dl></section>`:emptyCard(t('Falha da PCBA','PCBA failure'),has2114?t('A 2114 foi consultada e não confirmou falha atual.','2114 was queried and did not confirm a current failure.'):t('2114 ainda não forneceu evidência nesta consulta.','2114 has not provided evidence in this query yet.'))}
      <section class="ames-sn-digest-card"><h3>${t('Materiais reutilizados','Reused materials')}</h3>${has3074&&reused.length?`<ul>${materialPreview}</ul>${reused.length>4?`<p>+ ${reused.length-4} ${t('material(is) no detalhe','more material(s) in details')}</p>`:''}`:`<p>${has3074?t('Nenhum Material SN em 2º+ uso foi confirmado.','No 2nd+ use Material SN was confirmed.'):t('3074 ainda não forneceu evidência nesta consulta.','3074 has not provided evidence in this query yet.')}</p>`}</section>
      <section class="ames-sn-digest-card"><h3>${t('Processo 3022','3022 process')}</h3><dl><dt>${t('Posto relevante','Relevant station')}</dt><dd>${esc(fmt(station))}</dd><dt>${t('Horário real','Actual time')}</dt><dd>${esc(fmt(eventTime))}</dd><dt>${t('Turno de produção','Production shift')}</dt><dd>${esc(fmt(productionShift))}</dd></dl></section>
      <section class="ames-sn-digest-card ames-sn-how-read"><h3>${t('Como ler','How to read')}</h3><p>${t('Falha da própria PCBA e reuso de componentes são evidências diferentes. “Mesma falha” é correlação histórica, não prova automática de causa. Ausência de fonte aparece como —, não como zero.','The PCBA failure and component reuse are different evidence. “Same failure” is historical correlation, not automatic proof of cause. Missing source data is shown as —, not zero.')}</p><small>${t('Shift 2114','2114 shift')}: ${esc(fmt(result.shift_2114))}</small></section>
    </div>`;
}

function activateTab(shell,id){
  for(const button of shell.querySelectorAll('[data-sn-tab]')){const active=button.dataset.snTab===id;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));}
  for(const panel of shell.querySelectorAll('[data-sn-tab-panel]'))panel.hidden=panel.dataset.snTabPanel!==id;
}

function organizeResult(root,result,repairSection,rows){
  const host=root.querySelector('[data-sn-result]');if(!host||host.querySelector('[data-sn-operator-shell]'))return;
  const summary=host.querySelector('.ames-sn-summary');
  const investigation=host.querySelector('.ames-investigation-grid');
  const currentFailure=investigation?.children?.[0]||null,previousFailures=investigation?.children?.[1]||null;
  const process=host.querySelector('.ames-process-evidence');
  const directPanels=[...host.children].filter(node=>node.matches?.('.mes-context-panel'));
  const materials=directPanels.find(node=>node!==process&&node!==repairSection&&!node.querySelector('h3')?.textContent?.includes('Operador'))||null;
  const operator=directPanels.find(node=>node!==process&&node!==materials&&node!==repairSection&&node.querySelector('h3')?.textContent?.includes('Operador'))||null;
  const warnings=[...host.children].filter(node=>node.matches?.('.notice'));
  const shell=document.createElement('section');shell.dataset.snOperatorShell='1';shell.className='ames-sn-operator-shell';shell.setAttribute('data-no-i18n','');
  shell.innerHTML=`${operatorSummary(result,rows)}<nav class="ames-sn-tabs" role="tablist" aria-label="${t('Detalhes da consulta por SN','SN query details')}">
    <button type="button" class="active" role="tab" aria-selected="true" data-sn-tab="summary">${t('Resumo','Summary')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="failure">${t('Falha da PCBA','PCBA failure')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="materials">${t('Materiais 2º+ uso','2nd+ materials')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="history">${t('Histórico 2114','2114 history')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="process">${t('Processo 3022','3022 process')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="repair">${t('Reparo 3012','3012 repair')}</button>
    <button type="button" role="tab" aria-selected="false" data-sn-tab="technical">${t('Técnico','Technical')}</button>
  </nav>`;
  const summaryPanel=document.createElement('div');summaryPanel.dataset.snTabPanel='summary';summaryPanel.className='ames-sn-tab-panel ames-sn-summary-panel';summaryPanel.innerHTML=operatorSummary(result,rows).split('<div class="ames-sn-digest-grid">')[1]?.replace(/<\/div>\s*$/,'')||'';
  // operatorSummary is used above for hero/KPIs; keep only the digest cards in the default tab.
  summaryPanel.innerHTML=`<div class="ames-sn-digest-grid">${summaryPanel.innerHTML}</div>`;
  const failurePanel=document.createElement('div');failurePanel.dataset.snTabPanel='failure';failurePanel.className='ames-sn-tab-panel';if(currentFailure)failurePanel.append(currentFailure);else failurePanel.innerHTML=emptyCard(t('Falha da PCBA','PCBA failure'),t('Sem evidência 2114 disponível.','No 2114 evidence available.'));
  const materialsPanel=document.createElement('div');materialsPanel.dataset.snTabPanel='materials';materialsPanel.className='ames-sn-tab-panel';if(materials)materialsPanel.append(materials);else materialsPanel.innerHTML=emptyCard(t('Materiais 2º+ uso','2nd+ materials'),t('Sem evidência 3074 disponível.','No 3074 evidence available.'));
  const historyPanel=document.createElement('div');historyPanel.dataset.snTabPanel='history';historyPanel.className='ames-sn-tab-panel';if(previousFailures)historyPanel.append(previousFailures);else historyPanel.innerHTML=emptyCard(t('Histórico 2114','2114 history'),t('Sem histórico disponível.','No history available.'));
  const processPanel=document.createElement('div');processPanel.dataset.snTabPanel='process';processPanel.className='ames-sn-tab-panel';if(process)processPanel.append(process);if(operator)processPanel.append(operator);if(!process&&!operator)processPanel.innerHTML=emptyCard(t('Processo 3022','3022 process'),t('Sem evidência 3022 disponível.','No 3022 evidence available.'));
  const repairPanel=document.createElement('div');repairPanel.dataset.snTabPanel='repair';repairPanel.className='ames-sn-tab-panel';if(repairSection)repairPanel.append(repairSection);
  const technicalPanel=document.createElement('div');technicalPanel.dataset.snTabPanel='technical';technicalPanel.className='ames-sn-tab-panel ames-sn-technical';if(summary)technicalPanel.append(summary);for(const warning of warnings)technicalPanel.append(warning);if(!summary&&!warnings.length)technicalPanel.innerHTML=emptyCard(t('Detalhes técnicos','Technical details'),t('Nenhum detalhe técnico adicional nesta leitura.','No additional technical detail in this read.'));
  for(const panel of [summaryPanel,failurePanel,materialsPanel,historyPanel,processPanel,repairPanel,technicalPanel]){panel.hidden=panel.dataset.snTabPanel!=='summary';shell.append(panel);}
  shell.addEventListener('click',event=>{const button=event.target.closest('[data-sn-tab]');if(button)activateTab(shell,button.dataset.snTab);});
  host.replaceChildren(shell);
}

export function withFastlaneSnEnhancements(base,root,store){
 let last='',table=null;
 return {render(){base.render();const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;
  if(!result)return;
  const rows=result.trace_3012?.rows||[],key=JSON.stringify([rows,result.summary,result.trace_2114?.status,result.trace_3074?.status,result.trace_3022?.status,result.sn,result.line,result.product_model]);
  if(key===last&&root.querySelector('[data-sn-operator-shell]'))return;last=key;
  table?.clear?.();root.querySelector('[data-fastlane-sn]')?.remove();
  const section=document.createElement('section');section.dataset.fastlaneSn='1';section.className='mes-context-panel ames-sn-repair-panel';
  const en=document.documentElement.lang.startsWith('en');section.setAttribute('data-no-i18n','');
  section.innerHTML=`<div class="section-head"><div><h3>3012 · ${en?'Repair and analysis':'Reparo e análise'}</h3><p>${esc(en?'Complementary source. Rows retain their own PCBA, defect and repair timestamps; differences from 2114 remain visible.':'Fonte complementar. Registros mantêm PCBA e horários próprios de falha/reparo; divergências com 2114 permanecem visíveis.')}</p></div></div><div data-sn-repair-table></div>`;
  root.querySelector('[data-sn-result]')?.append(section);
  table=createAdvancedTable(section.querySelector('[data-sn-repair-table]'),{rows,columns:REPAIR_COLUMNS,key:'sn-repair',presets:[{id:'repair',label:'Reparo 3012',en:'3012 repair',columns:['pcba_sn','defect_code','defect_desc','defect_time','repair_user','repair_time','repair_code','repair_comment']}]});
  organizeResult(root,result,section,rows);
 },clear(){table?.clear();base.clear?.();last='';}};
}
