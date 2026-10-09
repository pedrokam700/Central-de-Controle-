import { LINE_IDS } from './data/contract.mjs';
import { selectDashboard } from './data/dashboard.mjs';
import { selectFailures } from './data/failures.mjs';
import { selectDaily } from './data/daily.mjs';
import { attachTraceability } from './trace-view.mjs';

import { escapeHtml as esc, occurrenceList, EVIDENCE_PAGE_SIZE as PAGE_SIZE } from './evidence-view.mjs';

const labels = { fpy: 'FPY', check_fpy: 'Check FPY', quantity: 'Quantidade', defect_count: 'Falhas informadas' };

// Owns only transient view controls. Evidence remains in state.ames.
export function createOccurrenceView(root, store, { locale = () => 'pt-BR', mode = 'dashboard', onRender = () => {} } = {}) {
  const consoleMode = mode === 'console';
  const failures = mode === 'failures';
  const daily = mode === 'daily';
  const cora = mode === 'cora';
  const compact = failures || daily || cora;
  const prefix = consoleMode ? 'consoleMes' : cora ? 'coraMes' : daily ? 'dailyMes' : failures ? 'failureMes' : 'dashMes';
  let line = LINE_IDS[0], product, defect, pcba, repair, defectType;
  let page = 0, expanded = false, previousSnapshot;
  let lastRenderKey = '';
  attachTraceability(root, store, { prefix, snapshotForLine: () => previousSnapshot, onInvalidated: () => render() });
  const number = value => value === null ? '—' : value.toLocaleString(locale());
  const options = (values, selected) => values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');

  function render({ force = false } = {}) {
    if (!root) return;
    const read = store.read(line);
    const snapshotChanged = previousSnapshot !== undefined && previousSnapshot !== read.snapshot;
    const key = JSON.stringify([line, product, defect, pcba, repair, defectType, page, expanded, read.source, read.freshness, locale()]);
    if (!force && !snapshotChanged && previousSnapshot === read.snapshot && key === lastRenderKey) return;
    const focused = root.ownerDocument.activeElement;
    const focusId = root.contains(focused) ? focused.id : '';
    if (snapshotChanged) { expanded = false; page = 0; }
    previousSnapshot = read.snapshot;
    const model = (daily ? selectDaily : compact ? selectFailures : selectDashboard)(store, { line_id: line, product, defect_code: defect, pcba_sn: pcba, repair_status: repair, defect_type: defectType });
    const snapshot = model.snapshot;
    const source = { remote: 'Último snapshot sincronizado', local: 'Snapshot local', local_cache: 'Cache local desconectado', none: 'Sem snapshot disponível' }[model.source];
    const freshness = { fresh: 'coleta recente', stale: 'coleta antiga', unknown: 'idade não verificável' }[model.freshness];
    const products = product && !model.products.includes(product) ? [...model.products, product] : model.products;
    const defects = defect !== undefined && !model.defects.includes(defect) ? [...model.defects, defect] : model.defects;
    const pages = Math.max(1, Math.ceil(model.rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const rows = model.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    root.innerHTML = `
      <div class="section-head"><div><h2>${daily ? 'Contexto MES da operação' : compact ? 'MES · ocorrências disponíveis' : 'Operação por linha'}</h2><p>Origem: MES · uma linha por consulta</p></div></div>
      <div class="mes-filters">
        <label>Linha<select id="${prefix}Line">${LINE_IDS.map((id, i) => `<option value="${id}"${id === line ? ' selected' : ''}>Linha ${i + 1} · ${id}</option>`).join('')}</select></label>
        <label>CPH exato<select id="${prefix}Product"><option value="">Todos os modelos</option>${options(products, product)}</select></label>
        <label>Defect Code<select id="${prefix}Defect"><option value="">Todos os códigos</option>${defects.map(code => `<option value="${esc(JSON.stringify(code))}"${code === defect ? ' selected' : ''}>${esc(code || 'Código não informado')}</option>`).join('')}</select></label>
      </div>
      ${consoleMode ? `<div class="mes-filters mes-investigation">
        <label>PCBA SN exata<input id="${prefix}Pcba" value="${esc(pcba || '')}" placeholder="Todas as PCBAs" autocomplete="off"></label>
        ${[['Repair', 'Repair Status', model.repair_statuses, repair], ['Type', 'Defect Type', model.defect_types, defectType]].map(([id, label, values, selected]) => `<label>${label}<select id="${prefix}${id}"><option value="">Todos os estados</option>${[...new Set([...values, ...(selected === undefined ? [] : [selected])])].map(value => `<option value="${esc(JSON.stringify(value))}"${value === selected ? ' selected' : ''}>${esc(value || 'Não informado')}</option>`).join('')}</select></label>`).join('')}
      </div><p class="mes-context">Filtros de investigação da lista parcial, aplicados ao confirmar o campo (Enter ou sair do campo). Não são parâmetros de coleta.</p>` : ''}
      <p class="mes-context">${esc(line)} · ${esc(source)}${snapshot ? ` · ${freshness}<br>Coleta informada: ${esc(snapshot.collected_at || 'não informada')} · Snapshot: ${esc(snapshot.snapshot_id)}` : ''}</p>
      <p class="mes-coverage" role="status">${snapshotChanged ? 'Dados atualizados; consulte novamente os registros. ' : ''}${snapshot
        ? `Cobertura parcial · ${number(model.coverage.loaded_count)} registros disponíveis · ${number(model.coverage.reported_count)} falhas informadas pela fonte · ${number(model.coverage.rejected_rows)} registros rejeitados. A lista disponível não comprova os totais ou taxas MES.`
        : 'Dados indisponíveis para esta linha. Ausência de snapshot não significa zero falhas.'}</p>
      ${failures ? '<p class="mes-context">Somente leitura. Sem ID durável: não é permitido vincular permanentemente a um registro Manual, salvar esta referência como relação ou criar Report automaticamente. Registros podem reaparecer em snapshots distintos; não há deduplicação histórica. Ausência na lista parcial não significa ausência de falha.</p>' : ''}
      <p class="mes-context">Período e turno não informados pela fonte. ${compact ? 'Consulte apenas os registros carregados desta linha. Ausência na lista parcial não significa ausência de falha.' : model.filtered ? 'Agregados indisponíveis para o filtro selecionado.' : 'Agregados do snapshot da linha; definição, numeradores, denominadores e evidência detalhada indisponíveis.'}</p>
      <div class="mes-metrics">${model.aggregates.map(metric => `<article class="stat"><div class="stat-label">${labels[metric.name]}</div><div class="stat-value">${number(metric.value)}${metric.value !== null && metric.name.includes('fpy') ? '%' : ''}</div><div class="stat-note">${metric.evidence === 'aggregate_only' ? 'Agregado da fonte · sem drill-down' : 'Indisponível neste escopo'}</div></article>`).join('')}
        <button type="button" id="${prefix}Records" class="stat mes-records-toggle" aria-expanded="${expanded}" aria-controls="${prefix}Evidence"${snapshot ? '' : ' disabled'}><span class="stat-label">Ocorrências disponíveis${model.filtered ? ' no filtro' : ''}</span><span class="stat-value">${number(model.sample_metric.value)}</span><span class="stat-note">${snapshot ? 'Abrir registros desta lista parcial' : 'Sem dados disponíveis'}</span></button>
      </div>
      ${compact ? '' : `<div class="mes-pareto"><h3>Top 3 defeitos · lista parcial${model.filtered ? ' filtrada' : ''}</h3>${model.pareto.length ? model.pareto.map(item => `<button type="button" class="button secondary" data-mes-code="${esc(item.code)}">${esc(item.code || 'Código não informado')} · ${number(item.count)} ocorrência(s)</button>`).join('') : '<p>Nenhuma ocorrência disponível neste escopo.</p>'}</div>`}
      <p class="mes-context">${snapshot?.source_schema === 'agent-v0.5.23-read' ? 'Históricos 2114/3074 e indicadores disponíveis podem ser consultados no Console MES, separados da lista atual. Processo 3022 não coletado.' : 'Repair agregado, reuso, recorrência, histórico 2114/3074 e processo 3022: evidência detalhada indisponível neste snapshot.'} Observação MES não confirma causa.</p>
      <section id="${prefix}Evidence" class="mes-evidence"${expanded ? '' : ' hidden'} aria-label="Registros do indicador">
        ${expanded ? `<h3 tabindex="-1" id="${prefix}EvidenceTitle">Registros disponíveis · ${esc(line)} · snapshot ${esc(snapshot?.snapshot_id)}</h3>
        <p>${number(model.rows.length)} ocorrência(s) na lista parcial${product !== undefined ? ` · CPH exato: ${esc(product)}` : ''}${defect !== undefined ? ` · defeito: ${esc(defect || 'não informado')}` : ''}. Referências válidas somente nesta leitura; IDs duráveis, revisão e evidência bruta indisponíveis.</p>
        ${occurrenceList(rows, page * PAGE_SIZE + 1, { prefix })}
        ${rows.length ? '' : '<p>Nenhum registro neste filtro; a cobertura continua parcial.</p>'}
        <div class="mes-pagination"><button type="button" class="button secondary" id="${prefix}Prev"${page === 0 ? ' disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages}</span><button type="button" class="button secondary" id="${prefix}Next"${page + 1 >= pages ? ' disabled' : ''}>Próxima</button></div>` : ''}
      </section>`;
    lastRenderKey = JSON.stringify([line, product, defect, pcba, repair, defectType, page, expanded, read.source, read.freshness, locale()]);
    onRender(model);
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
    if (snapshotChanged && focusId.startsWith(`${prefix}`) && !root.querySelector(`#${focusId}`)) root.querySelector(`#${prefix}Records`)?.focus();
  }

  root?.addEventListener('change', event => {
    if (event.target.id === `${prefix}Line`) { line = event.target.value; product = undefined; defect = undefined; pcba = undefined; repair = undefined; defectType = undefined; }
    else if (event.target.id === `${prefix}Product`) { product = event.target.value || undefined; defect = undefined; }
    else if (event.target.id === `${prefix}Defect`) defect = event.target.value ? JSON.parse(event.target.value) : undefined;
    else if (consoleMode && event.target.id === `${prefix}Pcba`) pcba = event.target.value.trim() || undefined;
    else if (consoleMode && event.target.id === `${prefix}Repair`) repair = event.target.value ? JSON.parse(event.target.value) : undefined;
    else if (consoleMode && event.target.id === `${prefix}Type`) defectType = event.target.value ? JSON.parse(event.target.value) : undefined;
    else return;
    expanded = false; page = 0; previousSnapshot = undefined; render();
  });
  root?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === `${prefix}Pcba`) { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  root?.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === `${prefix}Records`) { expanded = !expanded; page = 0; }
    else if (button.id === `${prefix}Prev`) page--;
    else if (button.id === `${prefix}Next`) page++;
    else if (button.hasAttribute('data-mes-code')) { defect = button.dataset.mesCode; expanded = true; page = 0; }
    else return;
    // An update between displaying a KPI and clicking must never open a different read.
    const changed = previousSnapshot !== store.read(line).snapshot;
    render();
    if (!changed && expanded && (button.id === `${prefix}Records` || button.hasAttribute('data-mes-code'))) root.querySelector(`#${prefix}EvidenceTitle`)?.focus();
  });
  return Object.freeze({ render, filters: () => ({ line_id: line, product, defect_code: defect }), clear() {
    line = LINE_IDS[0]; product = undefined; defect = undefined; pcba = undefined; repair = undefined; defectType = undefined; page = 0; expanded = false;
    previousSnapshot = undefined; lastRenderKey = ''; if (root) root.replaceChildren();
  } });
}
