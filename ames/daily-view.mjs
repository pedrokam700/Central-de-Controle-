import { createOccurrenceView } from './occurrence-view.mjs';
import { createCentralMesContext } from './central-mes-context.mjs';

export function createDailyView(root, store, options = {}) {
  let view,overview;
  function render({ date = '', shift = '' } = {}) {
    if (!root) return;
    if (!view) {
      root.innerHTML = '<p class="mes-context" data-daily-mes-context></p><section data-daily-mes-overview></section><details class="central-mes-details"><summary>Explorar ocorrências MES da leitura atual</summary><section class="ames-occurrence-view" id="dailyMesContent"></section></details>';
      overview=createCentralMesContext(root.querySelector('[data-daily-mes-overview]'),store,{title:'MES · contexto operacional do dia',subtitle:'Saúde real das linhas disponível para apoiar a Central do Dia, mantendo turno/data manuais separados da evidência MES.',mode:'daily'});
      view = createOccurrenceView(root.querySelector('#dailyMesContent'), store, { ...options, mode: 'daily' });
    }
    root.querySelector('[data-daily-mes-context]').textContent = `Contexto manual selecionado: ${date || 'data não selecionada'} · ${shift || 'turno não selecionado'}. O MES mostra o snapshot disponível da linha escolhida sem atribuí-lo automaticamente a esta data ou turno; tarefas, rotinas e indicadores manuais continuam independentes.`;
    overview.render();view.render();
  }
  return Object.freeze({ render, clear() { overview?.clear();view?.clear();overview = undefined;view = undefined;root?.replaceChildren(); } });
}
