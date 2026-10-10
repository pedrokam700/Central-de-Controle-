import { AGENT_CAPABILITIES } from './data/capabilities.mjs';
import { readRelease, integrationMode, INTEGRATION_MODE_KEY } from './data/onboarding.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

export function savedIntegrationMode() {
  try { return integrationMode(localStorage.getItem(INTEGRATION_MODE_KEY)); } catch { return null; }
}
export function createOnboardingView(root, { onChoice = () => {}, loadRelease = async signal => {
  const response = await fetch(new URL('./releases/latest/release.json', import.meta.url), { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Release indisponível');
  return response.json();
} } = {}) {
  let mode = savedIntegrationMode(), release, error = '', started = false, generation = 0, controller, volatile = false;
  function collectorPanel(){
    if(!release)return `<p role="status">${error || 'Consultando o estado do pacote local…'}</p>${error ? '<button type="button" class="button secondary" data-release-retry>Tentar novamente</button>' : ''}`;
    const runtime=release.local_runtime;
    const existing=release.existing_r12_migration;
    const packageBlock=release.package_available
      ? `<div class="mes-release"><h3>Instalação nova · ${esc(release.version)}</h3><p>${esc(release.package_name)}</p><p>SHA-256: <code>${esc(release.sha256)}</code></p><a class="button secondary" href="${esc(release.download_url)}" target="_blank" rel="noopener noreferrer">Baixar pacote de instalação</a><p>Use este download somente uma vez por computador e confira o SHA-256 antes da instalação.</p></div>`
      : `<div class="mes-release"><h3>Instalação em computador novo ainda bloqueada</h3><p>O ZIP público anterior não contém a fusão atual e deixou de ser oferecido por segurança. Estado: <strong>${esc(release.candidate_status)}</strong>.</p><p>Quando o pacote fundido for gerado a partir da R12 capturada no posto e passar o gate físico, o botão de download aparecerá aqui. Até lá, não instale o pacote antigo em uma máquina nova esperando paridade R12.</p></div>`;
    const existingBlock=existing
      ? `<div class="mes-context-panel"><h3>Este computador já possui a automação R12</h3><p>Esse é o caminho de migração suportado para o gate atual. Preserve a pasta R12 como rollback, aplique o candidato canônico e inicie pelo <code>${esc(runtime?.start_file || 'INICIAR_POSTO_CENTRAL_V2.bat')}</code>. A interface operacional continua sendo esta Central; o agente local permanece em <code>${esc(runtime?.agent_health_url || 'http://127.0.0.1:8765/api/v1/health')}</code>.</p><p>O login do A-MES continua manual. A Central não recebe senha A-MES, cookies, CDP nem senha Wi-Fi.</p><details><summary>O que ainda precisa ser provado no posto</summary><ul>${AGENT_CAPABILITIES.missing.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details></div>`
      : '';
    return `${existingBlock}${packageBlock}`;
  }
  function paint() {
    const focusId = root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement.id : '';
    root.innerHTML = `<h2>Integração A-MES</h2><p>Este computador coleta A-MES?</p>
      <div class="mes-pagination"><button type="button" class="button secondary" id="amesSetupCollector" data-integration-mode="collector" aria-pressed="${mode === 'collector'}">Configurar este computador</button><button type="button" class="button secondary" id="amesSetupViewer" data-integration-mode="viewer" aria-pressed="${mode === 'viewer'}">Somente visualizar</button></div>
      <p role="status">${mode === 'collector' ? 'Preferência: este computador fará coleta local A-MES. A conexão só fica ativa quando o agente e o Chrome/CDP passarem no preflight.' : mode === 'viewer' ? 'Somente visualizar: usa snapshots sincronizados; nenhuma coleta MES é iniciada neste computador.' : 'Escolha como pretende usar este computador. Você pode alterar esta opção aqui no Perfil.'}${volatile ? ' Não foi possível salvar a preferência neste navegador.' : ''}</p>
      ${mode === 'collector' ? collectorPanel() : ''}
      <p>Credenciais e sessão do A-MES permanecem locais. Esta configuração salva somente a preferência deste navegador.</p>`;
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
  }
  async function render() {
    if (!root) return;
    paint();
    if (started) return;
    started = true; controller = new AbortController(); const token = generation;
    try { const result = readRelease(await loadRelease(controller.signal)); if (token !== generation) return; release = result; error = ''; }
    catch (e) { if (token !== generation) return; error = 'Manifesto indisponível ou inválido. Nenhum pacote será sugerido sem manifesto válido.'; }
    if (token === generation) paint();
  }
  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-integration-mode], [data-release-retry]');
    if (!button) return;
    if (button.hasAttribute('data-release-retry')) { started = false; error = ''; render(); return; }
    mode = integrationMode(button.dataset.integrationMode);
    try { localStorage.setItem(INTEGRATION_MODE_KEY, mode); volatile = false; } catch { volatile = true; }
    paint(); onChoice(mode);
  });
  return Object.freeze({ render, clear() { generation++; controller?.abort(); started = false; release = undefined; error = ''; mode = savedIntegrationMode(); root?.replaceChildren(); } });
}
