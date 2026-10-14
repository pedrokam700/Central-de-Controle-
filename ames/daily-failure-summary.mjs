import {defectLabel} from './defect-label.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';
import {reuseLinks} from './data/reuse-analysis.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(2)}%`;
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
const uniq=a=>[...new Set((a||[]).filter(v=>v!==null&&v!==undefined&&String(v)!==''))];
const pcbaOf=row=>row?.current_pcba_sn||row?.pcba_sn||row?.['PCBA atual']||row?.PCBA||null;
const day=v=>String(v||'').slice(0,10);

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
    const model=selectDashboard(store,{line_id:line}),top=(model.pareto||[]).slice(0,3);
    const snapshot=store.read?.(line)?.snapshot||null;
    const occurrences=snapshot?.occurrences||snapshot?.canonical?.datasets?.defects||[];
    const latest=uniq(occurrences.map(row=>day(row.production_operational_date||row.defect_time)).filter(Boolean)).sort().at(-1)||'';
    const uniquePcbas=uniq(occurrences.map(pcbaOf)).length;
    const links=reuseLinks(snapshot),historicalLinks=links.filter(link=>link.history_code||link.history_desc||(link.historical_evidence||[]).length);
    const historicalGroups=uniq(historicalLinks.map(link=>link.component_group||link.family||link.item_type));
    const historicalMaterials=uniq(historicalLinks.map(link=>link.material||link.item_sn));
    const ownPrior=snapshot?.insights?.drilldowns?.pcba_reused_with_prior_failure||[];
    const reusePcbas=uniq([...ownPrior.map(pcbaOf),...historicalLinks.map(link=>link.pcba)]);
    const hasReuseEvidence=Boolean(reusePcbas.length||historicalGroups.length||historicalMaterials.length);
    const compactTop=top.map(item=>[item.code,item.description,item.count]);
    const key=JSON.stringify([line,latest,model.snapshot?.snapshot_id,model.aggregates,compactTop,uniquePcbas,reusePcbas.length,historicalGroups.length,historicalMaterials.length,document.documentElement.lang]);if(key===last)return;last=key;
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-daily-summary"><div class="section-head"><div><h2>${t('Top 3 & FPY · resumo rápido','Top 3 & FPY · quick summary')}</h2><p>${t('Leitura imediata da linha. Clique em uma falha para abrir exatamente o Defect Code no bloco completo abaixo; o ranking principal continua sem limite de Top 3.','Immediate line read. Click a failure to open that exact Defect Code in the full block below; the main ranking remains unlimited by Top 3.')}</p></div><label>${t('Linha','Line')}<select data-daily-summary-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${id}</option>`).join('')}</select></label></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metric(model,'check_fpy')))}</strong></div><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metric(model,'fpy')))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${esc(number(model.sample_metric?.value))}</strong></div></div><div class="ames-top3-list">${top.map((item,i)=>`<button type="button" class="ames-top3-item" data-daily-top3-defect="${esc(item.code||'')}"><span class="ames-rank">${i+1}</span><span><b>${esc(defectLabel(item.code,item.description))}</b><small>${esc(item.code||t('Código não informado','Code not provided'))}${latest?` · ${esc(latest)}`:''}</small></span><strong>${esc(number(item.count))}</strong></button>`).join('')||`<p>${t('Nenhuma ocorrência disponível neste escopo.','No occurrences available in this scope.')}</p>`}</div><div class="ames-failure-summary"><span>${t('PCBAs únicas carregadas','Loaded unique PCBAs')} <b>${occurrences.length?uniquePcbas:'—'}</b></span><span>${t('PCBAs · reuso + falha histórica','PCBAs · reuse + prior failure')} <b>${hasReuseEvidence?reusePcbas.length:'—'}</b></span><span>${t('Famílias/conjuntos históricos','Historical families/sets')} <b>${hasReuseEvidence?historicalGroups.length:'—'}</b></span><span>${t('Vínculos Material SN históricos','Historical Material SN links')} <b>${hasReuseEvidence?historicalMaterials.length:'—'}</b></span><button type="button" class="button secondary" data-daily-open-ranking>${t('Abrir ranking completo','Open full ranking')}</button></div><div class="ames-top3-meta"><span>${esc(line)}</span><span>${esc(latest||model.snapshot?.collected_at||t('Data operacional não informada','Operational date unavailable'))}</span><span>${esc(model.snapshot?.snapshot_id||t('Sem snapshot','No snapshot'))}</span><span>${t('Sem evidência de reuso carregada aparece como —, não como zero.','Missing loaded reuse evidence appears as —, not zero.')}</span></div></section>`;
    root.querySelector('[data-daily-summary-line]')?.addEventListener('change',e=>{line=e.target.value;store.updateContext?.({line_id:line});last='';render();queueMicrotask(syncLineToAnalytics);});
    root.querySelectorAll('[data-daily-top3-defect]').forEach(button=>button.addEventListener('click',()=>openAnalyticsFailure(button.dataset.dailyTop3Defect)));
    root.querySelector('[data-daily-open-ranking]')?.addEventListener('click',openFullRanking);
    queueMicrotask(syncLineToAnalytics);
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}