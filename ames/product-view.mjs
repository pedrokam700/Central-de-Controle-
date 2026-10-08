import { LINE_IDS, productKey } from './data/contract.mjs';
import { selectProductLine } from './data/product.mjs';
import { escapeHtml as esc, occurrenceList, EVIDENCE_PAGE_SIZE as PAGE_SIZE } from './evidence-view.mjs';

// Transient controls and immutable references only; state.ames owns the data.
export function createProductView(root, store, { locale = () => 'pt-BR' } = {}) {
  let currentProduct = null;
  const controls = new Map();
  const number = value => value === null ? '—' : value.toLocaleString(locale());

  function render(product) {
    if (!root) return;
    const key = productKey(product);
    if (key !== currentProduct) {
      controls.clear(); currentProduct = key;
      root.innerHTML = key ? `<div class="section-head"><div><h3>Ocorrências na produção</h3><p>CPH exato: ${esc(key)} · evidência MES por linha, separada dos reports manuais</p></div></div>
        <p class="product-mes-note">As listas parciais não representam o universo completo. FPY, quantidade e totais da linha não podem ser atribuídos a este CPH. Período e turno não informados pela fonte.</p>
        <div class="product-mes-lines">${LINE_IDS.map(line => `<section id="productMes-${line}" data-product-mes-line="${line}" aria-label="Evidência ${line}"></section>`).join('')}</div>`
        : '<p class="product-mes-note">Selecione um produto cadastrado para consultar sua evidência de produção.</p>';
    }
    if (!key) return;
    for (const line of LINE_IDS) {
      const read = store.read(line);
      let ui = controls.get(line);
      if (!ui) { ui = { page: 0, expanded: false, snapshot: undefined, signature: '' }; controls.set(line, ui); }
      const changed = ui.snapshot !== undefined && ui.snapshot !== read.snapshot;
      if (changed) { ui.page = 0; ui.expanded = false; }
      const signature = JSON.stringify([ui.page, ui.expanded, read.source, read.freshness, locale()]);
      if (ui.snapshot === read.snapshot && ui.signature === signature) continue;
      const container = root.querySelector(`#productMes-${line}`);
      const focused = root.ownerDocument.activeElement;
      const focusId = container.contains(focused) ? focused.id : '';
      const dimensionsOpen = container.querySelector('details')?.open || false;
      const model = selectProductLine(store, { line_id: line, product: key });
      const snapshot = model.snapshot;
      const source = { remote: 'Último snapshot sincronizado', local: 'Snapshot local', local_cache: 'Cache local desconectado', none: 'Sem snapshot disponível' }[model.source];
      const freshness = { fresh: 'coleta recente', stale: 'coleta antiga', unknown: 'idade não verificável' }[model.freshness];
      const pages = Math.max(1, Math.ceil(model.rows.length / PAGE_SIZE));
      ui.page = Math.min(ui.page, pages - 1);
      const prefix = `productMes-${line}`;
      container.innerHTML = `<h4>Linha ${LINE_IDS.indexOf(line) + 1} · ${line}</h4>
        <p class="product-mes-note">${esc(source)}${snapshot ? ` · ${freshness}<br>Snapshot: ${esc(snapshot.snapshot_id)}<br>Coleta informada: ${esc(snapshot.collected_at || 'não informada')}` : ''}</p>
        <p class="product-mes-coverage" role="status">${changed ? 'Dados atualizados; abra novamente os registros. ' : ''}${snapshot
          ? `Cobertura parcial da linha: ${number(model.coverage.loaded_count)} registros carregados · ${number(model.coverage.reported_count)} falhas informadas pela fonte · ${number(model.coverage.rejected_rows)} registros rejeitados. Estes números são da linha inteira, não do CPH.`
          : 'Dados indisponíveis nesta linha. Não é possível concluir ausência de falhas deste CPH.'}</p>
        ${model.metric.drilldown_available ? `<button type="button" class="button secondary product-mes-count" id="${prefix}-records" data-product-mes-action="records" aria-expanded="${ui.expanded}" aria-controls="${prefix}-evidence"><strong>${number(model.metric.value)}</strong> ocorrência(s) disponível(is) de ${esc(key)} · abrir registros</button>`
          : snapshot ? `<p class="product-mes-note">Nenhuma ocorrência de ${esc(key)} na lista disponível. A cobertura parcial não prova ausência de falhas nem de produção.</p>` : ''}
        <section id="${prefix}-evidence" class="product-mes-evidence"${ui.expanded ? '' : ' hidden'} aria-label="Registros de ${esc(key)} em ${line}">
        ${ui.expanded ? `<h5 id="${prefix}-title" tabindex="-1">${esc(key)} · ${line} · snapshot ${esc(snapshot.snapshot_id)}</h5><p>${number(model.rows.length)} registros disponíveis. Referências limitadas a esta leitura; revisão, IDs duráveis e evidência bruta indisponíveis.</p>
          ${occurrenceList(model.rows.slice(ui.page * PAGE_SIZE, (ui.page + 1) * PAGE_SIZE), ui.page * PAGE_SIZE + 1)}
          <div class="product-mes-pagination"><button type="button" class="button secondary" id="${prefix}-prev" data-product-mes-action="prev"${ui.page === 0 ? ' disabled' : ''}>Anterior</button><span>Página ${ui.page + 1} de ${pages}</span><button type="button" class="button secondary" id="${prefix}-next" data-product-mes-action="next"${ui.page + 1 >= pages ? ' disabled' : ''}>Próxima</button></div>` : ''}</section>
        <details class="product-mes-dimensions"${dimensionsOpen ? ' open' : ''}><summary id="${prefix}-dimensions">Disponibilidade de histórico, materiais e processo</summary><dl>${model.dimensions.map(d => `<dt>${esc(d.label)}</dt><dd>${d.status === 'not_collected' ? 'Não coletado neste snapshot' : 'Evidência detalhada indisponível neste recorte'}</dd>`).join('')}</dl><p>Contagens isoladas não comprovam reuso ou recorrência. Correlação não confirma causa.</p></details>`;
      ui.snapshot = read.snapshot;
      ui.signature = JSON.stringify([ui.page, ui.expanded, read.source, read.freshness, locale()]);
      if (focusId) (root.querySelector(`#${focusId}`) || container.querySelector('[data-product-mes-action="records"]') || container.querySelector('summary'))?.focus({ preventScroll: true });
    }
  }

  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-product-mes-action]');
    if (!button || button.disabled) return;
    const line = button.closest('[data-product-mes-line]').dataset.productMesLine;
    const ui = controls.get(line);
    // Stale controls must never open records from a replacement read.
    if (ui.snapshot !== store.read(line).snapshot) { render(currentProduct); return; }
    const action = button.dataset.productMesAction;
    if (action === 'records') { ui.expanded = !ui.expanded; ui.page = 0; }
    else if (action === 'prev') ui.page--;
    else if (action === 'next') ui.page++;
    render(currentProduct);
    if (action === 'records' && ui.expanded) root.querySelector(`#productMes-${line}-title`)?.focus();
  });

  return Object.freeze({ render, clear() {
    currentProduct = null; controls.clear(); if (root) root.replaceChildren();
  } });
}
