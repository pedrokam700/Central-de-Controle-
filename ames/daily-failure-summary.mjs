import {LINE_IDS} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(2)}%`;
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;

export function createDailyFailureSummary(root,store){
  let line=LINE_IDS[0],last='';
  function render(){
    const model=selectDashboard(store,{line_id:line}),top=model.pareto||[];
    const key=JSON.stringify([line,model.snapshot?.snapshot_id,model.aggregates,top,document.documentElement.lang]);if(key===last)return;last=key;
    root.innerHTML=`<section class="mes-context-panel ames-daily-summary"><div class="section-head"><div><h2>${t('Resumo rápido','Quick summary')}</h2><p>${t('Top 3 continua como leitura imediata; a análise completa está logo abaixo.','Top 3 remains the quick read; full analysis is directly below.')}</p></div><label>${t('Linha','Line')}<select data-daily-summary-line>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${id}</option>`).join('')}</select></label></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${esc(pct(metric(model,'check_fpy')))}</strong></div><div class="stat"><span class="stat-label">FPY</span><strong class="stat-value">${esc(pct(metric(model,'fpy')))}</strong></div><div class="stat"><span class="stat-label">Quantity</span><strong class="stat-value">${esc(number(metric(model,'quantity')))}</strong></div><div class="stat"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${esc(number(model.sample_metric?.value))}</strong></div></div><div class="ames-top3-list">${top.slice(0,3).map((item,i)=>`<div class="ames-top3-item"><span class="ames-rank">${i+1}</span><span><b>${esc(item.description||item.code||t('Falha sem descrição','Failure without description'))}</b><small>${esc(item.code||t('Código não informado','Code not provided'))}</small></span><strong>${esc(number(item.count))}</strong></div>`).join('')||`<p>${t('Nenhuma ocorrência disponível neste escopo.','No occurrences available in this scope.')}</p>`}</div><div class="ames-top3-meta"><span>${esc(line)}</span><span>${esc(model.snapshot?.collected_at||t('Coleta não informada','Collection not provided'))}</span><span>${esc(model.snapshot?.snapshot_id||t('Sem snapshot','No snapshot'))}</span></div></section>`;
    root.querySelector('[data-daily-summary-line]')?.addEventListener('change',e=>{line=e.target.value;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}
