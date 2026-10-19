import { createOnboardingView, savedIntegrationMode } from './onboarding-view.mjs';
import { INTEGRATION_MODE_KEY } from './data/onboarding.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const t = (pt, en) => typeof document !== 'undefined' && document.documentElement?.lang?.startsWith('en') ? en : pt;

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
    ['agent', 'Agente', connected], ['engine', 'Motor', r.engine], ['python', 'Python', r.python],
    ['dependencies', 'Dependências', r.dependencies], ['playwright', 'Playwright', r.playwright], ['sqlite', 'SQLite', r.sqlite]
  ].map(([key, label, value]) => ({ key, label, state: value === true ? 'ok' : value === false ? 'missing' : 'unknown' }));
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

const maintenanceStateLabel = tone => tone === 'ok'
  ? t('Núcleo local pronto', 'Local core ready')
  : tone === 'partial'
    ? t('Verificação local parcial', 'Partial local verification')
    : t('Núcleo local não verificado', 'Local core not verified');

const maintenanceCheckLabel = key => ({
  agent: t('Agente', 'Agent'), engine: t('Motor', 'Engine'), python: 'Python',
  dependencies: t('Dependências', 'Dependencies'), playwright: 'Playwright', sqlite: 'SQLite'
}[key] || key);

export function createPreparationView(root, store, client) {
  let checking = false, checked = false, expanded = false, disposed = false, onboarding;
  let backupBusy = false, maintenanceMessage = '';
  let map3012Busy = false, map3012Message = '';
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
      maintenanceMessage = result?.ok && result?.backup
        ? t('Ponto de recuperação criado e validado pelo agente local.', 'Recovery point created and validated by the local agent.')
        : t('Backup solicitado; revalide o posto antes de atualizar.', 'Backup requested; revalidate the workstation before updating.');
    } catch {
      maintenanceMessage = t('Não foi possível criar o ponto de recuperação. Nenhuma atualização foi iniciada.', 'The recovery point could not be created. No update was started.');
    } finally {
      backupBusy = false;
      if (!disposed) { last = ''; render(); }
    }
  }
  async function map3012Now() {
    if (map3012Busy || disposed || store.agent().status !== 'connected') return;
    map3012Busy = true; map3012Message = ''; last = ''; render();
    try {
      const report = await client.auxiliary('map3012');
      if (!report?.ok || report?.surface !== 'home' || report?.read_only !== true || report?.query_executed !== false) {
        throw new Error(t('O agente não confirmou um mapeamento seguro da 3012 Home.', 'The agent did not confirm a safe 3012 Home mapping.'));
      }
      const stamp = String(report.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `MAPEAMENTO_3012_HOME_${stamp}.json`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
      const fields = report.structure?.fields?.length ?? 0, grids = report.structure?.grids?.length ?? 0;
      map3012Message = t(`Mapeamento concluído: ${fields} campo(s), ${grids} grid(s). Envie o JSON baixado no chat para a próxima etapa.`, `Mapping complete: ${fields} field(s), ${grids} grid(s). Send the downloaded JSON in chat for the next step.`);
    } catch (error) {
      map3012Message = error?.message || t('Não foi possível mapear a 3012 Home.', 'Could not map the 3012 Home view.');
    } finally {
      map3012Busy = false;
      if (!disposed) { last = ''; render(); }
    }
  }
  function render() {
    if (disposed) return;
    const agent = store.agent(), connected = agent.status === 'connected';
    const pairing=!!client.canOpenOfficial?.(),connectionError=agent.connection_error?.message||'';
    const checks = workstationChecks(agent), ready = checks.every(c => c.state === 'ok');
    const maintenance = workstationMaintenance(agent);
    // Pairing must remain reachable even when the local agent is already ready.
    // Previously the entire preparation panel was hidden once connected.
    const visible = expanded || pairing || (!connected && mode !== 'viewer');
    const backup = maintenance.latest_backup;
    const backupSummary = backup
      ? `${esc(backup.created_at || t('data não informada', 'date not reported'))} · ${esc(formatBytes(backup.bytes))}${backup.reason ? ` · ${esc(backup.reason)}` : ''}`
      : t('Nenhum ponto criado nesta sessão foi reportado à Central.', 'No recovery point created in this session has been reported to Work Center.');
    root.hidden=!visible;
    const key=JSON.stringify([checking,checked,expanded,mode,connected,pairing,connectionError,checks,maintenance,backupBusy,maintenanceMessage,map3012Busy,map3012Message,typeof document === 'undefined' ? '' : document.documentElement?.lang]);
    if(key===last)return;last=key;
    root.innerHTML = `<div class="ames-preparation" data-preparation>
      <p role="status">${checking ? 'Verificando este computador…' : connected ? 'Agente local conectado' : 'MES local não disponível neste computador'}${!connected && mode === 'viewer' ? ' · Dados compartilhados' : ''}</p>
      ${connectionError?`<p class="notice warn" role="status">${esc(connectionError)}</p>`:''}
      ${pairing?`<button type="button" class="button secondary" data-pair-official>${t('Abrir HTTPS oficial pareado neste computador','Open paired official HTTPS on this computer')}</button><p>${t('Autoriza somente o agente deste computador na nova aba oficial. Não compartilhe a URL de pareamento. O computador sem MES precisa apenas dos dados da equipe.','Authorizes only this computer’s agent in the new official tab. Do not share the pairing URL. A computer without MES only needs team data.')}</p>`:''}
      ${visible ? `<p>Consulte os dados compartilhados ou prepare este computador para coleta. O login A-MES permanece manual.</p>
      <div class="mes-pagination"><button type="button" class="button secondary" data-use-shared>Usar somente dados compartilhados</button><button type="button" class="button secondary" data-prepare-pc>Preparar este computador</button></div>` : ''}
      ${expanded ? `<details open><summary>Pré-teste do posto</summary><ul>${checks.map(c => `<li data-check-state="${c.state}">${esc(c.label)} — <span>${c.state === 'ok' ? 'Verificado' : c.state === 'missing' ? 'Pendente' : 'Não verificado'}</span></li>`).join('')}</ul><p>${ready ? 'Pronto para teste' : 'Conclua os itens pendentes e confirme o login manual A-MES antes da coleta.'}</p><button type="button" class="button secondary" data-preflight ${checking ? 'disabled' : ''}>Verificar novamente</button>
      <section class="notice ${maintenance.tone === 'partial' ? 'warn' : ''}" data-workstation-maintenance><b>${t('Manutenção do posto', 'Workstation maintenance')} · ${esc(maintenanceStateLabel(maintenance.tone))}</b><br><small>${t('Build instalada', 'Installed build')}: ${esc(maintenance.build || '—')} · ${t('Candidato reportado', 'Reported candidate')}: ${esc(maintenance.candidate || '—')} · Setup: ${maintenance.setup_complete ? t('concluído', 'complete') : t('não confirmado', 'not confirmed')}</small><p>${t('Verificação local', 'Local verification')}: ${maintenance.localChecks.map(item => `${esc(maintenanceCheckLabel(item.key))} ${item.state === 'ok' ? '✓' : item.state === 'missing' ? '!' : '?'}`).join(' · ')}</p><p><b>${t('Ponto de recuperação', 'Recovery point')}:</b> ${backupSummary}</p><div class="mes-pagination"><button type="button" class="button secondary" data-workstation-backup ${!connected || backupBusy ? 'disabled' : ''}>${backupBusy ? t('Criando ponto de recuperação…', 'Creating recovery point…') : t('Criar ponto de recuperação agora', 'Create recovery point now')}</button></div>${maintenanceMessage ? `<p role="status">${esc(maintenanceMessage)}</p>` : ''}<details data-3012-map-tools><summary>${t('Diagnóstico 3012 Home', '3012 Home diagnostics')}</summary><p>${t('Mapeia somente a estrutura técnica da 3012 correta na Home. Não executa consulta, não lê valores dos campos e não coleta cookie, sessão ou cabeçalhos.', 'Maps only the technical structure of the canonical 3012 Home view. It does not run a query, read field values, or collect cookies, session data or headers.')}</p><div class="mes-pagination"><button type="button" class="button secondary" data-map-3012 ${!connected || map3012Busy ? 'disabled' : ''}>${map3012Busy ? t('Mapeando 3012 Home…', 'Mapping 3012 Home…') : t('Mapear 3012 Home (somente leitura)', 'Map 3012 Home (read-only)')}</button></div>${map3012Message ? `<p role="status">${esc(map3012Message)}</p>` : ''}<small>${t('O agente reserva a sessão MES, abre a view Home correta e baixa um JSON sanitizado. Envie esse JSON no chat; a consulta controlada por SN será a etapa seguinte.', 'The agent reserves the MES session, opens the correct Home view and downloads a sanitized JSON. Send that JSON in chat; the controlled SN query is the next step.')}</small></details><small>${t('A atualização e o rollback dos arquivos continuam fora do navegador. Crie um ponto de recuperação, encerre o agente antes de substituir arquivos e use somente o pacote/candidato validado para este build.', 'File update and rollback remain outside the browser. Create a recovery point, stop the agent before replacing files, and use only the package/candidate validated for this build.')}</small></section>
      <section data-installation></section></details>` : ''}
    </div>`;
    root.querySelector('[data-use-shared]')?.addEventListener('click', () => choose('viewer'));
    root.querySelector('[data-prepare-pc]')?.addEventListener('click', () => choose('collector'));
    root.querySelector('[data-preflight]')?.addEventListener('click', check);
    root.querySelector('[data-pair-official]')?.addEventListener('click',()=>client.openOfficial());
    root.querySelector('[data-workstation-backup]')?.addEventListener('click', backupNow);
    root.querySelector('[data-map-3012]')?.addEventListener('click', map3012Now);
    onboarding?.clear(); onboarding = null;
    if (expanded) {
      onboarding = createOnboardingView(root.querySelector('[data-installation]'), { onChoice: choose });
      void onboarding.render();
    }
    if (!checked && !checking) queueMicrotask(check);
  }
  return { render, open() { expanded = true; choose('collector'); }, collapse(){expanded=false;render();}, clear() { disposed = true; onboarding?.clear(); root.replaceChildren(); } };
}
