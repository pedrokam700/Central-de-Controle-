import { traceDimensions, AGENT_CAPABILITIES } from './data/capabilities.mjs';
import { dimensionList } from './capability-view.mjs';
import { createOccurrenceView } from './occurrence-view.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

// A native technical view of the session store. No transport or separate state.
export function createConsoleView(root, store, { locale } = {}) {
  let operation, technical, lastSnapshot, lastKey;
  function mount() {
    root.innerHTML = `<p>Automação A-MES · consulta técnica dos mesmos dados da Central. Os filtros abaixo investigam a leitura disponível; não comandam uma coleta.</p><section data-console-operation class="ames-occurrence-view"></section><section data-console-technical class="mes-context-panel" aria-label="Coleta e disponibilidade técnica"></section>`;
    technical = root.querySelector('[data-console-technical]');
    operation = createOccurrenceView(root.querySelector('[data-console-operation]'), store, { locale, mode: 'console', onRender: renderTechnical });
  }
  function renderTechnical(model) {
    const snapshot = model.snapshot;
    const key = JSON.stringify([model.source, model.local_connected, model.scope.line_id]);
    if (snapshot === lastSnapshot && key === lastKey) return;
    lastSnapshot = snapshot; lastKey = key;
    technical.innerHTML = `<h2>Coleta e fontes · ${esc(model.scope.line_id)}</h2>
      <p>Snapshot ${esc(snapshot?.snapshot_id || 'indisponível')} · gerado em ${esc(snapshot?.generated_at || 'não informado')}. Origem da leitura: ${esc(model.source)}.</p>
      <dl><dt>Estado da automação / agente</dt><dd>Não verificável pelo snapshot. A disponibilidade de dados não comprova agente conectado ou coleta em andamento.</dd>
      <dt>Progresso real da coleta</dt><dd>Indisponível: não há job, etapas ou progresso no contrato exportado.</dd>
      <dt>Escopo da coleta</dt><dd>Linha do snapshot: ${esc(model.scope.line_id)}. Linhas/defeitos solicitados, limite, tipo de coleta e perfil de desempenho não informados. Filtros de consulta não alteram o coletor.</dd></dl>
      <p>Iniciar/parar coleta, selecionar várias linhas ou defeitos para coleta e alterar quantidade/tipo/perfil dependem do contrato real do agente. Nenhum comando é enviado por esta tela.</p>
      <h3>Rastreabilidade e reuso</h3>${dimensionList(traceDimensions(snapshot), { showCounts: true })}
      <p>PCBA reutilizada × material reutilizado: dimensões distintas, ambas sem evidência suficiente. PCBA SN ≠ Material SN; Batch Count ≠ quantidade de reusos.</p>
      <details><summary>Contrato necessário para conectar o agente</summary><ul>${AGENT_CAPABILITIES.missing.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p>Históricos e controles das versões isoladas permanecem preservados. Este export legado não permite reproduzi-los integralmente; não há comprovação de paridade completa.</p></details>
      <p>Sem ID durável, as referências valem somente nesta leitura. Correlação não confirma causa e não cria vínculo Manual ↔ MES.</p>
      <button type="button" class="button secondary" data-console-setup>Configurar este computador no Perfil</button>`;
  }
  return Object.freeze({ render() { if (!root) return; if (!operation) mount(); operation.render(); }, clear() {
    operation?.clear(); operation = undefined; lastSnapshot = undefined; lastKey = undefined; root?.replaceChildren();
  } });
}
