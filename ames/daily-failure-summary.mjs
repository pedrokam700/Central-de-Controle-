import {defectLabel} from './defect-label.mjs';
import {LINE_IDS,productKey} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';
import {reuseLinks} from './data/reuse-analysis.mjs';
import {productionEvidenceForOccurrence} from './data/production-evidence.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(2)}%`;
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
const uniq=a=>[...new Set((a||[]).filter(v=>v!==null&&v!==undefined&&String(v)!==''))];
const pcbaOf=row=>row?.current_pcba_sn||row?.pcba_sn||row?.['PCBA atual']||row?.PCBA||null;
const day=v=>String(v||'').slice(0,10);
const periodOf=context=>context?.period&&typeof context.period==='object'?context.period:{from:null,to:null};
const rowProduct=row=>productKey(row?.product_model||row?.product_key||row?.product||'');
const processContexts=snapshot=>snapshot?.process_timeline?.contexts||snapshot?.process_contexts||[];
function trustedRows(snapshot){
  const contexts=processContexts(snapshot);
  return (snapshot?.occurrences||snapshot?.canonical?.datasets?.defects||[]).map(row=>{
    const production=productionEvidenceForOccurrence(row,contexts);
    return {...row,failure_record_date:day(row.defect_time)||null,production_event_time:production.event_time,production_shift:production.shift,production_operational_date:production.operational_date,production_evidence_proven:production.trusted};
  });
}

function baseScopedRows(rows,context){
  const period=periodOf(context),product=context?.product?productKey(context.product):null;
  return (rows||[]).filter(row=>{
    if(product&&rowProduct(row)!==product)return false;
    if(context?.defect&&String(row.defect_code||'')!==String(context.defect))return false;
    const date=row.failure_record_date||day(row.defect_time);
    if(period.from&&(!date||date<period.from))return false;
    if(period.to&&(!date||date>period.to))return false;
    return true;
  });
}

export function scopedDailyRows(rows,context={}){
  const base=baseScopedRows(rows,context);
  if(!context.shift)return base;
  if(!base.some(row=>row.production_evidence_proven&&row.production_shift))return base;
  return base.filter(row=>row.production_evidence_proven&&row.production_shift===context.shift);
}

function topFromRows(rows){
  const groups=new Map();
  for(const row of rows||[]){
    const code=String(row.defect_code||''),description=row.defect_desc||'';
    const key=JSON.stringify([code,description]);
    const item=groups.get(key)||{code,description,count:0};item.count+=1;groups.set(key,item);
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code)).slice(0,3);
}

