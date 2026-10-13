import { createOnboardingView, savedIntegrationMode } from './onboarding-view.mjs';
import { INTEGRATION_MODE_KEY } from './data/onboarding.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

// Unknown checks stay unknown. A listening port never proves an authenticated MES session.
export function workstationChecks(agent = {}) {
  const r = agent.readiness || {};
  return [
    ['Agente local · 8765', agent.status === 'connected'],
    ['Motor A-MES', r.engine], ['Python / venv', r.python],
    ['Dependências', r.dependencies], ['Playwright', r.playwright],
    ['Chrome dedicado / CDP · 9222', r.chrome], ['SQLite', r.sqlite],
    ['Rede / rota A-MES', r.ames], ['Sessão A-MES · login manual', r.session],
    ['Capacidade 3022', agent.capabilities?.process_timeline]
  ].map(([label, value]) => ({ label, state: value === true ? 'ok' : value === false ? 'missing' : 'unknown' }));
}

export function createPreparationView(root, store, client) {
  let checking = false, checked = false, expanded = false, disposed = false, onboarding;
  let mode = savedIntegrationMode(), last = '';
  function choose(value) {
    mode = value;
    try { localStorage.setItem(INTEGRATION_MODE_KEY, value); } catch { /* browser-only preference */ }
    expanded = value === 'collector';
    render();
  }
  async function check() {
    if (checking || disposed) return;
    checking = true; render();
    try { await client.connect({quiet:true}); } catch { /* unavailability is a normal viewer state */ }
    finally { checked = true; checking = false; if (!disposed) render(); }
  }
  function render() {
    if (disposed) return;
    const agent = store.agent(), connected = agent.status === 'connected';
    const checks = workstationChecks(agent), ready = checks.every(c => c.state === 'ok');
    const visible = expanded || (!connected && mode !== 'viewer');
    root.hidden=!visible;
    const key=JSON.stringify([checking,checked,expanded,mode,connected,checks]);
    if(key===last)return;last=key;
    root.innerHTML = `<div class="ames-preparation" data-preparation>
      <p role="status">${checking ? 'Verificando este computador…' : connected ? 'Agente local conectado' : 'MES local não disponível neste computador'}${!connected && mode === 'viewer' ? ' · Dados compartilhados' : ''}</p>
      ${visible ? `<p>Consulte os dados compartilhados ou prepare este computador para coleta. O login A-MES permanece manual.</p>
      <div class="mes-pagination"><button type="button" class="button secondary" data-use-shared>Usar somente dados compartilhados</button><button type="button" class="button secondary" data-prepare-pc>Preparar este computador</button></div>` : ''}
      ${expanded ? `<details open><summary>Pré-teste do posto</summary><ul>${checks.map(c => `<li data-check-state="${c.state}">${esc(c.label)} — <span>${c.state === 'ok' ? 'Verificado' : c.state === 'missing' ? 'Pendente' : 'Não verificado'}</span></li>`).join('')}</ul><p>${ready ? 'Pronto para teste' : 'Conclua os itens pendentes e confirme o login manual A-MES antes da coleta.'}</p><button type="button" class="button secondary" data-preflight ${checking ? 'disabled' : ''}>Verificar novamente</button><section data-installation></section></details>` : ''}
    </div>`;
    root.querySelector('[data-use-shared]')?.addEventListener('click', () => choose('viewer'));
    root.querySelector('[data-prepare-pc]')?.addEventListener('click', () => choose('collector'));
    root.querySelector('[data-preflight]')?.addEventListener('click', check);
    onboarding?.clear(); onboarding = null;
    if (expanded) {
      onboarding = createOnboardingView(root.querySelector('[data-installation]'), { onChoice: choose });
      void onboarding.render();
    }
    if (!checked && !checking) queueMicrotask(check);
  }
  return { render, open() { expanded = true; choose('collector'); }, collapse(){expanded=false;render();}, clear() { disposed = true; onboarding?.clear(); root.replaceChildren(); } };
}
