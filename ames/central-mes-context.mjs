import { LINE_IDS } from './data/contract.mjs';
import { selectDashboard } from './data/dashboard.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const STYLE_HREF=new URL('./central-mes-context.css',import.meta.url).href;
const fmt=value=>value===null||value===undefined?'—':String(value);
const metric=(model,name)=>model.aggregates.find(x=>x.name===name)?.value??null;
const productList=model=>[...new Set((model.snapshot?.occurrences||[]).map(r=>r.product_key).filter(Boolean))];

export function createCentralMesContext(root,store,{title='Contexto MES ao vivo',subtitle='Resumo operacional das linhas. O Dashboard de reuso continua separado.',mode='dashboard'}={}){
  let selected=LINE_IDS[0],last='';
  function render(){
    const models=LINE_IDS.map(line=>selectDashboard(store,{line_id:line})),key=JSON.stringify([selected,...models.map(m=>[m.snapshot?.snapshot_id,m.source,m.freshness,m.sample_metric?.value,m.snapshot?.summary])]);if(key===last)return;last=key;
    const active=models.find(m=>m.scope.line_id===selected)||models[0],products=productList(active),top=active.pareto||[];
    root.innerHTML=`<link rel="stylesheet" href="${STYLE_HREF}"><section class="central-mes-context ${mode}"><div class="central-mes-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><span>${active.snapshot?`snapshot ${esc(active.snapshot.snapshot_id)}`:'sem snapshot'}</span></div>
      <div class="central-mes-lines">${models.map((model,i)=>{const line=model.scope.line_id,fpy=metric(model,'fpy'),check=metric(model,'check_fpy'),qty=metric(model,'quantity');return`<button type="button" class="central-mes-line${line===selected?' active':''}" data-central-mes-line="${line}"><small>Linha ${i+1} · ${esc(line)}</small><strong>${fpy===null?'—':esc(fpy)+'%'}</strong><span>FPY · Check ${check===null?'—':esc(check)+'%'} · Qty ${esc(fmt(qty))}</span><em>${esc(fmt(model.sample_metric?.value))} ocorrência(s) carregada(s)</em></button>`}).join('')}</div>
      <div class="central-mes-detail"><div><small>Linha selecionada</small><b>${esc(selected)}</b></div><div><small>CPH carregados</small><b>${products.length?esc(products.slice(0,3).join(' · ')):'—'}</b></div><div><small>Top falhas da leitura</small><b>${top.length?top.map(x=>`${esc(x.code||'—')} (${esc(x.count)})`).join(' · '):'—'}</b></div><div><small>Origem</small><b>${esc(active.source||'none')} · ${esc(active.freshness||'unknown')}</b></div></div>
      <p class="central-mes-foot">${mode==='daily'?'O snapshot MES não é automaticamente atribuído à data/turno manual selecionado. ':''}Linha e CPH continuam exatos; lista parcial não prova ausência de falha nem substitui o Console MES.</p></section>`;
    for(const button of root.querySelectorAll('[data-central-mes-line]'))button.addEventListener('click',()=>{selected=button.dataset.centralMesLine;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}
