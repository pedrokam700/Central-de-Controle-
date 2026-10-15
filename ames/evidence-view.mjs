import {formatFactoryDateTime} from './data/time-display.mjs';
import {defectDescription,defectLabel} from './defect-label.mjs';
export const EVIDENCE_PAGE_SIZE = 25;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Shared record presentation. It neither fetches nor owns operational state.
export function occurrenceList(rows, start = 1, { trace = true, prefix = 'mes' } = {}) {
  const esc = escapeHtml;
  return `<ol class="mes-record-list" start="${start}">${rows.map((row, index) => `<li data-trace-item><strong>${esc(row.pcba_sn)}</strong><dl><dt>CPH</dt><dd>${esc(row.product_model || 'Não informado')}</dd><dt>Defeito</dt><dd>${esc(row.defect_code || 'Não informado')} · ${esc(defectDescription(row.defect_desc))}</dd><dt>Defect Time</dt><dd>${esc(formatFactoryDateTime(row.defect_time))}${row.defect_time_ms === null ? ' · instante não verificável' : ''}</dd><dt>Reparo na fonte</dt><dd>${esc(row.repair_status || 'Não informado')}</dd><dt>Defect Type na fonte</dt><dd>${esc(row.defect_type || 'Não informado')}</dd><dt>Origem / referência</dt><dd>3028 · ${esc(row.evidence_ref)}</dd></dl>${trace ? `<button type="button" class="button secondary" id="${esc(prefix)}-trace-${start + index}" data-mes-trace="${esc(row.evidence_ref)}" data-trace-line="${esc(row.line_id)}" data-trace-product="${esc(row.product_key)}" data-trace-pcba="${esc(row.pcba_sn)}" aria-expanded="false">Rastrear esta PCBA</button><section class="mes-trace" data-trace-slot hidden aria-label="Rastreabilidade da PCBA"></section>` : ''}</li>`).join('')}</ol>`;
}

// One evidence renderer for both live and SQLite investigations; no new state.
export function renderSnCorrelationAlerts(model,locale='pt-BR'){
  const esc=escapeHtml,t=(pt,en)=>locale.startsWith('en')?en:pt;
  const time=(raw,offset='-03:00')=>formatFactoryDateTime(raw,{locale,naiveOffset:offset});
  const titles={
    PCBA_SAME_FAILURE:t('Mesma falha na própria PCBA','Same failure on this PCBA'),
    PCBA_SAME_FAMILY:t('Mesma família na própria PCBA','Same family on this PCBA'),
    PCBA_MAINBOARD_REPAIR_HISTORY:t('Histórico de reparo MainBoard','MainBoard repair history'),
    PCBA_REPEATED_MAINBOARD_REPAIR:t('Múltiplas passagens por reparo MainBoard','Multiple MainBoard repair interventions'),
    PCBA_MAINBOARD_REPAIR_RECURRENCE:t('Nova falha após reparo MainBoard','New failure after MainBoard repair'),
    COMPONENT_SAME_FAILURE:t('Componente reutilizado: mesma falha anterior','Reused component: same previous failure'),
    COMPONENT_SAME_FAMILY:t('Componente reutilizado: mesma família anterior','Reused component: same previous family'),
  };
  const failure=f=>`<p>${esc(f?.pcba_sn||'—')} · ${esc(f?.defect_code||'—')} · ${esc(f?.defect_desc||t('Descrição não informada','Description not provided'))} · ${esc(time(f?.defect_time))} · ${esc(f?.source||'—')}</p>`;
  const proof=e=>`${failure(e.failure)}${(e.repairs||[]).map(r=>`<div class="ames-sn-repair-story"><p>Repair User: ${esc(r.repair_user||'—')} · Repair Time: ${esc(time(r.repair_time))}</p><p>${esc(r.source)} · ${esc(r.repair_code||'—')} · ${esc(r.repair_desc||'—')}</p>${r.repair_comment?`<blockquote>Repair Comment: ${esc(r.repair_comment)}</blockquote>`:''}</div>`).join('')}${e.binding?`<p>3074 · ${esc(e.binding.item_sn)} · ${esc(e.binding.previous_pcba)} → ${esc(e.binding.current_pcba)}</p>${[e.binding.previous,e.binding.current].map(b=>`<p>${esc(b.pcba_sn)} · ${t('Vínculo','Bound')}: ${esc(time(b.bind_time,b.offset))} · ${t('Desvínculo','Unbound')}: ${esc(time(b.unbind_time,b.offset))}</p>`).join('')}`:''}${e.return?`<p>3022 · ${t('Retorno comprovado','Proven return')}: ${esc(e.return.station)} · ${esc(e.return.operation||'—')} · ${esc(time(e.return.time))}</p>`:''}`;
  const alerts=model.alerts||[],limits=model.correlation_limits||[];
  return `<section class="ames-sn-correlation-alerts" data-sn-correlation-alerts><h3>${t('Alertas de correlação para análise','Correlation alerts for analysis')}</h3><p>${t('Indícios para investigação. Correlação não confirma causa raiz.','Indications for investigation. Correlation does not confirm root cause.')}</p>${alerts.map(a=>`<article class="notice ${a.severity==='high'?'warn':''}" data-correlation-kind="${esc(a.kind)}"><b>${esc(titles[a.kind]||t('Correlação histórica','Historical correlation'))}</b><p>${esc(a.item_type||'')} ${esc(a.item_sn||'')} · PCBA: ${esc(a.pcba_sn||'—')}${a.repair_count?` · ${t('Intervenções distintas','Distinct interventions')}: ${a.repair_count}`:''}</p>${(Array.isArray(a.evidence)?a.evidence:[a.evidence]).filter(Boolean).map(proof).join('')}<small>${t('Comparado à falha atual','Compared with current failure')}</small>${failure((Array.isArray(a.evidence)?a.evidence[0]:a.evidence)?.current_failure)}</article>`).join('')||`<p>${t('Nenhuma correlação comprovada com as evidências disponíveis; isso não prova ausência de histórico.','No correlation established from available evidence; this does not prove absence of history.')}</p>`}${limits.length?`<details><summary>${t('Limites da evidência','Evidence limitations')}</summary><ul>${limits.map(l=>`<li>${esc(l.item_sn||l.pcba_sn||'')} · ${l.code==='COMPONENT_BINDING_UNPROVEN'?t('Vínculos 3074 no momento das falhas não comprovados.','3074 bindings at failure times are unproven.'):t('Horário da ocorrência não comprovado.','Occurrence time is unproven.')}</li>`).join('')}</ul></details>`:''}</section>`;
}
