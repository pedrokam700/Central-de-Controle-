import {buildReuseHistoryTimeline} from './data/reuse-history-timeline.mjs';
import {analysisScope2114} from './data/reuse-cohorts.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
const t=(pt,en)=>globalThis.document?.documentElement?.lang?.startsWith('en')?en:pt;
const clock=value=>value?esc(formatFactoryDateTime(value)):'—';
const scopes=()=>({board_disassembly:t('Desmontagem da placa registrada','Board disassembly recorded'),phone_disassembly:t('Desmontagem do telefone registrada','Phone disassembly recorded'),battery_cover_only:t('Somente tampa da bateria','Battery cover only'),not_recorded:t('Análise não informada','Analysis not recorded'),other:t('Outra análise','Other analysis')});
const role=kind=>({defect_author:t('Autor do registro da falha','Defect record author'),repair_user:'Repair User · 3012',process_operator:t('Operador observado · 3022','Observed operator · 3022')})[kind];
function bindingText(bindings){
 return bindings.map(b=>`<div>${['Y','N'].includes(b.usage_status)?`${t('Vínculo','Binding')} 3074 · ${esc(b.usage_status)}`:t('Histórico 3074 · Y/N não comprovado','3074 history · Y/N unproven')}${b.role==='previous'?` · ${t('Anterior','Previous')}`:''}
  ${b.bind_time_utc?`<small>Bind Time: ${clock(b.bind_time_utc)}</small>`:''}${b.unbind_time_utc?`<small>Unbind Time: ${clock(b.unbind_time_utc)}</small>`:''}</div>`).join('')||'—';
}
function provenance(e){
 const fields=[['source_id',e.source_id],[t('Linha','Line'),e.line_id],['snapshot',e.snapshot_id],
  [t('revisão','revision'),e.snapshot_revision],['record',e.record_id||e.event_id||e.row_key||e.defect_key],
  [t('período','period'),e.period&&typeof e.period==='object'?JSON.stringify(e.period):e.period],['raw_ref',e.raw_ref]];
 return fields.filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>`<small>${esc(k)}: ${esc(v)}</small>`).join('')||t('Origem/revisão não comprovadas','Source/revision unproven');
}
export function renderReuseHistoryTimeline(input={}, {board=false,status={}}={}){
 const rows=buildReuseHistoryTimeline(input);
 const warnings=Object.entries(status).map(([view,value])=>`<p class="mes-context" data-timeline-coverage="${esc(view)}">${esc(view)} · ${value==='error'?t('Leitura local indisponível; evidências já carregadas preservadas. Ausência não comprovada.','Local read unavailable; loaded evidence preserved. Absence unproven.'):value==='loaded'?t('Cache local consultado; ausência de registros não comprova ausência no MES.','Local cache read; no rows does not prove MES absence.'):t('Cache local não consultado; cobertura não comprovada.','Local cache not queried; coverage unproven.')}</p>`).join('');
 return `<section data-reuse-history-timeline data-reuse-3012-history>
 <p class="mes-context">${t('Uma linha por evento fonte. Defect Time, Tran Time e Repair Time são independentes. Associação com Hist Seq não comprovada para reparos 3012; PCBA + código não identifica atendimento.','One row per source event. Defect Time, Tran Time and Repair Time are independent. A 3012 repair is not linked to Hist Seq by board + fault code.')}</p>
 <p class="mes-context">${t('MainBoard e Phone Disassembly são escopos de desmontagem distintos; Phone Battery Cover indica somente tampa. Histórico não comprova montagem atual ou novo uso.','MainBoard and Phone Disassembly are distinct dismantling scopes; Phone Battery Cover is cover-only. History does not prove current mounting or a new use.')}</p>
 <div class="table-wrap ames-component-comparison${board?' ames-board-comparison':''}"><table><thead><tr>
 <th>PCBA / ${t('Vínculo','Binding')} 3074</th><th>${t('Fonte / passagem','Source / visit')}</th>
 <th>Defect Time</th><th>Tran Time</th><th>Repair Time</th><th>${t('Falha / processo','Fault / process')}</th>
 <th>${t('Técnico / papel','Person / role')}</th><th>${t('Análise 2114 / reparo','2114 analysis / repair')}</th>
 <th>${t('Comentário','Comment')}</th><th>${t('Origem / prova','Source / evidence')}</th>
 </tr></thead><tbody>${rows.map(e=>{
  const failure=['2114','3028'].includes(e.source_view);
  return `<tr data-reuse-timeline-row data-source-view="${esc(e.source_view)}" data-event-key="${esc(e.identity)}" data-pcba="${esc(e.pcba_sn)}" data-defect-code="${esc(e.defect_code||'')}" ${failure?'data-reuse-source-row':''} ${board&&failure?'data-board-failure-row':''} ${e.source_view==='3012'?'data-reuse-3012-occurrence':''}>
  <td class="ames-component-compare-pcba">${esc(e.pcba_sn)}${input.bindings?.length?bindingText(e.bindings):''}</td>
  <td>${esc(e.source_view)}${e.hist_seq!==null?`<small>Hist Seq ${esc(e.hist_seq)}</small>`:''}${e.sort_at===null?`<small>${t('Horário não comprovado','Timestamp unproven')}</small>`:''}</td>
  <td>${clock(e.defect_time)}</td><td>${clock(e.event_time)}</td><td>${clock(e.repair_time)}</td>
  <td><strong>${esc(e.defect_desc||e.operation_name||e.process||e.station||(e.source_view==='3074'?t('Histórico não disponível','History unavailable'):'—'))}</strong><small>${esc(e.defect_code||e.station||'')}</small></td>
  <td>${e.actors.length?e.actors.map(a=>`<div class="ames-reuse-visible-value">${esc(a.name||a.id||'—')}<small>${esc(role(a.role))}${a.id?' · '+esc(a.id):''}${!a.name?' · '+t('nome não comprovado','name unproven'):''}${a.name_conflict?' · '+t('Nomes conflitantes; autoria não comprovada','Conflicting names; authorship unproven'):''}</small></div>`).join(''):'—'}</td>
  <td>${e.defect_type?`<span class="ames-reuse-time-line">${esc(e.defect_type)}</span>`:'—'}${e.source_view==='2114'?`<small>${t('Escopo do processo','Process scope')}: ${esc(scopes()[e.analysis_scope]||scopes()[analysisScope2114(e.defect_type)])}</small><small>Repair: ${esc(e.repair_status||'—')}</small><small>${!e.history_order_proven?t('Ordem não comprovada','Order unproven'):e.repeat_exact_prior_count?t('Mesma falha anterior','Same prior defect')+' ('+e.repeat_exact_prior_count+')':e.repeat_family_prior_count?t('Mesma família anterior','Same prior family'):'—'}</small>`:esc(e.repair_status||'')}</td>
  <td><div class="ames-reuse-visible-comment" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(e.repair_comment||'—')}</div></td>
  <td>${provenance(e)}${e.source_view==='3012'?`<small>${t('Associação com Hist Seq não comprovada','Hist Seq association unproven')}</small>`:''}</td></tr>`;
 }).join('')}</tbody></table></div>${warnings}
 ${!rows.length?`<p class="ames-reuse-unproven">${t('Eventos não disponíveis nesta leitura; ausência não comprovada.','Events unavailable in this reading; absence unproven.')}</p>`:''}
 </section>`;
}
