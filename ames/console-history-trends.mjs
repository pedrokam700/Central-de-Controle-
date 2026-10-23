import {createHistoryTrendReader,compareHistoryDays,historyWeekSummary,shiftDay} from './data/history-trends.mjs';
import {factoryWallMinute} from './data/history.mjs';
import {formatFactoryDate,formatFactoryDateTime} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const number=x=>x===null||x===undefined?'—':Number.isInteger(x)?String(x):x.toFixed(2);
const statuses=()=>({complete:t('Completo','Complete'),partial:t('Parcial','Partial'),not_collected:t('Não coletado','Not collected'),unproven_full:t('FULL não comprovado','FULL unproven'),source_conflict:t('Conflito de origem','Source conflict'),unavailable:t('Indisponível','Unavailable')});
export function withHistoricalTrends(view,root,store,history){
 if(!history)return view;
 const reader=createHistoryTrendReader(history);let host,scope='',result=null,error='',busy=false,generation=0,days=root?.dataset?.consolePane==='reuse'?93:30,source='',filters={},metric='fpy',fullOnly=false,paintKey='',autoStarted=false;
 const context=()=>{const line=store.context?.().line_id||store.preferredLine(),snapshot=store.read(line).snapshot;
  const end=factoryWallMinute(store.readingPeriod?.().end),start=factoryWallMinute(store.readingPeriod?.().start);
  return {line,endDate:end?(end.endsWith('T07:00')?shiftDay(end.slice(0,10),-1):end.slice(0,10)):start?.slice(0,10),snapshot};};
 function renderPanel(){
  const c=context(),key=JSON.stringify([c.line,c.endDate,c.snapshot?.source_id]);
  if(key!==scope){scope=key;generation++;result=null;error='';busy=false;autoStarted=false;source=c.snapshot?.source_id||'';filters={};}
  const nextPaint=JSON.stringify([scope,generation,busy,error,days,source,filters,fullOnly,document.documentElement.lang]);
  if(host&&root.contains(host)&&nextPaint===paintKey)return;paintKey=nextPaint;
  if(!host||!root.contains(host)){host=document.createElement('section');host.className='mes-context-panel';host.dataset.historyTrends='';host.setAttribute('data-no-i18n','');root.append(host);}
  const sources=[...new Set([source,...(result?.sources||[])].filter(Boolean))];
  host.innerHTML=`<h3>${t('Tendências do histórico salvo','Stored history trends')}</h3><p>${t('Leitura sem MES. Uma revisão por dia e origem; dias ausentes ficam como lacunas. Associação de reuso não prova impacto causal no FPY.','Read without MES. One revision per day and source; missing days remain gaps. Reuse association does not prove causal impact on FPY.')}</p>
  <form data-history-trend-form class="ames-toolbar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end"><label>${t('Janela','Window')} <select name="days">${[7,30,93].map(n=>`<option value="${n}"${days===n?' selected':''}>${n} ${t('dias','days')}</option>`).join('')}</select></label>
  <label>${t('Origem','Source')} <select name="source"><option value="">${t('Detectar conflitos','Detect conflicts')}</option>${sources.map(s=>`<option value="${esc(s)}"${source===s?' selected':''}>${esc(s)}</option>`).join('')}</select></label>
  ${[['product','CPH'],['sn','Material SN'],['part_number','Part number'],['item_type',t('Tipo','Type')]].map(([name,label])=>`<label>${label}<input name="${name}" value="${esc(filters[name]||'')}"></label>`).join('')}
  <label><input type="checkbox" name="fullOnly"${fullOnly?' checked':''}> ${t('Somente fechamentos FULL comprovados','Proven FULL closures only')}</label>
  <button class="button secondary" type="submit"${busy?' disabled':''}>${busy?t('Lendo…','Reading…'):t('Ver histórico salvo','Read stored history')}</button></form>
  ${error?`<p role="alert">${esc(error)}</p>`:''}<div data-history-trend-result></div>`;
  async function readHistory(){
   const token=++generation;busy=true;error='';renderPanel();
   try{const read=await reader.read({...c,source,days,filters,requireFullClosure:fullOnly});if(token===generation)result=read;}
   catch(err){if(token===generation){result=null;error=err.message;}}
   finally{if(token===generation){busy=false;renderPanel();}}
  }
  host.querySelector('form').addEventListener('submit',e=>{
   e.preventDefault();const form=new FormData(e.currentTarget);days=Number(form.get('days'));source=form.get('source');fullOnly=form.get('fullOnly')==='on';filters=Object.fromEntries(['product','sn','part_number','item_type'].map(k=>[k,String(form.get(k)||'').trim()]));
   autoStarted=true;void readHistory();
  });
  if(result)paintResult();
  // Historical trends load on first entry, including 93 days (3+ months) for
  // reuse. Missing days remain gaps and no MES collection is triggered.
  if(!autoStarted){autoStarted=true;const activeScope=scope;queueMicrotask(()=>{if(activeScope===scope&&!busy&&!result&&!error)void readHistory();});}
 }
 function paintResult(){
  const {points}=result,c=context(),target=host.querySelector('[data-history-trend-result]'),loaded=points.filter(p=>p.snapshot),current=points.at(-1),previous=loaded.filter(p=>p.date<current.date&&p.quantity>0).at(-1),comparison=compareHistoryDays(current,previous),weeks=historyWeekSummary(points,c.endDate);
  target.innerHTML=`<p>${loaded.length}/${points.length} ${t('dias com dados; demais não coletados ou indisponíveis. Filtros retiram agregados sem denominador correspondente.','days with data; others not collected or unavailable. Filters remove aggregates without a matching denominator.')}</p>
  ${fullOnly?`<p class="mes-context">${t('Modo FULL: usa somente 3028 + 3074 + 2114 + 3022 integralmente comprovados. Revisão parcial posterior não rebaixa a última FULL; sem prova, o dia permanece lacuna.','FULL mode: only proven complete 3028 + 3074 + 2114 + 3022. A later partial revision does not replace the last FULL; missing proof stays a gap.')}</p>`:''}
  <p>${t('Dia selecionado × último dia produtivo armazenado','Selected day × last stored production day')}: ${previous?esc(formatFactoryDate(previous.date)):'—'} · Δ FPY ${number(comparison.fpy_delta)} pp · Δ ${t('ocorrências observadas','observed occurrences')} ${number(comparison.observed_failure_delta)}${comparison.comparable?'':` · ${t('recortes não comparáveis','slices not comparable')}`}</p>
  <p>${t('Semana atual / anterior · ocorrências observadas (dias lidos)','Current / previous week · observed occurrences (days read)')}: ${number(weeks.current.observed_failures)} (${weeks.current.observed_days}/${weeks.current.expected_days}) / ${number(weeks.previous.observed_failures)} (${weeks.previous.observed_days}/${weeks.previous.expected_days}). ${t('FPY semanal não calculado sem numeradores completos. Dias não coletados não valem zero.','Weekly FPY unavailable without complete numerators. Uncollected days are not zero.')}</p>
  <label>${t('Gráfico','Chart')} <select data-history-chart-metric>${[['fpy','FPY'],['check_fpy','Check FPY'],['observed_failures',t('Ocorrências observadas','Observed occurrences')],['pcba_reused',t('PCBAs reutilizadas observadas','Observed reused PCBAs')],['component_associated',t('Componentes reutilizados associados','Associated reused components')]].map(([key,label])=>`<option value="${key}"${metric===key?' selected':''}>${label}</option>`).join('')}</select></label><div data-history-chart></div>
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
  });
 }
 function chart(points){
  const finite=points.map(p=>p[metric]).filter(v=>typeof v==='number'&&Number.isFinite(v)),max=Math.max(1,...finite),width=680,height=160,x=i=>24+i*632/Math.max(1,points.length-1),y=v=>140-v/max*116;
  // Separate segments around gaps: no invented zeros or interpolation over missing days.
  let previous=null;const shapes=[];
  points.forEach((p,i)=>{const v=p[metric];if(typeof v!=='number'||!Number.isFinite(v)){previous=null;return;}
   if(previous)shapes.push(`<line x1="${previous.x}" y1="${previous.y}" x2="${x(i)}" y2="${y(v)}" stroke="currentColor"/>`);
   shapes.push(`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="currentColor"><title>${esc(p.date)}: ${number(v)} · ${statuses()[p.status]}</title></circle>`);previous={x:x(i),y:y(v)};
  });
  host.querySelector('[data-history-chart]').innerHTML=`<svg role="img" aria-label="${esc(metric)} · ${t('lacunas preservadas','gaps preserved')}" viewBox="0 0 ${width} ${height}" style="width:100%;max-width:900px"><text x="0" y="16" fill="currentColor">${number(max)}</text><text x="0" y="144" fill="currentColor">0</text>${shapes.join('')}</svg>`;
 }
 return {render(){view.render();renderPanel();},clear(){generation++;reader.clear();view.clear?.();host=null;result=null;scope='';}};
}
