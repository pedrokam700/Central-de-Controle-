import { LINE_IDS } from './data/contract.mjs';
import { coverageState, matchesPeriod } from './data/history.mjs';
import { isTodaySnapshot } from './data/operational-period.mjs';
import { formatFactoryDateTime as displayTime, displayValue } from './data/time-display.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const labels={fresh:'Atualizado',partial:'Parcial',stale:'Desatualizado',not_collected:'Não coletado'};
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const pad=n=>String(n).padStart(2,'0');
const inputDate=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const revisionLabel=entry=>`${entry.snapshot_id??'—'} · r${Number(entry.snapshot_revision)||0}`;

const linkageStatus=value=>{
  const code=String(value??'').trim().toUpperCase();
  if(code==='Y')return t('Y · vinculado','Y · linked');
  if(code==='N')return t('N · não vinculado','N · not linked');
  return t('Não comprovado','Unverified');
};
// 3012 records are same-PCBA candidates, NOT a proven repair for this occurrence.
function repairEvidenceCell(row){
  const evidence=Array.isArray(row.repair_evidence_3012)?row.repair_evidence_3012:[];
  if(!evidence.length)return '—';
  const shown=evidence.slice(0,5);
  const label=t('Registros 3012 candidatos; associação à falha não confirmada','Candidate 3012 records; no confirmed failure association');
  const preview=shown.map(e=>`<li>${esc(displayTime(e.repair_time))} · ${esc(e.repair_comment||e.repair_desc||'—')}</li>`).join('');
  return `<details><summary>${evidence.length} · ${t('evidência(s) candidata(s)','candidate record(s)')}</summary><p class="mes-context">${label}</p><ul>${preview}</ul>${evidence.length>5?`<p class="mes-context">${t('Mostrando cinco primeiros registros','Showing the first five records')}</p>`:''}</details>`;
}


export function currentDataLabel(store,line) {
  const read=store.read(line);return labels[coverageState(read)];
}

