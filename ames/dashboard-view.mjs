import { LINE_IDS } from './data/contract.mjs';
import { selectDashboard } from './data/dashboard.mjs';

const PAGE_SIZE = 25;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { fpy: 'FPY', check_fpy: 'Check FPY', quantity: 'Quantidade', defect_count: 'Falhas informadas' };

// Owns only transient view controls. Evidence remains in state.ames.
export function createDashboardView(root, store, { locale = () => 'pt-BR' } = {}) {
  let line = LINE_IDS[0], product, defect;
  let page = 0, expanded = false, previousSnapshot;
  let lastRenderKey = '';
  const number = value => value === null ? '—' : value.toLocaleString(locale());
  const options = (values, selected) => values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');

  function render({ force = false } = {}) {
    if (!root) return;
    const read = store.read(line);
    const snapshotChanged = previousSnapshot !== undefined && previousSnapshot !== read.snapshot;
    const key = JSON.stringify([line, product, defect, page, expanded, read.source, read.freshness, locale()]);
    if (!force && !snapshotChanged && previousSnapshot === read.snapshot && key === lastRenderKey) return;
    const focused = root.ownerDocument.activeElement;
    const focusId = root.contains(focused) ? focused.id : '';
    if (snapshotChanged) { expanded = false; page = 0; }
    previousSnapshot = read.snapshot;
    const model = selectDashboard(store, { line_id: line, product, defect_code: defect });
    const snapshot = model.snapshot;
    const source = { remote: 'Último snapshot sincronizado', local: 'Snapshot local', local_cache: 'Cache local desconectado', none: 'Sem snapshot disponível' }[model.source];
    const freshness = { fresh: 'coleta recente', stale: 'coleta antiga', unknown: 'idade não verificável' }[model.freshness];
    const products = product && !model.products.includes(product) ? [...model.products, product] : model.products;
    const defects = defect !== undefined && !model.defects.includes(defect) ? [...model.defects, defect] : model.defects;
    const pages = Math.max(1, Math.ceil(model.rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const rows = model.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    root.innerHTML = `
      <div class="section-head"><div><h2>Operação por linha</h2><p>Dados MES · uma linha por consulta</p></div></div>
      <div class="mes-filters">
        <label>Linha<select id="dashMesLine">${LINE_IDS.map((id, i) => `<option value="${id}"${id === line ? ' selected' : ''}>Linha ${i + 1} · ${id}</option>`).join('')}</select></label>
        <label>CPH exato<select id="dashMesProduct"><option value="">Todos os modelos</option>${options(products, product)}</select></label>
        <label>Defect Code<select id="dashMesDefect"><option value="">Todos os códigos</option>${defects.map(code => `<option value="${esc(JSON.stringify(code))}"${code === defect ? ' selected' : ''}>${esc(code || 'Código não informado')}</option>`).join('')}</select></label>
      </div>
      <p class="mes-context">${esc(line)} · ${esc(source)}${snapshot ? ` · ${freshness}<br>Coleta informada: ${esc(snapshot.collected_at || 'não informada')} · Snapshot: ${esc(snapshot.snapshot_id)}` : ''}</p>
      <p class="mes-coverage" role="status">${snapshotChanged ? 'Dados atualizados; consulte novamente os registros. ' : ''}${snapshot
        ? `Cobertura parcial · ${number(model.coverage.loaded_count)} registros disponíveis · ${number(model.coverage.reported_count)} falhas informadas pela fonte · ${number(model.coverage.rejected_rows)} registros rejeitados. A lista disponível não comprova os totais ou taxas MES.`
        : 'Dados indisponíveis para esta linha. Ausência de snapshot não significa zero falhas.'}</p>
      <p class="mes-context">Período e turno não informados pela fonte. ${model.filtered ? 'Agregados indisponíveis para o filtro selecionado.' : 'Agregados do snapshot da linha; definição, numeradores, denominadores e evidência detalhada indisponíveis.'}</p>
      <div class="mes-metrics">${model.aggregates.map(metric => `<article class="stat"><div class="stat-label">${labels[metric.name]}</div><div class="stat-value">${number(metric.value)}${metric.value !== null && metric.name.includes('fpy') ? '%' : ''}</div><div class="stat-note">${metric.evidence === 'aggregate_only' ? 'Agregado da fonte · sem drill-down' : 'Indisponível neste escopo'}</div></article>`).join('')}
        <button type="button" id="dashMesRecords" class="stat mes-records-toggle" aria-expanded="${expanded}" aria-controls="dashMesEvidence"${snapshot ? '' : ' disabled'}><span class="stat-label">Ocorrências disponíveis${model.filtered ? ' no filtro' : ''}</span><span class="stat-value">${number(model.sample_metric.value)}</span><span class="stat-note">${snapshot ? 'Abrir registros desta lista parcial' : 'Sem dados disponíveis'}</span></button>
      </div>
      <div class="mes-pareto"><h3>Top 3 defeitos · lista parcial${model.filtered ? ' filtrada' : ''}</h3>${model.pareto.length ? model.pareto.map(item => `<button type="button" class="button secondary" data-mes-code="${esc(item.code)}">${esc(item.code || 'Código não informado')} · ${number(item.count)} ocorrência(s)</button>`).join('') : '<p>Nenhuma ocorrência disponível neste escopo.</p>'}</div>
      <p class="mes-context">Repair, reuso de PCBA/material e recorrência: evidência detalhada indisponível neste snapshot.</p>
      <section id="dashMesEvidence" class="mes-evidence"${expanded ? '' : ' hidden'} aria-label="Registros do indicador">
        ${expanded ? `<h3 tabindex="-1" id="dashMesEvidenceTitle">Registros disponíveis · ${esc(line)} · snapshot ${esc(snapshot?.snapshot_id)}</h3>
        <p>${number(model.rows.length)} ocorrência(s) na lista parcial${product !== undefined ? ` · CPH exato: ${esc(product)}` : ''}${defect !== undefined ? ` · defeito: ${esc(defect || 'não informado')}` : ''}. Referências válidas somente nesta leitura; IDs duráveis, revisão e evidência bruta indisponíveis.</p>
        <ol class="mes-record-list" start="${page * PAGE_SIZE + 1}">${rows.map(row => `<li><strong>${esc(row.pcba_sn)}</strong><dl><dt>CPH</dt><dd>${esc(row.product_model || 'Não informado')}</dd><dt>Defeito</dt><dd>${esc(row.defect_code || 'Não informado')} · ${esc(row.defect_desc)}</dd><dt>Defect Time</dt><dd>${esc(row.defect_time || 'Não informado')}${row.defect_time_ms === null ? ' · instante não verificável' : ''}</dd><dt>Reparo na fonte</dt><dd>${esc(row.repair_status || 'Não informado')}</dd><dt>Origem / referência</dt><dd>3028 · ${esc(row.evidence_ref)}</dd></dl></li>`).join('')}</ol>
        ${rows.length ? '' : '<p>Nenhum registro neste filtro; a cobertura continua parcial.</p>'}
        <div class="mes-pagination"><button type="button" class="button secondary" id="dashMesPrev"${page === 0 ? ' disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages}</span><button type="button" class="button secondary" id="dashMesNext"${page + 1 >= pages ? ' disabled' : ''}>Próxima</button></div>` : ''}
      </section>`;
    lastRenderKey = JSON.stringify([line, product, defect, page, expanded, read.source, read.freshness, locale()]);
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
    if (snapshotChanged && focusId.startsWith('dashMes') && !root.querySelector(`#${focusId}`)) root.querySelector('#dashMesRecords')?.focus();
  }

  root?.addEventListener('change', event => {
    if (event.target.id === 'dashMesLine') { line = event.target.value; product = undefined; defect = undefined; }
    else if (event.target.id === 'dashMesProduct') { product = event.target.value || undefined; defect = undefined; }
    else if (event.target.id === 'dashMesDefect') defect = event.target.value ? JSON.parse(event.target.value) : undefined;
    else return;
    expanded = false; page = 0; previousSnapshot = undefined; render();
  });
  root?.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === 'dashMesRecords') { expanded = !expanded; page = 0; }
    else if (button.id === 'dashMesPrev') page--;
    else if (button.id === 'dashMesNext') page++;
    else if (button.hasAttribute('data-mes-code')) { defect = button.dataset.mesCode; expanded = true; page = 0; }
    else return;
    // An update between displaying a KPI and clicking must never open a different read.
    const changed = previousSnapshot !== store.read(line).snapshot;
    render();
    if (!changed && expanded && (button.id === 'dashMesRecords' || button.hasAttribute('data-mes-code'))) root.querySelector('#dashMesEvidenceTitle')?.focus();
  });
  return Object.freeze({ render, clear() {
    line = LINE_IDS[0]; product = undefined; defect = undefined; page = 0; expanded = false;
    previousSnapshot = undefined; lastRenderKey = ''; if (root) root.replaceChildren();
  } });
}
