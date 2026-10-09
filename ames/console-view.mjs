import { traceDimensions } from './data/capabilities.mjs';
import { createAgentClient } from './agent-client.mjs';
import { createAutomationView } from './automation-view.mjs';
import { createAgentEvidenceView } from './agent-evidence-view.mjs';
import {createAdvancedView} from './advanced-view.mjs';
import { dimensionList } from './capability-view.mjs';
import { createOccurrenceView } from './occurrence-view.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

// A native technical view of the session store. No transport or separate state.
export function createConsoleView(root, store, { locale, onChange = () => {}, transport = {} } = {}) {
  let operation, technical, automation, advanced, evidence, lastSnapshot, lastKey;
  const client = createAgentClient(store, {...transport, changed() { automation?.render(); advanced?.render(); operation?.render(); onChange(); }});
  function mount() {
    root.innerHTML = `<p>Automação A-MES · dados da mesma Central, separados por linha. Filtros de investigação não alteram o escopo da coleta.</p><section data-console-agent></section><section data-console-operation class="ames-occurrence-view"></section><section data-console-evidence></section><section data-console-technical class="mes-context-panel" aria-label="Coleta e disponibilidade técnica"></section>`;
    automation = createAutomationView(root.querySelector('[data-console-agent]'), store, client);
    const tools=root.ownerDocument.createElement('section');tools.dataset.consoleAdvanced='';root.querySelector('[data-console-agent]').after(tools);advanced=createAdvancedView(tools,store,client);
    evidence = createAgentEvidenceView(root.querySelector('[data-console-evidence]'), store);
    technical = root.querySelector('[data-console-technical]');
    operation = createOccurrenceView(root.querySelector('[data-console-operation]'), store, { locale, mode: 'console', onRender: renderTechnical });
  }
  function renderTechnical(model) {
    const snapshot = model.snapshot;
    evidence.render(model.scope.line_id);
    const key = JSON.stringify([model.source, model.local_connected, model.scope.line_id]);
    if (snapshot === lastSnapshot && key === lastKey) return;
    lastSnapshot = snapshot; lastKey = key;
    technical.innerHTML = `<h2>Coleta e fontes · ${esc(model.scope.line_id)}</h2>
      <p>Snapshot ${esc(snapshot?.snapshot_id || 'indisponível')} · gerado em ${esc(snapshot?.generated_at || 'não informado')}. Origem da leitura: ${esc(model.source)}.</p>
      <p>Estado e progresso do agente aparecem em “Coleta e agente deste computador”. Um snapshot sincronizado não comprova agente conectado. Dados históricos adicionais são lidos localmente, quando disponíveis.</p>
      <h3>Rastreabilidade e reuso</h3>${dimensionList(traceDimensions(snapshot), { showCounts: true })}
      <p>PCBA SN ≠ Material SN; Batch Count ≠ quantidade de reusos. Indicadores e matriz só aparecem com os registros retornados pelo agente; cobertura parcial não representa o universo completo. Interface isolada preservada; validação fabril pendente.</p>
      <p>Sem ID durável, as referências valem somente nesta leitura. Correlação não confirma causa e não cria vínculo Manual ↔ MES.</p>
      <button type="button" class="button secondary" data-console-setup>Configurar este computador no Perfil</button>`;
  }
  return Object.freeze({ render() { if (!root) return; if (!operation) mount(); automation.render(); advanced.render(); operation.render(); }, clear() {
    advanced?.clear();advanced=undefined;
    automation?.clear(); client.clear(); operation?.clear(); operation = undefined; automation = undefined; evidence = undefined; lastSnapshot = undefined; lastKey = undefined; root?.replaceChildren();
  } });
}
