import { LINE_IDS } from './data/contract.mjs';
import { coverageState, matchesPeriod } from './data/history.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const labels={fresh:'Atualizado',partial:'Parcial',stale:'Desatualizado',not_collected:'Não coletado'};
export function currentDataLabel(store,line) {
  const read=store.read(line);return labels[coverageState(read)];
}
export function createHistoryView(root,store,client,history) {
  let line=LINE_IDS[0],loading=false,error='',entries=[],selected=null,disposed=false,generation=0;
  function results(){
    const host=root.querySelector('[data-period-results]');if(!host)return;
    const values=Object.fromEntries(new FormData(root.querySelector('form')));
    const matches=entries.filter(e=>matchesPeriod(e,values));
    host.innerHTML=loading?'<p role="status">Consultando histórico…</p>':error?`<p role="status">${esc(error)}</p>`:
      `${matches.length?`<div class="table-wrap"><table><thead><tr><th>Período</th><th>CPH</th><th>Coleta</th><th>Posto coletor</th><th></th></tr></thead><tbody>${matches.map((e,i)=>`<tr><td>${esc(e.period_start&&e.period_end?e.period_start+' → '+e.period_end:'Período não informado pela fonte')}</td><td>${esc(e.products||'—')}</td><td>${esc(e.collected_at)}</td><td>${esc(e.source_id)}</td><td><button type="button" class="button secondary" data-history-open="${i}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`:'<p>Período ainda não coletado</p>'}
      ${!matches.length&&store.agent().status==='connected'&&values.start&&values.end?'<button type="button" class="button secondary" data-history-collect>Coletar este período</button>':''}`;
    host.querySelectorAll('[data-history-open]').forEach(button=>button.addEventListener('click',async()=>{
      const token=++generation;loading=true;results();
      try{const p=await history.open(matches[Number(button.dataset.historyOpen)]);if(disposed||token!==generation)return;selected=p;}
      catch{if(!disposed&&token===generation)error='Histórico compartilhado indisponível. Verifique a conexão e as permissões.';}
      finally{if(!disposed&&token===generation){loading=false;results();showSelected();}}
    }));
    host.querySelector('[data-history-collect]')?.addEventListener('click',async()=>{
      loading=true;results();
      try{await client.collect('custom',{lines:[line],performance:'balanced',start_at:values.start,end_at:values.end,defect_codes:[],max_failures:0,max_pcbas:0});}
      catch(e){error=e.message;}finally{if(!disposed){loading=false;results();}}
    });
  }
  function showSelected(){
    const host=root.querySelector('[data-period-snapshot]');if(!host)return;
    if(!selected){host.replaceChildren();return;}
    const rows=selected.datasets.defects;
    host.innerHTML=`<h3>HISTÓRICO · ${esc(selected.line_id)}</h3><p>${esc(selected.collected_at)} · ${esc(selected.source_id)} · ${selected.coverage.defects.source_complete?'Cobertura completa':'Cobertura parcial'}</p><div class="table-wrap"><table><thead><tr><th>PCBA</th><th>CPH</th><th>Defect Code</th><th>Defect Time</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.pcba_sn)}</td><td>${esc(r.product_model)}</td><td>${esc(r.defect_code)}</td><td>${esc(r.defect_time)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function load(){
    if(!history){error='Histórico compartilhado indisponível. Verifique a conexão e as permissões.';results();return;}
    const token=++generation;loading=true;error='';selected=null;results();showSelected();
    try{const rows=await history.list(line);if(disposed||token!==generation)return;entries=rows;}
    catch{if(!disposed&&token===generation)error='Histórico compartilhado indisponível. Verifique a conexão e as permissões.';}
    finally{if(!disposed&&token===generation){loading=false;results();}}
  }
  function render(){
    if(!root.querySelector('form')){
      root.innerHTML=`<details class="mes-context-panel" data-history-panel><summary>Histórico de períodos</summary><form><div class="mes-filters"><label>Linha<select name="line">${LINE_IDS.map(l=>`<option>${l}</option>`).join('')}</select></label><label>Início<input type="datetime-local" name="start"></label><label>Fim<input type="datetime-local" name="end"></label><label>CPH exato<input name="product" placeholder="CPH"></label></div><button type="submit" class="button secondary">Consultar histórico</button></form><section data-period-results></section><section data-period-snapshot></section></details>`;
      root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();line=e.currentTarget.elements.line.value;void load();});
      root.querySelector('select').addEventListener('change',()=>{generation++;entries=[];selected=null;root.querySelector('[data-period-results]').replaceChildren();showSelected();});
    }
  }
  return {render,clear(){disposed=true;generation++;root.replaceChildren();}};
}