// Factory wall clock is deliberate: B may be in another browser timezone.
export function operationalRange(store,offset=0,now=new Date()){
  const cfg=store.agent?.()?.config||{},timezone=cfg.timezone||'America/Sao_Paulo';
  const clock=String(cfg.production_day_start||cfg.day_start||'07:00');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))throw Error('Início operacional inválido');
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
  let line=LINE_IDS[0],tab='today',loading=false,error='',message='',entries=[],selected=null,selectedEntry=null,disposed=false,generation=0,renderedLanguage='';
  const formValues=()=>root.querySelector('form')?Object.fromEntries(new FormData(root.querySelector('form'))):{};
  function setPeriod(start,end){const form=root.querySelector('form');if(!form)return;form.elements.start.value=start;form.elements.end.value=end;}
  function quickPeriod(offset){const range=operationalRange(store,offset);setPeriod(range.start,range.end);line=root.querySelector('form').elements.line.value;void load();}
  function summary(){
    const host=root.querySelector('[data-production-context]');if(!host)return;
    const read=store.read(line),p=read.snapshot;
    const window=tab==='today'?operationalRange(store,0):tab==='previous'?operationalRange(store,-1):null;
    const heading={today:t('Hoje · Monitoramento','Today · Monitoring'),previous:t('Último dia produtivo','Last production day'),history:t('Histórico por data','Production history by date'),advanced:t('Consulta avançada isolada','Isolated advanced query')}[tab];
    host.innerHTML=`<div class="ames-history-head"><div><strong>${esc(heading)}</strong><p>${window?esc(window.start.replace('T',' ')+' → '+window.end.replace('T',' ')):t('Escolha a linha e o período; consultas investigativas não atualizam o painel Hoje.','Choose line and period; investigations never update Today.')}</p></div><div class="ames-history-state">${tab==='today'?esc(labels[coverageState(read)]):t('Histórico preservado','Preserved history')}</div></div><div class="ames-history-facts"><span>${t('Linha','Line')}: <b>${esc(line)}</b></span><span>${t('Snapshot','Snapshot')}: <b>${tab==='today'?esc(p?revisionLabel(p):'—'):'—'}</b></span><span>${t('Última extração','Last extraction')}: <b>${tab==='today'?esc(p?displayTime(p.collected_at):'—'):'—'}</b></span><span>${t('Origem','Origin')}: <b>${tab==='today'?esc(read.source||'—'):t('Local / compartilhada','Local / shared')}</b></span><span>AT: <b>${t('Conforme evidência da revisão','Per revision evidence')}</b></span></div>`;
  }
  function chooseTab(next){
    tab=next;message='';error='';selected=null;selectedEntry=null;showSelected();
    root.querySelectorAll('[data-history-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.historyMode===tab)));
    const inputs=root.querySelector('form');
    if(inputs){inputs.elements.start.readOnly=tab==='today'||tab==='previous';inputs.elements.end.readOnly=tab==='today'||tab==='previous';}
    if(tab==='today'||tab==='previous')quickPeriod(tab==='today'?0:-1);
    else{setPeriod('','');entries=[];const host=root.querySelector('[data-period-results]');if(host)host.replaceChildren();summary();void load();}
  }
  function results(){
    const host=root.querySelector('[data-period-results]');if(!host)return;summary();
    const values=formValues(),matches=tab==='today'?[]:entries.filter(e=>matchesPeriod(e,values)),canCollect=store.agent().status==='connected'&&values.start&&values.end;
    if(tab==='today'){
      // The mutable end of a live 3028 window never equals tomorrow at 07:00.
      // Use the already verified current-day canonical store instead of
      // misclassifying its history index as "not collected".
      const current=store.read(line),snapshot=current.snapshot,canonical=snapshot?.canonical;
      const cfg=store.agent().config||{};
      const verified=canonical&&isTodaySnapshot(canonical,new Date(),{
        timezone:cfg.timezone||'America/Sao_Paulo',
        dayStart:cfg.production_day_start||cfg.day_start||'07:00'
      });
      const range=operationalRange(store,0);
      const failures=canonical?.datasets?.defects||[];
      host.innerHTML=loading?`<p role="status">${t('Consultando histórico…','Loading history…')}</p>`:
        `${verified?`<div class="ames-history-current"><p><b>${t('Evidência do dia operacional confirmada','Current production-day evidence verified')}</b> · ${esc(range.start.replace('T',' '))} → ${esc(range.end.replace('T',' '))}</p><p>${t('Última extração','Last extraction')}: ${esc(displayTime(canonical.collected_at))} · ${t('Origem','Source')}: ${esc(current.source)} · ${t('Revisão','Revision')}: ${esc(revisionLabel(canonical))}</p><p>${t('Ocorrências armazenadas','Stored occurrences')}: <b>${failures.length}</b> · ${t('Cobertura','Coverage')}: ${canonical.coverage?.defects?.source_complete===true?t('Completa','Complete'):t('Parcial/não comprovada','Partial/unverified')}</p></div>`:`<p class="mes-context">${t('Ainda não há evidência comprovada para Hoje nesta linha. Dados de outro período não serão exibidos aqui.','No verified evidence for Today on this line. Another period will not appear here.')}</p>`}
        ${canCollect?`<button type="button" class="button secondary" data-history-today-collect>${t('Atualizar Hoje','Refresh Today')}</button>`:''}`;
      host.querySelector('[data-history-today-collect]')?.addEventListener('click',async()=>{
        loading=true;results();
        try{await client.collect('today',{lines:[line],performance:'balanced'});message=t('Atualização do dia iniciada. Aguarde a próxima revisão.','Today refresh started. Wait for the next revision.');}
        catch(e){error=e.message;}
        finally{if(!disposed){loading=false;results();}}
      });
      return;
    }
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
        if(tab==='previous')await client.collect('previous_day',{lines:[line],performance:'balanced'});
        else if(tab==='today')await client.collect('today',{lines:[line],performance:'balanced'});
        else await client.collect('custom',{lines:[line],performance:'balanced',start_at:values.start,end_at:values.end,defect_codes:[],max_failures:0,max_pcbas:0});
        message=tab==='advanced'?t('Consulta investigativa iniciada no banco local; o painel Hoje dos demais postos não será alterado.','Local investigation started; other workstations Today will not change.'):
          t('Coleta iniciada; aguarde a conclusão e a próxima revisão. O histórico existente permanece preservado.','Collection started; wait for the next revision; prior history remains preserved.');
      }catch(e){error=e.message;}
      finally{if(!disposed){loading=false;results();}}
    });
  }
  function showSelected(){
    const host=root.querySelector('[data-period-snapshot]');if(!host)return;
    if(!selected){host.replaceChildren();return;}
    const rows=selected.datasets?.defects||[],contexts=selected.process_contexts||selected.datasets?.process_contexts||[],coverage=selected.coverage?.defects||{};
    host.innerHTML=`<section class="mes-context-panel"><div class="section-head"><div><h3>${t('VISUALIZAÇÃO HISTÓRICA','HISTORICAL VIEW')} · ${esc(selected.line_id)}</h3><p>${t('Esta visualização é somente leitura e não substitui o snapshot atual da Central.','This view is read-only and does not replace the current Work Center snapshot.')}</p></div><span class="status">${esc(revisionLabel(selectedEntry||selected))}</span></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">${t('Coletado em','Collected at')}</span><strong class="stat-value">${esc(displayTime(selected.collected_at))}</strong></div><div class="stat"><span class="stat-label">${t('Origem','Source')}</span><strong class="stat-value">${esc(selected.source_id||'—')}</strong></div><div class="stat"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${rows.length}</strong></div><div class="stat"><span class="stat-label">3022 · ${t('contextos','contexts')}</span><strong class="stat-value">${contexts.length}</strong></div></div><p>${coverage.source_complete===true?t('Cobertura de falhas completa','Complete failure coverage'):t('Cobertura de falhas parcial/indisponível','Partial/unavailable failure coverage')}</p><div class="table-wrap"><table><thead><tr><th>PCBA</th><th>CPH</th><th>Defect Code</th><th>${t('Registro da falha (MES)','Failure record (MES)')}</th><th>${t('Vínculo (2114)','Linkage (2114)')}</th><th>${t('AT (3012) · candidatos','AT (3012) · candidates')}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.pcba_sn||'—')}</td><td>${esc(r.product_model||'—')}</td><td>${esc(r.defect_code||'—')}</td><td>${esc(displayValue('defect_time',r.defect_time))}</td><td>${esc(linkageStatus(r.repair_status_current))}</td><td>${repairEvidenceCell(r)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  async function load(){
    if(!history){error=t('Histórico compartilhado indisponível. Verifique a conexão e as permissões.','Shared history unavailable. Check connection and permissions.');results();return;}
    const token=++generation;loading=true;error='';message='';selected=null;selectedEntry=null;results();showSelected();
    try{const rows=await history.list(line);if(disposed||token!==generation)return;entries=rows;}
    catch{if(!disposed&&token===generation)error=t('Histórico compartilhado indisponível. Verifique a conexão e as permissões.','Shared history unavailable. Check connection and permissions.');}
    finally{if(!disposed&&token===generation){loading=false;results();}}
  }
  function render(){
    const language=document.documentElement.lang.startsWith('en')?'en':'pt';
    if(renderedLanguage!==language){generation++;root.replaceChildren();renderedLanguage=language;}
    if(!root.querySelector('form')){
      root.innerHTML=`<details open class="mes-context-panel ames-history-root" data-history-panel><summary>${t('Histórico de produção','Production history')}</summary><nav class="ames-history-tabs" aria-label="${t('Modo do histórico','History mode')}"><button type="button" class="button secondary" aria-pressed="true" data-history-mode="today">${t('Hoje','Today')}</button><button type="button" class="button secondary" aria-pressed="false" data-history-mode="previous">${t('Último dia de produção','Last production day')}</button><button type="button" class="button secondary" aria-pressed="false" data-history-mode="history">${t('Histórico por data','History by date')}</button><button type="button" class="button secondary" aria-pressed="false" data-history-mode="advanced">${t('Consulta avançada','Advanced query')}</button></nav><section class="ames-history-overview" data-production-context></section><p class="mes-context">${t('O 3028 usa 07:00 → 07:00; turnos 07:30/17:30 permanecem distintos. Dados não comprovados nunca viram zero.','3028 uses 07:00 → 07:00; shifts 07:30/17:30 remain distinct. Missing evidence is never zero.')}</p><form><div class="mes-filters"><label>${t('Linha','Line')}<select name="line">${LINE_IDS.map(l=>`<option>${l}</option>`).join('')}</select></label><label>${t('Início','Start')}<input type="datetime-local" name="start"></label><label>${t('Fim','End')}<input type="datetime-local" name="end"></label><label>CPH ${t('exato','exact')}<input name="product" placeholder="CPH"></label></div><button type="submit" class="button secondary">${t('Consultar outro período','Query another period')}</button></form><section data-period-results></section><section data-period-snapshot></section></details>`;
      root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();line=e.currentTarget.elements.line.value;void load();});
      root.querySelector('select').addEventListener('change',e=>{line=e.target.value;generation++;entries=[];selected=null;selectedEntry=null;root.querySelector('[data-period-results]').replaceChildren();showSelected();});
      root.querySelectorAll('[data-history-mode]').forEach(button=>button.addEventListener('click',()=>chooseTab(button.dataset.historyMode)));
      chooseTab('today');
    }else summary();
  }
  return {render,clear(){disposed=true;generation++;root.replaceChildren();}};
}
