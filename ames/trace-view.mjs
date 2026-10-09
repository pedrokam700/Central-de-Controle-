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
    slot.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    slot.innerHTML = `<h4 id="${prefix}TraceTitle" tabindex="-1">Rastreabilidade · PCBA ${esc(model.pcba_sn)}</h4>
      <p>${esc(model.line_id)} · CPH exato ${esc(model.product)} · origem MES / ${esc(model.source)}<br>Snapshot ${esc(model.snapshot?.snapshot_id)} · coleta ${esc(model.snapshot?.collected_at || 'não informada')}</p>
      <p>Cobertura parcial. ${model.rows.length} observação(ões) carregada(s) desta PCBA e CPH nesta linha. Ausência de registro não prova que nunca ocorreu. Referências temporárias desta leitura.</p>
      ${dimensionList(model.dimensions)}
      <p>PCBA SN e Material SN são identificadores distintos. Reuso da PCBA não comprova reuso do componente; Batch Count não é contagem de reuso. Nenhum reuso é confirmado neste recorte.</p>
      <p>3022: quando houver evidência, consultar o último evento válido com event_time ≤ defect_time, nunca o último processo absoluto. Sem evento disponível para esta ocorrência.</p>
      ${occurrenceList(model.rows.slice(page * EVIDENCE_PAGE_SIZE, (page + 1) * EVIDENCE_PAGE_SIZE), page * EVIDENCE_PAGE_SIZE + 1, { trace: false })}
      <div class="mes-pagination"><button type="button" class="button secondary" data-trace-page="${page - 1}"${page === 0 ? ' disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages}</span><button type="button" class="button secondary" data-trace-page="${page + 1}"${page + 1 >= pages ? ' disabled' : ''}>Próxima</button></div>`;
    slot.querySelector('h4').focus();
  });
}
