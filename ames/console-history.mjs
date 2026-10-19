import { LINE_IDS } from './data/contract.mjs';
import { coverageState, matchesPeriod } from './data/history.mjs';
import { formatFactoryDateTime as displayTime, displayValue } from './data/time-display.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const labels={fresh:'Atualizado',partial:'Parcial',stale:'Desatualizado',not_collected:'Não coletado'};
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const pad=n=>String(n).padStart(2,'0');
const inputDate=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const revisionLabel=entry=>`${entry.snapshot_id??'—'} · r${Number(entry.snapshot_revision)||0}`;

export function currentDataLabel(store,line) {
  const read=store.read(line);return labels[coverageState(read)];
}

// Factory wall clock is deliberate: B may be in another browser timezone.
export function operationalRange(store,offset=0,now=new Date()){
  const cfg=store.agent?.()?.config||{},timezone=cfg.timezone||'America/Sao_Paulo';
  const clock=String(cfg.production_day_start||cfg.day_start||'07:00');
  if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(clock))throw Error('Início operacional inválido');
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const dayMs=86400000,dayKey=ms=>new Date(ms).toISOString().slice(0,10);
  let day=Date.UTC(Number(fields.year),Number(fields.month)-1,Number(fields.day));
  if(fields.hour+':'+fields.minute<clock)day-=dayMs;
  const closed=new Set(cfg.non_production_dates||[]),extra=new Set(cfg.extra_production_dates||[]);
  if(offset<0){
    let count=0;
    for(let i=0;i<731&&count<Math.abs(offset);i++){
      day-=dayMs;
      const date=dayKey(day),weekday=new Date(day).getUTCDay();
      if(extra.has(date)||weekday>=1&&weekday<=5&&!closed.has(date))count++;
    }
    if(count<Math.abs(offset))throw Error('Dia produtivo anterior não comprovado');
  }else if(offset>0)day+=offset*dayMs;
  const date=dayKey(day),next=dayKey(day+dayMs);
  return {start:date+'T'+clock,end:next+'T'+clock,label:clock+' → '+clock};
}

