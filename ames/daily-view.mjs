import { createOccurrenceView } from './occurrence-view.mjs';

export function createDailyView(root, store, options = {}) {
  let view;
  function render({ date = '', shift = '' } = {}) {
    if (!root) return;
    if (!view) {
      root.innerHTML = '<p class="mes-context" data-daily-mes-context></p><section class="ames-occurrence-view" id="dailyMesEvidence"></section>';
      view = createOccurrenceView(root.querySelector('section'), store, { ...options, mode: 'daily' });
    }
    root.querySelector('[data-daily-mes-context]').textContent = `Contexto manual selecionado: ${date || 'data não selecionada'} · ${shift || 'turno não selecionado'}. MES exibe o snapshot disponível da linha escolhida, sem atribuí-lo a esta data ou turno. Tarefas, rotinas e seus indicadores permanecem independentes.`;
    view.render();
  }
  return Object.freeze({ render, clear() { view?.clear(); view = undefined; root?.replaceChildren(); } });
}
