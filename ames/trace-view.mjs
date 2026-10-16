import { dimensionList } from './capability-view.mjs';
import { selectTrace } from './data/trace.mjs';
import { escapeHtml as esc, occurrenceList, EVIDENCE_PAGE_SIZE } from './evidence-view.mjs';

// Delegated inline detail, reused by every occurrence consumer. No own data store.
export function attachTraceability(root, store, { snapshotForLine, onInvalidated, prefix }) {
  root?.addEventListener('click', event => {
    const action = event.target.closest('[data-mes-trace], [data-trace-page]');
    if (!action) return;
    const item = action.closest('[data-trace-item]');
    const trigger = item.querySelector('[data-mes-trace]');
    const slot = item.querySelector('[data-trace-slot]');
    const context = { line_id: trigger.dataset.traceLine, product: trigger.dataset.traceProduct,
      pcba_sn: trigger.dataset.tracePcba, evidence_ref: trigger.dataset.mesTrace };
    const model = selectTrace(store, context, snapshotForLine(context.line_id));
    if (model.status === 'invalidated') { onInvalidated(); return; }
    if (action === trigger && !slot.hidden) { slot.hidden = true; slot.replaceChildren(); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); return; }
    for (const other of root.querySelectorAll('[data-trace-slot]')) { other.hidden = true; other.replaceChildren(); }
    for (const other of root.querySelectorAll('[data-mes-trace]')) other.setAttribute('aria-expanded', 'false');
    const pages = Math.max(1, Math.ceil(model.rows.length / EVIDENCE_PAGE_SIZE));
    const page = Math.max(0, Math.min(Number(action.dataset.tracePage) || 0, pages - 1));
    const processMessage=model.process.event
      ? `<p>3022 · último evento válido anterior/igual ao Defect Time: <b>${esc(model.process.event.event_time)}</b> · ${esc(model.process.event.process_name||model.process.event.process_code)}. Esta passagem é evidência temporal, não causa confirmada.</p>`
      : '<p>3022 · nenhum evento válido carregado para esta ocorrência. Isso não prova ausência no A-MES; apenas informa que esta leitura não possui evidência temporal utilizável.</p>';
    slot.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    slot.innerHTML = `<h4 id="${prefix}TraceTitle" tabindex="-1">Rastreabilidade · PCBA ${esc(model.pcba_sn)}</h4>
      <p>${esc(model.line_id)} · CPH exato ${esc(model.product)} · origem MES / ${esc(model.source)}<br>Snapshot ${esc(model.snapshot?.snapshot_id)} · coleta ${esc(model.snapshot?.collected_at || 'não informada')}</p>
      <p>Cobertura parcial. ${model.rows.length} observação(ões) carregada(s) desta PCBA e CPH nesta linha. Ausência de registro não prova que nunca ocorreu. Referências temporárias desta leitura.</p>
      ${dimensionList(model.dimensions)}
      ${[['2114 · históricos com contexto explícito',model.enriched.pcba_history],['3074 · materiais com contexto explícito',model.enriched.materials]].map(([label,rows])=>rows.length?`<details><summary>${label} · ${rows.length} registros</summary><p>Contextos da fonte; linha histórica não implica produção nesta linha. Prévia dos primeiros 25; todos disponíveis no Console.</p>${rows.slice(0,25).map(row=>`<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(row,null,2))}</pre>`).join('')}</details>`:'').join('')}
      ${processMessage}
      <p>PCBA SN e Material SN são identificadores distintos. Reuso da PCBA e reuso de componente só podem ser afirmados quando a evidência correspondente estiver carregada; <b>Batch Count não é contagem de uso/reuso</b>.</p>
      <p>Regra 3022: usar sempre o último evento válido com event_time ≤ Defect Time da ocorrência atual, nunca o último processo absoluto da peça.</p>
      ${occurrenceList(model.rows.slice(page * EVIDENCE_PAGE_SIZE, (page + 1) * EVIDENCE_PAGE_SIZE), page * EVIDENCE_PAGE_SIZE + 1, { trace: false })}
      <div class="mes-pagination"><button type="button" class="button secondary" data-trace-page="${page - 1}"${page === 0 ? ' disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages}</span><button type="button" class="button secondary" data-trace-page="${page + 1}"${page + 1 >= pages ? ' disabled' : ''}>Próxima</button></div>`;
    slot.querySelector('h4').focus();
  });
}
