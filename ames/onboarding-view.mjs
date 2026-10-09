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
  function paint() {
    const focusId = root.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement.id : '';
    root.innerHTML = `<h2>Integração A-MES</h2><p>Este computador coleta A-MES?</p>
      <div class="mes-pagination"><button type="button" class="button secondary" id="amesSetupCollector" data-integration-mode="collector" aria-pressed="${mode === 'collector'}">Configurar este computador</button><button type="button" class="button secondary" id="amesSetupViewer" data-integration-mode="viewer" aria-pressed="${mode === 'viewer'}">Somente visualizar</button></div>
      <p role="status">${mode === 'collector' ? 'Preferência: configurar coleta neste computador. Coleta ainda não conectada.' : mode === 'viewer' ? 'Somente visualizar: consulte os snapshots disponíveis na Central; nenhuma coleta é iniciada.' : 'Escolha como pretende usar este computador. Você pode alterar esta opção aqui no Perfil.'}${volatile ? ' Não foi possível salvar a preferência neste navegador.' : ''}</p>
      ${mode === 'collector' ? '<p>1. Confira a versão candidata e o SHA-256 abaixo.<br>2. Obtenha o pacote e siga suas instruções locais de configuração.<br>3. Valide a instalação com o responsável pela fábrica.</p><p>Conecte explicitamente pelo Console MES após instalar o patch FIFO no agente V0.5.23. O ZIP original do manifesto não contém esse patch. Escolher esta opção não instala, inicia nem comprova conexão com o agente.</p>' : ''}
      ${mode === 'collector' && release?.local_runtime ? `<div class="mes-context-panel"><h3>Localizar a instalação existente</h3><p>Na pasta extraída do pacote ${esc(release.version)}, execute <code>${esc(release.local_runtime.start_file)}</code>. O fallback documentado é <code>${esc(release.local_runtime.fallback_file)}</code>, em <code>${esc(release.local_runtime.console_url)}</code> neste computador.</p><p>Localização declarada pelo pacote, não descoberta nem testada por esta tela. Não abre conexão, procura portas ou comprova que o agente está instalado. O Console MES da Central continua disponível para consultar os snapshots sincronizados.</p><details><summary>Preparação da conexão local</summary><ul>${AGENT_CAPABILITIES.missing.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details></div>` : ''}
      <p>Credenciais e sessão ficam fora da Central. Esta configuração salva somente a preferência deste navegador.</p>
      ${release ? `<div class="mes-release"><h3>Pacote de referência · ${esc(release.version)}</h3><p>${esc(release.package_name)}</p><p>SHA-256: <code>${esc(release.sha256)}</code></p><p>Status do manifesto: ${esc(release.candidate_status)} · baseline ${esc(release.validated_baseline || 'não informada')} · Central mínima ${esc(release.minimum_central_version || 'não informada')}. V2/V0.5.23/3022 continuam NÃO GREEN.</p><a class="button secondary" href="${esc(release.download_url)}" target="_blank" rel="noopener noreferrer">Abrir pacote candidato</a><p>Fonte: ames/releases/latest/release.json. Metadados podem vir do cache; confira a versão antes da instalação. Esta tela não verifica o arquivo baixado.</p></div>` : `<p role="status">${error || 'Consultando o manifesto da release…'}</p>${error ? '<button type="button" class="button secondary" data-release-retry>Tentar novamente</button>' : ''}`}`;
    if (focusId) root.querySelector(`#${focusId}`)?.focus();
  }
  async function render() {
    if (!root) return;
    paint();
    if (started) return;
    started = true; controller = new AbortController(); const token = generation;
    try { const result = readRelease(await loadRelease(controller.signal)); if (token !== generation) return; release = result; error = ''; }
    catch (e) { if (token !== generation) return; error = 'Manifesto indisponível ou inválido. Não há pacote verificado nesta leitura.'; }
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
