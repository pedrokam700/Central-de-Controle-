import { createOccurrenceView } from './occurrence-view.mjs';
import { selectCoraContext } from './data/cora.mjs';

export function createCoraView(root, store, options = {}) {
  let view;
  function render() {
    if (!root) return;
    if (!view) {
      root.innerHTML = '<details><summary>Contexto MES da consulta</summary><label class="mes-opt-in"><input type="checkbox" data-cora-mes-include> Usar a linha e o CPH selecionados na próxima consulta</label><p>Fato observado ≠ correlação ≠ hipótese ≠ causa confirmada por humano. A seleção inclui até 25 registros da leitura atual; não representa todas as falhas.</p><p>Contexto preparado na Central. A utilização na resposta depende do serviço CORA disponível; validação do backend pendente.</p><section id="coraMesEvidence" class="ames-occurrence-view"></section></details>';
      view = createOccurrenceView(root.querySelector('section'), store, { ...options, mode: 'cora' });
    }
    view.render();
  }
  return Object.freeze({ render,
    context() { return selectCoraContext(store, root?.querySelector('[data-cora-mes-include]')?.checked ? view?.filters() : undefined); },
    clear() { view?.clear(); view = undefined; root?.replaceChildren(); }
  });
}
