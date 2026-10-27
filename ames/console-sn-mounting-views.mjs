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

export function renderHistorical3074ReuseAudit(scopes={},locale='pt-BR'){
  const en=String(locale).startsWith('en'),c=choose.bind(null,en);
  const found=Array.isArray(scopes.historical_material_reuse)?scopes.historical_material_reuse:[];
  const total=Number(scopes.historical_probe_total)||0;
  const remaining=Number(scopes.historical_probe_remaining)||0;
  if(!found.length&&!total)return '';
  const knownReused=found.filter(x=>x.is_reused===true).length;
  const unknown=found.filter(x=>x.is_reused==null).length;
  const status=x=>x.is_reused===true
    ?c('Vinculado a outra PCBA comprovada (histórico geral)','Linked to another proven PCBA (full history)')
    :x.is_reused===false
      ?c('Nenhuma outra PCBA na cobertura confirmada','No other PCBA in verified coverage')
      :c('Investigação parcial/indeterminada','Partial/unverified investigation');
  const items=found.map(x=>{
    const history=(x.previous_pcba_failures_2114||[]);
    const correlated=history.flatMap(older=>(older.failures||[]).map(f=>({older,f})))
      .filter(x=>['MESMA_FALHA','FALHA_SIMILAR'].includes(x.f.relation_to_board_reference));
    const historyHtml=history.length?`<details data-sn-historical-material-failures>
      <summary>${c('Falhas das PCBAs anteriores · 2114','Previous PCBAs failures · 2114')} · ${history.reduce((sum,p)=>sum+(p.failures||[]).length,0)}</summary>
      <small>${c('Comparação com a última falha conhecida da placa consultada. Sem prova de vínculo do componente naquele instante, não atribuímos falha à peça nem emitimos alerta causal.','Comparison with the last known board failure. Without proof the component was bound at the defect instant, no defect is assigned to the part and no causal alert is raised.')}</small>
      <ul class="ames-mounting-materials">${history.flatMap(older=>
        older.status!=='COMPLETE'?
          [`<li>${esc(display(older.pcba_sn))} · ${c('2114 não coletada','2114 not collected')}</li>`]:
          (older.failures||[]).map(f=>`<li><b>${esc(display(older.pcba_sn))}</b> ·
          ${esc(display(f.defect_code))} · ${esc(display(f.defect_desc))}
          <small>Hist Seq: ${esc(display(f.hist_seq))} · 2114: ${esc(display(f.defect_time))}
          · ${c('Tipo de análise','Analysis type')}: ${esc(display(f.defect_type))}
          · ${c('Comparação','Comparison')}: ${esc(display(f.relation_to_board_reference))}</small></li>`))
        ).join('')}</ul>
      </details>`:'';
    return `<li><b>${esc(display(x.item_type))}</b> ·
    <strong>${esc(display(x.item_sn))}</strong> · ${esc(status(x))}
    <small>${c('PCBAs conhecidas','Known PCBAs')}: ${esc(display(x.known_use_count_min))}
    · ${c('Outras PCBAs','Other PCBAs')}: ${esc((x.other_pcbas||[]).join(', ')||'—')}
    ${x.source_partial?c(' · Cobertura parcial',' · Partial coverage'):''}
    ${x.error_kind?` · ${esc(x.error_kind)}`:''}</small>
    ${correlated.length?`<small>${correlated.length} ${c('comparações de mesma falha/família nas PCBAs anteriores; atribuição temporal não comprovada','same-fault/family comparisons on prior PCBAs; temporal attribution unproven')}</small>`:''}
    ${historyHtml}
    <button type="button" class="button secondary" data-sn-open-material="${esc(x.item_sn)}">${c('Investigar este material','Investigate this material')}</button></li>`;
  }).join('');
  return `<details data-sn-3074-historical-reuse-audit>
    <summary>${c('Segundo uso no histórico 3074 — sem atribuição à falha','Historical 3074 reuse — not attributed to failure')}
      · ${knownReused} ${c('confirmados entre','proven among')} ${found.length}
      ${unknown?` · ${unknown} ${c('indeterminados','unknown')}`:''}</summary>
    <p class="mes-context">${c('Estas peças tiveram vínculo registrado em algum momento com a PCBA consultada. O histórico de outra PCBA não prova que a peça estava montada na última falha nem que causou a falha. Não somar às contagens atual/última falha.','These parts were linked at some time to the queried board. Another PCBA does not prove mounting at last failure or its cause. Do not add these to current/last-failure counts.')}</p>
    <p class="mes-context">${c('Consultas históricas nesta coleta','Historical probes this run')}: ${found.length} ·
    ${c('Outros materiais não consultados automaticamente','Other materials not automatically scanned')}: ${remaining}.
    ${c('Para os demais, use o histórico de vínculos abaixo.','For others, use the binding history below.')}</p>
    <ul class="ames-mounting-materials">${items}</ul></details>`;
}

