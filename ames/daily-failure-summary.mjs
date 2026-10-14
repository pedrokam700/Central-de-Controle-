import {defectLabel} from './defect-label.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';
import {buildDailyFailureRows,filterDailyFailureRows,rankDailyFailures} from './daily-failure-analytics.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(2)}%`;
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
const uniq=a=>[...new Set((a||[]).filter(v=>v!==null&&v!==undefined&&String(v)!==''))];
const rowDay=row=>String(row?.production_operational_date||row?.defect_time||'').slice(0,10);

export function createDailyFailureSummary(root,store){
  let line=store.preferredLine?.()||LINE_IDS[0],last='';
  const pane=()=>root.closest?.('[data-console-pane="top3"]')||root.parentElement;
  function syncLineToAnalytics(){
    const select=pane()?.querySelector?.('[data-top3-analytics] [data-dfa="line"]');
    if(!select||select.value===line)return;
    select.value=line;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function openAnalyticsFailure(code){
    syncLineToAnalytics();
    queueMicrotask(()=>{
      const host=pane(),select=host?.querySelector?.('[data-top3-analytics] [data-dfa="defect"]');
      if(select){select.value=String(code||'');select.dispatchEvent(new Event('change',{bubbles:true}));}
      queueMicrotask(()=>{
        host?.querySelector?.('[data-top3-analytics] [data-dfa-mode="occurrences"]')?.click();
        host?.querySelector?.('[data-top3-analytics]')?.scrollIntoView?.({block:'start',behavior:'smooth'});
      });
    });
  }
  function openFullRanking(){
    syncLineToAnalytics();
    queueMicrotask(()=>{
      const host=pane();
      host?.querySelector?.('[data-top3-analytics] [data-dfa-mode="ranking"]')?.click();
      host?.querySelector?.('[data-top3-analytics]')?.scrollIntoView?.({block:'start',behavior:'smooth'});
    });
  }
  function render(){
    const shared=store.context?.().line_id;if(shared&&shared!==line)line=shared;
    const model=selectDashboard(store,{line_id:line});
    const allRows=buildDailyFailureRows(store),lineRows=filterDailyFailureRows(allRows,{line});
    const latest=uniq(lineRows.map(rowDay).filter(Boolean)).sort().at(-1)||'';
    const scopeRows=latest?filterDailyFailureRows(lineRows,{from:latest,to:latest}):lineRows;
    const canonicalTop=rankDailyFailures(scopeRows).slice(0,3);
    const fallbackTop=model.pareto||[];
    const top=canonicalTop.length?canonicalTop:fallbackTop.slice(0,3);
    const relevantRows=scopeRows.filter(row=>row.reuse_with_failure);
    const reusePcbas=uniq(relevantRows.map(row=>row.pcba));
    const historyLinks=relevantRows.flatMap(row=>row.component_history_links||[]);
    const historyGroups=uniq(historyLinks.map(link=>link.component_group||link.family||link.item_type));
    const historyMaterials=uniq(historyLinks.map(link=>link.material||link.item_sn));
    const hasReuseEvidence=Boolean(reusePcbas.length||historyGroups.length||historyMaterials.length);
    const key=JSON.stringify([line,latest,model.snapshot?.snapshot_id,model.aggregates,top,reusePcbas.length,historyGroups.length,historyMaterials.length,document.documentElement.lang]);if(key===last)return;last=key;
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-daily-summary"><div class="section-head"><div><h2>${t('Top 3 & FPY · resumo rápido','Top 3 & FPY · quick summary')}</h2><p>${t('Leitura imediata da linha. Clique em uma falha para abrir exatamente as ocorrências que formam o número no bloco completo abaixo.','Immediate line read. Click a failure to open the exact occurrences behind that number in the full block below.')}</p></div><label>${t('Linha','Line')}<select data-daily-summary-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${id}</option>`).join('')}</select></label></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metric(model,'check_fpy')))}</strong></div><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metric(model,'fpy')))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">${t('Falhas no recorte','Failures in scope')}</span><strong class="stat-value">${esc(canonicalTop.length?scopeRows.length:number(model.sample_metric?.value))}</strong></div></div><div class="ames-top3-list">${top.map((item,i)=>`<button type="button" class="ames-top3-item" data-daily-top3-defect="${esc(item.code||'')}"><span class="ames-rank">${i+1}</span><span><b>${esc(defectLabel(item.code,item.description))}</b><small>${esc(item.code||t('Código não informado','Code not provided'))}${latest?` · ${esc(latest)}`:''}</small></span><strong>${esc(number(item.count))}</strong></button>`).join('')||`<p>${t('Nenhuma ocorrência disponível neste escopo.','No occurrences available in this scope.')}</p>`}</div><div class="ames-failure-summary"><span>${t('PCBAs únicas','Unique PCBAs')} <b>${scopeRows.length?uniq(scopeRows.map(row=>row.pcba)).length:'—'}</b></span><span>${t('PCBAs · reuso + falha histórica','PCBAs · reuse + prior failure')} <b>${hasReuseEvidence?reusePcbas.length:'—'}</b></span><span>${t('Famílias/conjuntos históricos','Historical families/sets')} <b>${hasReuseEvidence?historyGroups.length:'—'}</b></span><span>${t('Vínculos Material SN históricos','Historical Material SN links')} <b>${hasReuseEvidence?historyMaterials.length:'—'}</b></span><button type="button" class="button secondary" data-daily-open-ranking>${t('Abrir ranking completo','Open full ranking')}</button></div><div class="ames-top3-meta"><span>${esc(line)}</span><span>${esc(latest||model.snapshot?.collected_at||t('Data operacional não informada','Operational date unavailable'))}</span><span>${esc(model.snapshot?.snapshot_id||t('Sem snapshot','No snapshot'))}</span><span>${t('Sem evidência de reuso carregada aparece como —, não como zero.','Missing loaded reuse evidence appears as —, not zero.')}</span></div></section>`;
    root.querySelector('[data-daily-summary-line]')?.addEventListener('change',e=>{line=e.target.value;store.updateContext?.({line_id:line});last='';render();queueMicrotask(syncLineToAnalytics);});
    root.querySelectorAll('[data-daily-top3-defect]').forEach(button=>button.addEventListener('click',()=>openAnalyticsFailure(button.dataset.dailyTop3Defect)));
    root.querySelector('[data-daily-open-ranking]')?.addEventListener('click',openFullRanking);
    queueMicrotask(syncLineToAnalytics);
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}