export function createDailyFailureSummary(root,store){
  let line=store.preferredLine?.()||LINE_IDS[0],last='',contextBridgeBound=false,internalAnalyticsSync=false,shiftUnclassifiedCurrent=false;
  const pane=()=>root.closest?.('[data-console-pane="top3"]')||root.parentElement;
  function updatePeriod(field,value){const current=periodOf(store.context?.());store.updateContext?.({period:{...current,[field]:value||null}});}
  function bindContextBridge(){
    if(contextBridgeBound)return;const host=pane();if(!host)return;contextBridgeBound=true;
    const onContextInput=event=>{
      if(internalAnalyticsSync)return;
      const el=event.target?.closest?.('[data-top3-analytics] [data-dfa]');if(!el)return;
      const field=el.dataset.dfa,value=el.value;let handled=true;
      if(field==='line')store.updateContext?.({line_id:value||null});
      else if(field==='shift')store.updateContext?.({shift:value||null});
      else if(field==='product')store.updateContext?.({product:value||null});
      else if(field==='defect')store.updateContext?.({defect:value||null});
      else if(field==='from'||field==='to')updatePeriod(field,value);else handled=false;
      if(!handled)return;const shared=store.context?.().line_id;if(shared)line=shared;last='';queueMicrotask(render);
    };
    const blockUnknownShiftDrilldown=event=>{
      if(!shiftUnclassifiedCurrent)return;
      const control=event.target?.closest?.('[data-top3-analytics] [data-dfa-kpi="shift1"],[data-top3-analytics] [data-dfa-kpi="shift2"],[data-top3-analytics] [data-matrix-line][data-matrix-shift]');
      if(!control)return;event.preventDefault();event.stopImmediatePropagation();
    };
    host.addEventListener('change',onContextInput,true);host.addEventListener('input',onContextInput,true);host.addEventListener('click',blockUnknownShiftDrilldown,true);
  }
  function dispatchAnalytics(el,value){if(!el)return;el.value=String(value??'');if(String(el.value)!==String(value??'')&&value)return;internalAnalyticsSync=true;try{el.dispatchEvent(new Event('change',{bubbles:true}));}finally{internalAnalyticsSync=false;}}
  function polishAnalyticsShift(){
    const analytics=pane()?.querySelector?.('[data-top3-analytics]');if(!analytics)return;
    analytics.querySelector('[data-dfa-shift-unclassified]')?.remove();
    for(const control of analytics.querySelectorAll('[data-dfa-kpi="shift1"],[data-dfa-kpi="shift2"],[data-matrix-line][data-matrix-shift]')){control.disabled=false;control.removeAttribute('aria-disabled');control.removeAttribute('data-unknown-shift-control');control.removeAttribute('title');}
    for(const el of analytics.querySelectorAll('[data-dfa-kpi="shift1"] .stat-value,[data-dfa-kpi="shift2"] .stat-value'))el.removeAttribute('data-unknown-shift');
    if(!shiftUnclassifiedCurrent)return;
    const notice=document.createElement('div');notice.className='notice warn';notice.dataset.dfaShiftUnclassified='1';notice.innerHTML=`<b>${t('Turno não classificado pela 3022.','Shift not classified by 3022.')}</b><br>${t('O ranking mantém as falhas existentes e mostra — nos totais por turno.','The ranking keeps existing failures and shows — for shift totals.')}`;
    analytics.querySelector('.ames-dfa-main')?.prepend(notice);
    for(const control of analytics.querySelectorAll('[data-dfa-kpi="shift1"],[data-dfa-kpi="shift2"],[data-matrix-line][data-matrix-shift]')){control.disabled=true;control.setAttribute('aria-disabled','true');control.dataset.unknownShiftControl='1';control.title=t('3022 não classificou o turno neste escopo.','3022 did not classify the shift in this scope.');}
    for(const el of analytics.querySelectorAll('[data-dfa-kpi="shift1"] .stat-value,[data-dfa-kpi="shift2"] .stat-value')){el.textContent='—';el.dataset.unknownShift='1';}
    for(const meta of analytics.querySelectorAll('.ames-dfa-rank-meta')){for(const span of meta.querySelectorAll('span'))if(/1º turno|2º turno|1st shift|2nd shift/i.test(span.textContent||''))span.hidden=true;if(!meta.querySelector('[data-dfa-rank-unknown-shift]')){const span=document.createElement('span');span.dataset.dfaRankUnknownShift='1';span.innerHTML=`${t('Turno 3022','3022 shift')} <b>—</b> · ${t('não classificado','not classified')}`;meta.append(span);}}
  }
  function syncContextToAnalytics(){
    const host=pane(),context=store.context?.()||{},period=periodOf(context),targets={line:context.line_id||line,shift:context.shift||'',product:context.product||'',defect:context.defect||'',from:period.from||'',to:period.to||''};
    for(const [field,value] of Object.entries(targets)){let el=host?.querySelector?.(`[data-top3-analytics] [data-dfa="${field}"]`);if(!el)continue;if(field==='shift'&&shiftUnclassifiedCurrent&&value){dispatchAnalytics(el,'');el=host?.querySelector?.('[data-top3-analytics] [data-dfa="shift"]');if(el)el.value=String(value);continue;}if(String(el.value)!==String(value))dispatchAnalytics(el,value);}
    queueMicrotask(polishAnalyticsShift);
  }
  function openAnalyticsFailure(code){store.updateContext?.({defect:code||null});last='';syncContextToAnalytics();queueMicrotask(()=>{const host=pane(),select=host?.querySelector?.('[data-top3-analytics] [data-dfa="defect"]');if(select&&select.value!==String(code||''))dispatchAnalytics(select,String(code||''));queueMicrotask(()=>{host?.querySelector?.('[data-top3-analytics] [data-dfa-mode="occurrences"]')?.click();host?.querySelector?.('[data-top3-analytics]')?.scrollIntoView?.({block:'start',behavior:'smooth'});});});}
  function openFullRanking(){store.updateContext?.({defect:null});last='';syncContextToAnalytics();queueMicrotask(()=>{const host=pane(),defect=host?.querySelector?.('[data-top3-analytics] [data-dfa="defect"]');if(defect&&defect.value)dispatchAnalytics(defect,'');host?.querySelector?.('[data-top3-analytics] [data-dfa-mode="ranking"]')?.click();host?.querySelector?.('[data-top3-analytics]')?.scrollIntoView?.({block:'start',behavior:'smooth'});});}
  function render(){
    bindContextBridge();
    const context=store.context?.()||{},shared=context.line_id||store.preferredLine?.();if(shared&&shared!==line)line=shared;
    const snapshot=store.read?.(line)?.snapshot||null,allOccurrences=trustedRows(snapshot),scopeWithoutShift=baseScopedRows(allOccurrences,context),shiftEvidence=scopeWithoutShift.some(row=>row.production_evidence_proven&&row.production_shift),occurrences=scopedDailyRows(allOccurrences,context),top=topFromRows(occurrences);
    const model=selectDashboard(store,{line_id:line,product:context.product||undefined});
    const allDates=uniq(allOccurrences.map(row=>row.failure_record_date).filter(Boolean)).sort(),latestAll=allDates.at(-1)||'',scopeDates=uniq(occurrences.map(row=>row.failure_record_date).filter(Boolean)).sort(),latest=scopeDates.at(-1)||latestAll;
    const period=periodOf(context),periodRows=baseScopedRows(allOccurrences,{...context,shift:null}),periodTrusted=(!period.from&&!period.to)||(Boolean(period.from&&period.to&&period.from===period.to&&periodRows.length&&periodRows.every(row=>row.production_evidence_proven&&row.production_operational_date===period.from))),metricsTrusted=Boolean(snapshot&&!context.shift&&periodTrusted);
    const uniquePcbas=uniq(occurrences.map(pcbaOf)).length;
    const links=reuseLinks(snapshot),historicalLinks=links.filter(link=>link.history_code||link.history_desc||(link.historical_evidence||[]).length),historicalGroups=uniq(historicalLinks.map(link=>link.component_group||link.family||link.item_type)),historicalMaterials=uniq(historicalLinks.map(link=>link.material||link.item_sn));
    const ownPrior=snapshot?.insights?.drilldowns?.pcba_reused_with_prior_failure||[],reusePcbas=uniq([...ownPrior.map(pcbaOf),...historicalLinks.map(link=>link.pcba)]),reuseCoverage=Boolean(snapshot&&(snapshot.insights||snapshot.material_trace||snapshot?.canonical?.datasets?.material_reuse)),compactTop=top.map(item=>[item.code,item.description,item.count]);
    const shiftUnclassified=Boolean(context.shift&&scopeWithoutShift.length&&!shiftEvidence);shiftUnclassifiedCurrent=shiftUnclassified;
    const key=JSON.stringify([line,context,latest,model.snapshot?.snapshot_id,metricsTrusted?model.aggregates:null,compactTop,uniquePcbas,reusePcbas.length,historicalGroups.length,historicalMaterials.length,reuseCoverage,shiftUnclassified,document.documentElement.lang]);if(key===last){queueMicrotask(polishAnalyticsShift);return;}last=key;
    const scopeText=[context.product?`CPH ${context.product}`:null,context.shift?`${t('Turno 3022','3022 shift')} ${context.shift}`:null,context.defect?`Defect ${context.defect}`:null,(period.from||period.to)?`${t('Registro MES','MES record')} ${period.from||'…'} → ${period.to||'…'}`:null].filter(Boolean).join(' · ');
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-daily-summary"><div class="section-head"><div><h2>${t('Top 3 & FPY · resumo rápido','Top 3 & FPY · quick summary')}</h2><p>${t('Período acompanha o registro da falha no MES; turno/dia de produção só são usados quando comprovados pela 3022.','Period follows the MES failure record; production shift/day are used only when proven by 3022.')}</p></div><label>${t('Linha','Line')}<select data-daily-summary-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${id}</option>`).join('')}</select></label></div>${scopeText?`<p class="mes-context"><b>${t('Escopo ativo','Active scope')}:</b> ${esc(scopeText)}</p>`:''}${shiftUnclassified?`<div class="notice warn" data-daily-shift-unclassified><b>${t('Turno não classificado pela 3022.','Shift not classified by 3022.')}</b><br>${t('As falhas existentes permanecem visíveis; não foram convertidas em zero porque esta leitura não possui classificação de turno.','Existing failures remain visible; they were not converted to zero because this read has no shift classification.')}</div>`:''}<div class="ames-summary-grid"><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metricsTrusted?metric(model,'check_fpy'):null))}</strong></div><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metricsTrusted?metric(model,'fpy'):null))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metricsTrusted?metric(model,'quantity'):null))}</strong></div><div class="stat"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${esc(number(snapshot?occurrences.length:null))}</strong></div></div><div class="ames-top3-list">${top.map((item,i)=>`<button type="button" class="ames-top3-item" data-daily-top3-defect="${esc(item.code||'')}"><span class="ames-rank">${i+1}</span><span><b>${esc(defectLabel(item.code,item.description))}</b><small>${esc(item.code||t('Código não informado','Code not provided'))}${latest?` · ${t('registro MES','MES record')} ${esc(latest)}`:''}</small></span><strong>${esc(number(item.count))}</strong></button>`).join('')||(snapshot?`<p>${t('Nenhuma ocorrência no escopo selecionado.','No occurrences in the selected scope.')}</p>`:`<p>${t('Não coletado nesta linha.','Not collected for this line.')}</p>`)}</div><div class="ames-failure-summary"><span>${t('PCBAs únicas no escopo','Unique PCBAs in scope')} <b>${snapshot?uniquePcbas:'—'}</b></span><span>${t('PCBAs · reuso + falha histórica','PCBAs · reuse + prior failure')} <b>${reuseCoverage?reusePcbas.length:'—'}</b></span><span>${t('Famílias/conjuntos históricos','Historical families/sets')} <b>${reuseCoverage?historicalGroups.length:'—'}</b></span><span>${t('Vínculos Material SN históricos','Historical Material SN links')} <b>${reuseCoverage?historicalMaterials.length:'—'}</b></span><button type="button" class="button secondary" data-daily-open-ranking>${t('Abrir ranking completo','Open full ranking')}</button></div><div class="ames-top3-meta"><span>${esc(line)}</span><span>${latest?`${t('Registro MES','MES record')} ${esc(latest)}`:t('Registro MES sem data','MES record date unavailable')}</span><span>${esc(model.snapshot?.snapshot_id||t('Sem snapshot','No snapshot'))}</span><span>${metricsTrusted?t('FPY/Quantity correspondem a um escopo de produção comprovado.','FPY/Quantity match a proven production scope.'):t('FPY/Quantity aparecem como — quando a 3022 não prova o escopo de produção do período.','FPY/Quantity show — when 3022 does not prove the production scope for the period.')}</span><span>${t('Sem evidência de reuso carregada aparece como —, não como zero.','Missing loaded reuse evidence appears as —, not zero.')}</span></div></section>`;
    root.querySelector('[data-daily-summary-line]')?.addEventListener('change',e=>{line=e.target.value;store.updateContext?.({line_id:line});last='';render();queueMicrotask(syncContextToAnalytics);});
    root.querySelectorAll('[data-daily-top3-defect]').forEach(button=>button.addEventListener('click',()=>openAnalyticsFailure(button.dataset.dailyTop3Defect)));
    root.querySelector('[data-daily-open-ranking]')?.addEventListener('click',openFullRanking);queueMicrotask(syncContextToAnalytics);
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}