export function renderSnMountingViews(result={},locale='pt-BR',mode='compare'){
  if(result.detected_type!=='PCBA')return '';
  const scopes=result.trace_3074?.mounting_views;
  if(!scopes)return '';
  const en=String(locale).startsWith('en');
  const c=choose.bind(null,en);
  const current=scopes.current||{},failure=scopes.last_failure||{},diff=scopes.comparison||{};
  const query=result.trace_3074?.query||{};
  const rawRows=Array.isArray(query.rows)?query.rows:[];
  const counts={Y:0,N:0,other:0};
  for(const item of rawRows){
    const value=text(item?.['Iss Status']).toUpperCase();
    counts[value==='Y'?'Y':value==='N'?'N':'other']++;
  }
  const coverage=rawRows.length
    ?`${c('3074 retornou','3074 returned')} ${rawRows.length} ${c('linhas','rows')} ·
       Y: ${counts.Y} · N: ${counts.N} · ${c('sem status','unknown status')}: ${counts.other}`
    :query.no_data===true
      ?c('3074 confirmou grade vazia nesta consulta; isso não comprova ausência em outras montagens.','3074 confirmed an empty grid for this query; other mounts are not ruled out.')
      :c('3074 não comprovou linhas utilizáveis nesta consulta; investigar a fonte antes de classificar reuso.','3074 has not proven usable rows in this query; check the source before classifying reuse.');
  // Both historical N and ambiguous current Y are evidence worth inspecting,
  // not proof that a material was installed at the most recent 2114 failure.
  const originalHistory=Array.isArray(scopes.history_audit)?scopes.history_audit:[];
  const uncertain=[...(current.candidates||[]),...(failure.candidates||[])];
  const key=item=>[text(item.item_sn),text(item.bind_time_utc),text(item.unbind_time_utc),text(item.iss_status_now)].join('|');
  const seen=new Set();
  const history=[...originalHistory,...uncertain].filter(item=>{
    const k=key(item);if(seen.has(k))return false;seen.add(k);return true;
  });
  const historyItems=history.slice(0,80).map(item=>`<li><b>${esc(display(item.item_type))}</b> · ${esc(display(item.item_sn))}
    <small>${c('Status na consulta','Status at query')}: ${esc(display(item.iss_status_now))} ·
    Bind: ${esc(display(item.bind_time_utc))} · Unbind: ${esc(display(item.unbind_time_utc))} ·
    ${c('Posto','Station')}: ${esc(display(item.binding_operation))}</small>
    ${item.item_sn?`<button class="button secondary" type="button" data-sn-open-material="${esc(item.item_sn)}">${c('Investigar este material','Investigate this material')}</button>`:''}</li>`).join('');
  const historyAudit=history.length?`<details data-sn-3074-history-audit><summary>${c('Vínculos históricos ou temporais incertos (somente auditoria)','Historical or time-uncertain bindings (audit only)')} · ${history.length}</summary>
    <p class="mes-context">${c('Vínculos N, Y incertos ou temporais ambíguos. Não demonstram por si só montagem na falha nem uso em outra PCBA. Para investigar reuso, selecione individualmente a Material SN.','N, uncertain Y or time-ambiguous links. Not proof of mounting at failure or another PCBA use. Investigate each material SN independently.')}</p>
    <ul class="ames-mounting-materials">${historyItems}</ul>
    ${history.length>80?`<small>${c('Prévia de 80 vínculos; histórico bruto completo permanece na fonte 3074.','Preview of 80 bindings; full raw history remains in source 3074.')} (${history.length})</small>`:''}
    </details>`:'';
  const reusedFailure=(failure.reused_components||[]).length;
  const historicalAlarm=reusedFailure?`<div class="notice warn"><b>${c('Reuso identificado na montagem da última falha','Reuse identified in the last-failure mounting')}: ${reusedFailure}</b>
    <p>${c('Não confundir com os materiais da montagem atual. Histórico de vínculos não demonstra causa da falha.','Do not mix with the current mounting. Binding history does not prove failure causation.')}</p></div>`:'';
  const confidence=failure.status==='no_2114_anchor'
    ?`<div class="notice warn">${c('Última falha 2114 sem horário comprovado; montagem histórica indeterminada.','Last 2114 failure time unavailable; historical mounting unverified.')}</div>`:'';
  // Comparison is meaningful only if a post-2114 Y mounting PROVES a
  // distinct cycle. Otherwise both cards describe one investigative cycle.
  const hasNewCycle=current.status==='current_new_cycle';
  const hasProvenCurrent=['current_new_cycle','current_same_cycle','current_cycle_unanchored'].includes(current.status);
  const hasFailureMounting=Array.isArray(failure.components)&&failure.components.length>0;
  const option=(id,label)=>`<button type="button" class="button ${mode===id?'primary':'secondary'}" data-sn-mounting-mode="${id}" aria-pressed="${mode===id}">${label}</button>`;
  const scopeCard=(title,info)=>`<section class="mes-context-panel ames-mounting-scope"><h4>${title}</h4>${mountingScopeDetails(info,locale)}</section>`;
  const currentCard=scopeCard(c('Montagem atual comprovada (3074 · Y)','Verified current mounting (3074 · Y)'),current);
  const failureCard=scopeCard(c('Montagem comprovada na última falha (3074 + 2114)','Verified last-failure mounting (3074 + 2114)'),failure);
  const compare=`<p class="mes-context">${c('Somente atuais','Current only')}: ${(diff.only_current||[]).length} ·
    ${c('Somente da última falha','Last failure only')}: ${(diff.only_last_failure||[]).length} ·
    ${c('Nas duas montagens','In both mountings')}: ${(diff.in_both||[]).length}</p>
    <div class="ames-mounting-columns">${currentCard}${failureCard}</div>`;
  const recent=[...history].sort((a,b)=>text(b.bind_time_utc).localeCompare(text(a.bind_time_utc))).slice(0,5);
  const recentReference=recent.length?`<section class="mes-context-panel" data-sn-3074-last-known>
    <h4>${c('Últimos vínculos conhecidos · referência investigativa','Latest known bindings · investigation reference')}</h4>
    <p class="mes-context">${c('Sem montagem Y posterior comprovada. A última montagem conhecida é a referência da investigação; vínculo N atual não prova que a peça continua instalada ou que estava presente na falha sem horário 2114.','No proven later Y assembly. The last known mounting is the investigation reference; an N status today does not prove current physical presence or mounting at a 2114 failure without timestamp.')}</p>
    <ul class="ames-mounting-materials">${recent.map(x=>`<li><b>${esc(display(x.item_type))}</b> ·
      <strong>${esc(display(x.item_sn))}</strong> · ${c('Vínculo iniciado','Bound at')}: ${esc(display(x.bind_time_utc))}
      · ${c('Desvinculado','Unbound at')}: ${esc(display(x.unbind_time_utc))}</li>`).join('')}</ul>
    <small>${c('Exibição de referência, não contagem de reuso; o restante está no histórico 3074 abaixo.','Reference only, not a reuse count; other links remain in the 3074 audit below.')}</small>
    </section>`:'';
  const reference=hasProvenCurrent?
    scopeCard(c('Montagem do ciclo investigado (3074 · Y)','Investigated cycle mounting (3074 · Y)'),current):
    hasFailureMounting?scopeCard(c('Última montagem da falha comprovada (3074 + 2114)','Last proven failure mounting (3074 + 2114)'),failure):
    recentReference||`<p class="mes-context">${c('Nenhuma montagem temporalmente comprovada; consulte vínculos da 3074.','No temporally proven mounting; inspect 3074 binding history.')}</p>`;
  const inner=hasNewCycle?(mode==='current'?currentCard:mode==='failure'?failureCard:compare):reference;
  return `<section class="mes-context-panel ames-sn-mounting-compare" data-sn-mounting-views data-active-scope="${esc(mode)}" data-no-i18n>
    <div class="section-head"><div><h3>${hasNewCycle?
      c('3074 · Novo ciclo após a última falha','3074 · New cycle after last failure'):
      c('3074 · Montagem de referência da PCBA','3074 · Board reference mounting')}</h3>
    <p>${hasNewCycle?
      c('Um vínculo Y posterior à 2114 comprova ciclos distintos; as contagens ficam separadas.','A Y binding after 2114 proves distinct cycles; counts stay separate.'):
      c('Sem novo ciclo comprovado, existe somente uma referência principal; histórico e incertezas ficam abaixo.','With no proven new cycle, one primary reference is shown; history and uncertainty remain below.')}
    ${failure.defect_time?` · 2114: ${esc(formatFactoryDateTime(failure.defect_time))}`:''}</p></div></div>
    ${hasNewCycle?`<div class="mes-pagination">${option('compare',c('Comparar ambas','Compare both'))}${option('current',c('Somente atual','Current only'))}${option('failure',c('Última falha','Last failure'))}</div>`:''}
    <p class="mes-context" data-sn-3074-coverage>${esc(coverage)}</p>
    ${historicalAlarm}${confidence}<div data-sn-mounting-content>${inner}</div>${renderHistorical3074ReuseAudit(scopes,locale)}${historyAudit}
  </section>`;
}
