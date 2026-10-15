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

const safeBackup = raw => {
  if (!raw || typeof raw !== 'object') return null;
  const bytes = Number(raw.bytes);
  return {
    created_at: raw.created_at || raw.modified_at || null,
    bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : null,
    reason: ['manual', 'native_console', 'startup', 'update', 'rollback'].includes(String(raw.reason || '')) ? String(raw.reason) : null
  };
};

// Installation health is deliberately independent from MES network/session health.
// A workstation used at home may have a healthy local installation while A-MES is unreachable.
export function workstationMaintenance(agent = {}) {
  const r = agent.readiness || {}, connected = agent.status === 'connected';
  const localChecks = [
    ['Agente', connected], ['Motor', r.engine], ['Python', r.python],
    ['Dependências', r.dependencies], ['Playwright', r.playwright], ['SQLite', r.sqlite]
  ].map(([label, value]) => ({ label, state: value === true ? 'ok' : value === false ? 'missing' : 'unknown' }));
  const allLocalReady = connected && localChecks.every(item => item.state === 'ok');
  const latest = safeBackup(agent.runtime?.latest_backup || (agent.auxiliary?.name === 'backup' ? agent.auxiliary?.result?.backup : null));
  return {
    tone: !connected ? 'unknown' : allLocalReady ? 'ok' : 'partial',
    label: !connected ? 'Núcleo local não verificado' : allLocalReady ? 'Núcleo local pronto' : 'Verificação local parcial',
    build: String(agent.agent_build || agent.capabilities?.agent_build || ''),
    candidate: String(agent.runtime?.candidate_version || ''),
    setup_complete: agent.runtime?.setup_complete === true,
    localChecks,
    latest_backup: latest
  };
}

const formatBytes = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export function createPreparationView(root, store, client) {
  let checking = false, checked = false, expanded = false, disposed = false, onboarding;
  let backupBusy = false, maintenanceMessage = '';
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
    finally { checked = true; checking = false; if (!disposed) { last = ''; render(); } }
  }
  async function backupNow() {
    if (backupBusy || disposed || store.agent().status !== 'connected') return;
    backupBusy = true; maintenanceMessage = ''; last = ''; render();
    try {
      const result = await client.auxiliary('backup');
      maintenanceMessage = result?.ok && result?.backup ? 'Ponto de recuperação criado e validado pelo agente local.' : 'Backup solicitado; revalide o posto antes de atualizar.';
    } catch {
      maintenanceMessage = 'Não foi possível criar o ponto de recuperação. Nenhuma atualização foi iniciada.';
    } finally {
      backupBusy = false;
      if (!disposed) { last = ''; render(); }
    }
  }
  function render() {
    if (disposed) return;
    const agent = store.agent(), connected = agent.status === 'connected';
    const checks = workstationChecks(agent), ready = checks.every(c => c.state === 'ok');
    const maintenance = workstationMaintenance(agent);
    const visible = expanded || (!connected && mode !== 'viewer');
    const backup = maintenance.latest_backup;
    const backupSummary = backup
      ? `${esc(backup.created_at || 'data não informada')} · ${esc(formatBytes(backup.bytes))}${backup.reason ? ` · ${esc(backup.reason)}` : ''}`
      : 'Nenhum ponto criado nesta sessão foi reportado à Central.';
    root.hidden=!visible;
    const key=JSON.stringify([checking,checked,expanded,mode,connected,checks,maintenance,backupBusy,maintenanceMessage]);
    if(key===last)return;last=key;
    root.innerHTML = `<div class="ames-preparation" data-preparation>
      <p role="status">${checking ? 'Verificando este computador…' : connected ? 'Agente local conectado' : 'MES local não disponível neste computador'}${!connected && mode === 'viewer' ? ' · Dados compartilhados' : ''}</p>
      ${visible ? `<p>Consulte os dados compartilhados ou prepare este computador para coleta. O login A-MES permanece manual.</p>
      <div class="mes-pagination"><button type="button" class="button secondary" data-use-shared>Usar somente dados compartilhados</button><button type="button" class="button secondary" data-prepare-pc>Preparar este computador</button></div>` : ''}
      ${expanded ? `<details open><summary>Pré-teste do posto</summary><ul>${checks.map(c => `<li data-check-state="${c.state}">${esc(c.label)} — <span>${c.state === 'ok' ? 'Verificado' : c.state === 'missing' ? 'Pendente' : 'Não verificado'}</span></li>`).join('')}</ul><p>${ready ? 'Pronto para teste' : 'Conclua os itens pendentes e confirme o login manual A-MES antes da coleta.'}</p><button type="button" class="button secondary" data-preflight ${checking ? 'disabled' : ''}>Verificar novamente</button>
      <section class="notice ${maintenance.tone === 'partial' ? 'warn' : ''}" data-workstation-maintenance><b>Manutenção do posto · ${esc(maintenance.label)}</b><br><small>Build instalada: ${esc(maintenance.build || '—')} · Candidato reportado: ${esc(maintenance.candidate || '—')} · Setup: ${maintenance.setup_complete ? 'concluído' : 'não confirmado'}</small><p>Verificação local: ${maintenance.localChecks.map(item => `${esc(item.label)} ${item.state === 'ok' ? '✓' : item.state === 'missing' ? '!' : '?'}`).join(' · ')}</p><p><b>Ponto de recuperação:</b> ${backupSummary}</p><div class="mes-pagination"><button type="button" class="button secondary" data-workstation-backup ${!connected || backupBusy ? 'disabled' : ''}>${backupBusy ? 'Criando ponto de recuperação…' : 'Criar ponto de recuperação agora'}</button></div>${maintenanceMessage ? `<p role="status">${esc(maintenanceMessage)}</p>` : ''}<small>A atualização e o rollback dos arquivos continuam fora do navegador. Crie um ponto de recuperação, encerre o agente antes de substituir arquivos e use somente o pacote/candidato validado para este build.</small></section>
      <section data-installation></section></details>` : ''}
    </div>`;
    root.querySelector('[data-use-shared]')?.addEventListener('click', () => choose('viewer'));
    root.querySelector('[data-prepare-pc]')?.addEventListener('click', () => choose('collector'));
    root.querySelector('[data-preflight]')?.addEventListener('click', check);
    root.querySelector('[data-workstation-backup]')?.addEventListener('click', backupNow);
    onboarding?.clear(); onboarding = null;
    if (expanded) {
      onboarding = createOnboardingView(root.querySelector('[data-installation]'), { onChoice: choose });
      void onboarding.render();
    }
    if (!checked && !checking) queueMicrotask(check);
  }
  return { render, open() { expanded = true; choose('collector'); }, collapse(){expanded=false;render();}, clear() { disposed = true; onboarding?.clear(); root.replaceChildren(); } };
}