export function createHistoryView(root,store,client,history) {
  let line=LINE_IDS[0],loading=false,error='',message='',entries=[],selected=null,selectedEntry=null,disposed=false,generation=0;
  const formValues=()=>root.querySelector('form')?Object.fromEntries(new FormData(root.querySelector('form'))):{};
  function setPeriod(start,end){const form=root.querySelector('form');if(!form)return;form.elements.start.value=start;form.elements.end.value=end;}
  function quickPeriod(offset){const range=operationalRange(store,offset);setPeriod(range.start,range.end);line=root.querySelector('form').elements.line.value;void load();}
  function results(){
    const host=root.querySelector('[data-period-results]');if(!host)return;
    const values=formValues(),matches=entries.filter(e=>matchesPeriod(e,values)),canCollect=store.agent().status==='connected'&&values.start&&values.end;
    host.innerHTML=loading?`<p role="status">${t('Consultando histórico…','Loading history…')}</p>`:error?`<p role="status" class="notice warn">${esc(error)}</p>`:
      `${message?`<p role="status" class="mes-context">${esc(message)}</p>`:''}${matches.length?`<div class="table-wrap"><table><thead><tr><th>${t('Período','Period')}</th><th>CPH</th><th>${t('Versão','Version')}</th><th>${t('Coleta','Collected')}</th><th>${t('Posto/origem','Workstation/source')}</th><th></th></tr></thead><tbody>${matches.map((e,i)=>`<tr><td>${esc(e.period_start&&e.period_end?e.period_start+' → '+e.period_end:t('Período não informado pela fonte','Period not reported by source'))}</td><td>${esc(e.products||'—')}</td><td><b>${esc(revisionLabel(e))}</b></td><td>${esc(displayTime(e.collected_at))}</td><td>${esc(e.source_id||'—')}</td><td><button type="button" class="button secondary" data-history-open="${i}">${t('Abrir sem substituir atual','Open without replacing current')}</button></td></tr>`).join('')}</tbody></table></div><p class="mes-context">${t('Cada linha é uma versão preservada. Uma atualização do mesmo período cria/publica nova evidência; versões anteriores continuam disponíveis.','Each row is a preserved version. Refreshing the same period creates/publishes new evidence; older versions remain available.')}</p>`:`<p>${t('Período ainda não coletado','Period not collected yet')}</p>`}
      ${canCollect?`<button type="button" class="button secondary" data-history-collect>${matches.length?t('Atualizar este período (preservar histórico)','Refresh this period (preserve history)'):t('Coletar este período','Collect this period')}</button>`:''}`;
    host.querySelectorAll('[data-history-open]').forEach(button=>button.addEventListener('click',async()=>{
      const entry=matches[Number(button.dataset.historyOpen)],token=++generation;loading=true;error='';message='';results();
      try{const payload=await history.open(entry);if(disposed||token!==generation)return;selected=payload;selectedEntry=entry;}
      catch{if(!disposed&&token===generation)error=t('Histórico compartilhado indisponível. Verifique a conexão e as permissões.','Shared history unavailable. Check connection and permissions.');}
      finally{if(!disposed&&token===generation){loading=false;results();showSelected();}}
    }));
    host.querySelector('[data-history-collect]')?.addEventListener('click',async()=>{
      const hadMatches=matches.length>0;loading=true;error='';message='';results();
      try{
        await client.collect('custom',{lines:[line],performance:'balanced',start_at:values.start,end_at:values.end,defect_codes:[],max_failures:0,max_pcbas:0});
        message=hadMatches?t('Atualização iniciada/concluída sem apagar as versões anteriores. A nova revisão aparecerá aqui após a sincronização.','Refresh started/completed without deleting older versions. The new revision will appear here after synchronization.'):t('Coleta iniciada/concluída. A versão aparecerá aqui após a sincronização.','Collection started/completed. The version will appear here after synchronization.');
      }catch(e){error=e.message;}
      finally{if(!disposed){loading=false;results();}}
    });
  }
  function showSelected(){
    const host=root.querySelector('[data-period-snapshot]');if(!host)return;
    if(!selected){host.replaceChildren();return;}
    const rows=selected.datasets?.defects||[],contexts=selected.process_contexts||selected.datasets?.process_contexts||[],coverage=selected.coverage?.defects||{};
    host.innerHTML=`<section class="mes-context-panel"><div class="section-head"><div><h3>${t('VISUALIZAÇÃO HISTÓRICA','HISTORICAL VIEW')} · ${esc(selected.line_id)}</h3><p>${t('Esta visualização é somente leitura e não substitui o snapshot atual da Central.','This view is read-only and does not replace the current Work Center snapshot.')}</p></div><span class="status">${esc(revisionLabel(selectedEntry||selected))}</span></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">${t('Coletado em','Collected at')}</span><strong class="stat-value">${esc(displayTime(selected.collected_at))}</strong></div><div class="stat"><span class="stat-label">${t('Origem','Source')}</span><strong class="stat-value">${esc(selected.source_id||'—')}</strong></div><div class="stat"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${rows.length}</strong></div><div class="stat"><span class="stat-label">3022 · ${t('contextos','contexts')}</span><strong class="stat-value">${contexts.length}</strong></div></div><p>${coverage.source_complete===true?t('Cobertura de falhas completa','Complete failure coverage'):t('Cobertura de falhas parcial/indisponível','Partial/unavailable failure coverage')}</p><div class="table-wrap"><table><thead><tr><th>PCBA</th><th>CPH</th><th>Defect Code</th><th>${t('Registro da falha (MES)','Failure record (MES)')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.pcba_sn||'—')}</td><td>${esc(r.product_model||'—')}</td><td>${esc(r.defect_code||'—')}</td><td>${esc(displayValue('defect_time',r.defect_time))}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  async function load(){
    if(!history){error=t('Histórico compartilhado indisponível. Verifique a conexão e as permissões.','Shared history unavailable. Check connection and permissions.');results();return;}
    const token=++generation;loading=true;error='';message='';selected=null;selectedEntry=null;results();showSelected();
    try{const rows=await history.list(line);if(disposed||token!==generation)return;entries=rows;}
    catch{if(!disposed&&token===generation)error=t('Histórico compartilhado indisponível. Verifique a conexão e as permissões.','Shared history unavailable. Check connection and permissions.');}
    finally{if(!disposed&&token===generation){loading=false;results();}}
  }
  function render(){
    if(!root.querySelector('form')){
      root.innerHTML=`<details open class="mes-context-panel" data-history-panel><summary>${t('Histórico de produção','Production history')}</summary><div class="mes-pagination"><button type="button" class="button secondary" data-history-quick="0">${t('Hoje','Today')}</button><button type="button" class="button secondary" data-history-quick="-1">${t('Último dia de produção','Last production day')}</button><span class="mes-context">${t('Janelas 3028 de 07:00 a 07:00; calendário produtivo e exceções configuráveis.','3028 periods start at 07:00; production calendar and exceptions are configurable.')}</span></div><form><div class="mes-filters"><label>${t('Linha','Line')}<select name="line">${LINE_IDS.map(l=>`<option>${l}</option>`).join('')}</select></label><label>${t('Início','Start')}<input type="datetime-local" name="start"></label><label>${t('Fim','End')}<input type="datetime-local" name="end"></label><label>CPH ${t('exato','exact')}<input name="product" placeholder="CPH"></label></div><button type="submit" class="button secondary">${t('Consultar outro período','Query another period')}</button></form><section data-period-results></section><section data-period-snapshot></section></details>`;
      root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();line=e.currentTarget.elements.line.value;void load();});
      root.querySelector('select').addEventListener('change',e=>{line=e.target.value;generation++;entries=[];selected=null;selectedEntry=null;root.querySelector('[data-period-results]').replaceChildren();showSelected();});
      root.querySelectorAll('[data-history-quick]').forEach(button=>button.addEventListener('click',()=>quickPeriod(Number(button.dataset.historyQuick))));
    }
  }
  return {render,clear(){disposed=true;generation++;root.replaceChildren();}};
}
