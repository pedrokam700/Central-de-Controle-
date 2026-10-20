import {createHistoryTrendReader,compareHistoryDays,historyWeekSummary,shiftDay} from './data/history-trends.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {formatFactoryDate,formatFactoryDateTime} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const number=x=>x===null||x===undefined?'—':Number.isInteger(x)?String(x):x.toFixed(2);
const statuses=()=>({complete:t('Completo','Complete'),partial:t('Parcial','Partial'),not_collected:t('Não coletado','Not collected'),source_conflict:t('Conflito de origem','Source conflict'),unavailable:t('Indisponível','Unavailable')});
export function withHistoricalTrends(view,root,store,history,{automatic=false,defaultDays=7}={}){
 if(!history)return view;
 const reader=createHistoryTrendReader(history);let host,scope='',result=null,error='',busy=false,generation=0,days=defaultDays,source='',filters={},metric=automatic?'component_associated':'fpy',paintKey='',autoScope='';
 const context=()=>{const line=store.context?.().line_id||store.preferredLine(),snapshot=store.read(line).snapshot;
  const end=factoryWallMinute(store.readingPeriod?.().end),start=factoryWallMinute(store.readingPeriod?.().start);
  return {line,endDate:end?(end.endsWith('T07:00')?shiftDay(end.slice(0,10),-1):end.slice(0,10)):start?.slice(0,10),snapshot};};
 function renderPanel(){
  const c=context(),key=JSON.stringify([c.line,c.endDate,c.snapshot?.source_id]);
  if(key!==scope){scope=key;generation++;result=null;error='';busy=false;source=c.snapshot?.source_id||'';filters={};}
  const nextPaint=JSON.stringify([scope,generation,busy,error,days,source,filters,document.documentElement.lang]);
  if(host&&root.contains(host)&&nextPaint===paintKey)return;paintKey=nextPaint;
  if(!host||!root.contains(host)){host=document.createElement('section');host.className='mes-context-panel';host.dataset.historyTrends='';host.setAttribute('data-no-i18n','');root.append(host);}
  const sources=[...new Set([source,...(result?.sources||[])].filter(Boolean))];
  host.innerHTML=`<h3>${t('Tendências do histórico salvo','Stored history trends')}</h3><p>${t('Leitura sem MES. Uma revisão por dia e origem; dias ausentes ficam como lacunas. Associação de reuso não prova impacto causal no FPY.','Read without MES. One revision per day and source; missing days remain gaps. Reuse association does not prove causal impact on FPY.')}</p>
  <form data-history-trend-form class="ames-toolbar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end"><label>${t('Janela','Window')} <select name="days">${[7,30,92].map(n=>`<option value="${n}"${days===n?' selected':''}>${n} ${t('dias','days')}</option>`).join('')}</select></label>
  <label>${t('Origem','Source')} <select name="source"><option value="">${t('Detectar conflitos','Detect conflicts')}</option>${sources.map(s=>`<option value="${esc(s)}"${source===s?' selected':''}>${esc(s)}</option>`).join('')}</select></label>
  ${[['product','CPH'],['defect',t('Defeito','Defect')],['sn','Material SN'],['part_number','Part number'],['item_type',t('Tipo','Type')]].map(([name,label])=>`<label>${label}<input name="${name}" value="${esc(filters[name]||'')}"></label>`).join('')}
  <label>População <select name="population"><option value="">PCBA + materiais</option><option value="pcba">PCBA principal</option><option value="component">Componente físico</option></select></label>
  <label>Resultado <select name="outcome"><option value="">Todos os observados</option><option value="failed">PCBA com falha</option><option value="associated">Componente associado a falha</option><option value="prior_failure">Com falha anterior</option><option value="verified_no_failure">Sem falha comprovada</option><option value="unknown">Não comprovado</option></select></label>
  <button class="button secondary" type="submit"${busy?' disabled':''}>${busy?t('Lendo…','Reading…'):t('Ver histórico salvo','Read stored history')}</button></form>
  ${error?`<p role="alert">${esc(error)}</p>`:''}<div data-history-trend-result></div>`;
  for(const name of ['population','outcome'])host.querySelector('[name='+name+']').value=filters[name]||'';
  host.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();const form=new FormData(e.currentTarget);days=Number(form.get('days'));source=form.get('source');filters=Object.fromEntries(['product','defect','sn','part_number','item_type','population','outcome'].map(k=>[k,String(form.get(k)||'').trim()]));
   const token=++generation;busy=true;error='';renderPanel();
   try{const read=await reader.read({...c,source,days,filters});if(token===generation)result=read;}
   catch(err){if(token===generation){result=null;error=err.message;}}
   finally{if(token===generation){busy=false;renderPanel();}}
  });
  if(result)paintResult();
  if(automatic&&scope!==autoScope&&!busy){autoScope=scope;queueMicrotask(()=>host?.querySelector('form')?.requestSubmit());}
 }
 function paintResult(){
  const {points}=result,c=context(),target=host.querySelector('[data-history-trend-result]'),loaded=points.filter(p=>p.snapshot),current=points.at(-1),previous=loaded.filter(p=>p.date<current.date&&p.quantity>0).at(-1),comparison=compareHistoryDays(current,previous),weeks=historyWeekSummary(points,c.endDate);
  target.innerHTML=`<p>${loaded.length}/${points.length} ${t('dias com dados; demais não coletados ou indisponíveis. Filtros retiram agregados sem denominador correspondente.','days with data; others not collected or unavailable. Filters remove aggregates without a matching denominator.')}</p>
  <p>${t('Dia selecionado × último dia produtivo armazenado','Selected day × last stored production day')}: ${previous?esc(formatFactoryDate(previous.date)):'—'} · Δ FPY ${number(comparison.fpy_delta)} pp · Δ ${t('ocorrências observadas','observed occurrences')} ${number(comparison.observed_failure_delta)}${comparison.comparable?'':` · ${t('recortes não comparáveis','slices not comparable')}`}</p>
  <p>${t('Semana atual / anterior · ocorrências observadas (dias lidos)','Current / previous week · observed occurrences (days read)')}: ${number(weeks.current.observed_failures)} (${weeks.current.observed_days}/${weeks.current.expected_days}) / ${number(weeks.previous.observed_failures)} (${weeks.previous.observed_days}/${weeks.previous.expected_days}). ${t('FPY semanal não calculado sem numeradores completos. Dias não coletados não valem zero.','Weekly FPY unavailable without complete numerators. Uncollected days are not zero.')}</p>
  <label>${t('Gráfico','Chart')} <select data-history-chart-metric>${[['fpy','FPY'],['check_fpy','Check FPY'],['observed_failures',t('Ocorrências observadas','Observed occurrences')],['pcba_reused',t('PCBAs reutilizadas observadas','Observed reused PCBAs')],['component_associated',t('Componentes reutilizados associados','Associated reused components')],['pcba_prior_failure',t('PCBA 2º+ com falha anterior','Reused PCBA with prior failure')],['component_verified_no_failure',t('Componentes sem falha comprovada','Components with verified no failure')],['component_failure_rate',t('Taxa com denominador comprovado','Rate with proven denominator')]].map(([key,label])=>`<option value="${key}"${metric===key?' selected':''}>${label}</option>`).join('')}</select></label><div data-history-chart></div>
  <div class="table-wrap"><table><thead><tr>${[t('Dia','Day'),t('Cobertura','Coverage'),'FPY','Check FPY',t('Produção','Production'),t('Ocorrências','Occurrences'),t('Ocorrências / 1000','Occurrences / 1000'),t('PCBA 2º+','PCBA 2nd+'),t('Componentes 2º+','Components 2nd+'),t('Revisão','Revision')].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${points.map((p,i)=>`<tr data-history-day="${esc(p.date)}"><td>${p.snapshot?`<button class="button secondary" data-history-day-open="${i}">${esc(formatFactoryDate(p.date))}</button>`:esc(formatFactoryDate(p.date))}</td><td>${statuses()[p.status]}${p.error?': '+esc(p.error):''}</td>${['fpy','check_fpy','quantity','observed_failures','occurrences_per_1000','pcba_reused','component_reused'].map(k=>`<td>${number(p[k])}</td>`).join('')}<td>${p.entry?esc(p.entry.snapshot_id)+' / r'+esc(p.entry.snapshot_revision):'—'}</td></tr>`).join('')}</tbody></table></div><div data-history-day-detail></div>`;
  const incompatibleWeeks=weeks.current.scope_mixed||weeks.previous.scope_mixed||
   (weeks.current.scope_key&&weeks.previous.scope_key&&weeks.current.scope_key!==weeks.previous.scope_key);
  if(incompatibleWeeks){
   const warning=document.createElement('p');warning.setAttribute('role','status');warning.dataset.weekScopeWarning='';
   warning.textContent=t('Atenção: dias com CPH ou origem diferente/indeterminada. Totais observados são descritivos, não uma comparação homogênea entre semanas.','Warning: different or unknown CPH/source across dates. Observed totals are descriptive, not a like-for-like weekly comparison.');
   target.prepend(warning);
  }
  target.querySelector('[data-history-chart-metric]').addEventListener('change',e=>{metric=e.target.value;chart(points);});chart(points);
  for(const button of target.querySelectorAll('[data-history-day-open]'))button.addEventListener('click',()=>{
   const p=points[Number(button.dataset.historyDayOpen)],detail=target.querySelector('[data-history-day-detail]');
   detail.innerHTML=`<h4>${esc(formatFactoryDate(p.date))} · ${esc(p.entry.history_source||'—')}</h4><p>${esc(p.entry.source_id)} / ${esc(p.entry.snapshot_id)} / r${esc(p.entry.snapshot_revision)} · ${esc(formatFactoryDateTime(p.snapshot.collected_at))}</p><p>${t('Revisão lida, sem trocar o período global ou publicar dados.','Read revision, without changing the global period or publishing data.')}</p><div class="table-wrap"><table><thead><tr><th>PCBA</th><th>CPH</th><th>${t('Falha','Failure')}</th><th>${t('Registro MES','MES record')}</th><th>ID</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td>${esc(r.pcba_sn)}</td><td>${esc(r.product_key)}</td><td>${esc(r.defect_desc)} · ${esc(r.defect_code)}</td><td>${esc(formatFactoryDateTime(r.defect_time))}</td><td>${esc(r.occurrence_id||r.evidence_ref)}</td></tr>`).join('')}</tbody></table></div>`;
   const population=document.createElement('div');population.dataset.historyPopulationDetail='';
   population.innerHTML='<p>Universo populacional não comprovado · denominador: — · taxa: —. Vínculo 3074 não comprova causa.</p>'+['pcbas','components'].map(kind=>'<h5>'+(kind==='pcbas'?'PCBA principal':'Componentes físicos')+'</h5>'+p.cohorts[kind].rows.map(r=>'<details><summary>'+esc(r.sn)+' · '+esc(r.item_type||'PCBA')+' · '+esc(r.use_index||'—')+'º uso</summary><p>'+esc(r.outcome)+' · '+r.events.length+' ocorrência(s) associada(s) · '+r.prior_events.length+' anterior(es)</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify({previous_pcbas:r.previous_pcbas,events:r.events,prior_events:r.prior_events,evidence:r.evidence},null,2))+'</pre></details>').join('')).join('');detail.append(population);
  });
 }
 function chart(points){
  const finite=points.map(p=>p[metric]).filter(v=>typeof v==='number'&&Number.isFinite(v)),max=Math.max(1,...finite),width=680,height=160,x=i=>24+i*632/Math.max(1,points.length-1),y=v=>140-v/max*116;
  // Separate segments around gaps: no invented zeros or interpolation over missing days.
  let previous=null;const shapes=[];
  points.forEach((p,i)=>{const v=p[metric];if(typeof v!=='number'||!Number.isFinite(v)){previous=null;return;}
   if(previous)shapes.push(`<line x1="${previous.x}" y1="${previous.y}" x2="${x(i)}" y2="${y(v)}" stroke="currentColor"/>`);
   shapes.push(`<circle data-history-chart-point="${i}" tabindex="0" role="button" aria-label="${esc(p.date)}" cx="${x(i)}" cy="${y(v)}" r="4" fill="currentColor"><title>${esc(p.date)}: ${number(v)} · ${statuses()[p.status]}</title></circle>`);previous={x:x(i),y:y(v)};
  });
  host.querySelector('[data-history-chart]').innerHTML=`<svg role="img" aria-label="${esc(metric)} · ${t('lacunas preservadas','gaps preserved')}" viewBox="0 0 ${width} ${height}" style="width:100%;max-width:900px"><text x="0" y="16" fill="currentColor">${number(max)}</text><text x="0" y="144" fill="currentColor">0</text>${shapes.join('')}</svg>`;
  for(const dot of host.querySelectorAll('[data-history-chart-point]')){const open=()=>host.querySelector('[data-history-day-open="'+dot.dataset.historyChartPoint+'"]')?.click();dot.addEventListener('click',open);dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});}
 }
 return {render(){view.render();renderPanel();},clear(){generation++;reader.clear();view.clear?.();host=null;result=null;scope='';}};
}
