import {escapeHtml as esc} from './evidence-view.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';

const text=value=>String(value??'').trim();
const choose=(en,pt,eng)=>en?eng:pt;
const display=value=>text(value)||'—';

export function mountingScopeDetails(scope={},locale='pt-BR'){
  const en=String(locale).startsWith('en');
  const items=scope.component_usage||[];
  const provenReuse=items.filter(item=>item.is_reused===true);
  const incomplete=items.filter(item=>item.is_reused===null||item.is_reused===undefined).length;
  const count=Number.isInteger(scope.reused_count)?scope.reused_count:null;
  const summary=count===null
    ?choose(en,'Reuso não totalmente verificado','Reuse not fully verified')
    :`${count} ${choose(en,'materiais de 2º+ uso comprovados','proven 2nd+ use materials')}`;
  const note=incomplete
    ?`<p class="notice warn">${incomplete} ${choose(en,'consulta(s) de Material SN incompletas. Zero não comprovado.','incomplete Material SN queries. Zero is unproven.')}</p>`
    :'';
  const rows=items.length?`<ul class="ames-mounting-materials">${items.map(item=>{
    const status=item.is_reused===true?choose(en,'2º+ uso comprovado','2nd+ use proven'):
      item.is_reused===false?choose(en,'Sem reuso anterior encontrado nesta cobertura','No prior reuse in this coverage'):
      choose(en,'Reuso indeterminado','Reuse unverified');
    const previous=(item.previous_pcbas||[]).join(', ');
    return `<li><b>${esc(display(item.item_type))}</b> · <strong>${esc(display(item.item_sn))}</strong>
      <span class="status ${item.is_reused===true?'warn':''}">${status}</span>
      <small>${choose(en,'Usos comprovados','Proven uses')}: ${esc(display(item.known_use_count))} ·
      ${choose(en,'PCBAs anteriores','Previous PCBAs')}: ${esc(previous||'—')}</small>
      ${item.error?`<small class="notice warn">${choose(en,'Falha de coleta 3074; esta peça não pode ser classificada.','3074 collection failed; this item cannot be classified.')}</small>`:''}</li>`;
  }).join('')}</ul>`:`<p>${choose(en,'Nenhum material classificado neste recorte. Isto não comprova ausência de material ou de reuso.','No material classified in this scope; this does not prove absence of components or reuse.')}</p>`;
  return `<p><b>${esc(summary)}</b> · ${items.length} ${choose(en,'materiais examinados','materials checked')}</p>${note}${rows}`;
}

export function renderSnMountingViews(result={},locale='pt-BR',mode='compare'){
  if(result.detected_type!=='PCBA')return '';
  const scopes=result.trace_3074?.mounting_views;
  if(!scopes)return '';
  const en=String(locale).startsWith('en');
  const c=choose.bind(null,en);
  const current=scopes.current||{},failure=scopes.last_failure||{},diff=scopes.comparison||{};
  const reusedFailure=(failure.reused_components||[]).length;
  const historicalAlarm=reusedFailure?`<div class="notice warn"><b>${c('Reuso identificado na montagem da última falha','Reuse identified in the last-failure mounting')}: ${reusedFailure}</b>
    <p>${c('Não confundir com os materiais da montagem atual. Histórico de vínculos não demonstra causa da falha.','Do not mix with the current mounting. Binding history does not prove failure causation.')}</p></div>`:'';
  const confidence=failure.status==='no_2114_anchor'
    ?`<div class="notice warn">${c('Última falha 2114 sem horário comprovado; montagem histórica indeterminada.','Last 2114 failure time unavailable; historical mounting unverified.')}</div>`:'';
  const option=(id,label)=>`<button type="button" class="button ${mode===id?'primary':'secondary'}" data-sn-mounting-mode="${id}" aria-pressed="${mode===id}">${label}</button>`;
  const scopeCard=(title,info)=>`<section class="mes-context-panel ames-mounting-scope"><h4>${title}</h4>${mountingScopeDetails(info,locale)}</section>`;
  const currentCard=scopeCard(c('Montagem atual (3074 · Y aberto)','Current mounting (3074 · open Y)'),current);
  const failureCard=scopeCard(c('Montagem no instante da última falha (3074 + 2114)','Mounting at last failure (3074 + 2114)'),failure);
  const compare=`<p class="mes-context">${c('Somente atuais','Current only')}: ${(diff.only_current||[]).length} ·
    ${c('Somente da última falha','Last failure only')}: ${(diff.only_last_failure||[]).length} ·
    ${c('Nas duas montagens','In both mountings')}: ${(diff.in_both||[]).length}</p>
    <div class="ames-mounting-columns">${currentCard}${failureCard}</div>`;
  const inner=mode==='current'?currentCard:mode==='failure'?failureCard:compare;
  return `<section class="mes-context-panel ames-sn-mounting-compare" data-sn-mounting-views data-active-scope="${esc(mode)}" data-no-i18n>
    <div class="section-head"><div><h3>${c('3074 · Montagem atual × última falha','3074 · Current mounting × last failure')}</h3>
    <p>${c('Duas fotografias temporais da MES; nenhum indicador mistura as montagens.','Two temporal MES views; no metric mixes assemblies.')}
    ${failure.defect_time?` · 2114: ${esc(formatFactoryDateTime(failure.defect_time))}`:''}</p></div></div>
    <div class="mes-pagination">${option('compare',c('Comparar ambas','Compare both'))}${option('current',c('Somente atual','Current only'))}${option('failure',c('Última falha','Last failure'))}</div>
    ${historicalAlarm}${confidence}<div data-sn-mounting-content>${inner}</div>
  </section>`;
}
