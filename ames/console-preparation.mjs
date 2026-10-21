import { createOnboardingView, savedIntegrationMode } from './onboarding-view.mjs';
import { INTEGRATION_MODE_KEY,sharingState,installationDetection } from './data/onboarding.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import { LINE_IDS } from './data/contract.mjs';

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

export function createPreparationView(root, store, client, { verify=async()=>client.connect({quiet:true}) }={}) {
  let checking = false, checked = false, expanded = false, disposed = false, onboarding;
  let backupBusy = false, maintenanceMessage = '';
  let autoState = null, autoBusy = false, autoChecked = false, autoMessage = '';
  let map3012Busy = false, map3012Message = '';
  let mode = savedIntegrationMode(), last = '', viewerGuideOpen=false;
  function choose(value) {
    mode = value;
    try { localStorage.setItem(INTEGRATION_MODE_KEY, value); } catch { /* browser-only preference */ }
    expanded = value === 'collector';viewerGuideOpen = value === 'viewer';
    render();
  }
  async function check() {
    if (checking || disposed) return;
    checking = true; render();
    try { await client.connect({quiet:true}); } catch { /* unavailability is a normal viewer state */ }
    finally { checked = true; checking = false; if (!disposed) { last = ''; render(); } }
  }
  async function readAutostart() {
    if(autoBusy || disposed || store.agent().status !== 'connected')return;
    autoBusy=true;autoChecked=true;
    try{autoState=await client.auxiliary('autostartStatus');autoMessage='';}
    catch{autoState=null;autoMessage=t('Agente ainda não suporta o controle de início automático.', 'Agent does not yet support automatic startup control.');}
    finally{autoBusy=false;if(!disposed){last='';render();}}
  }
  async function toggleAutostart() {
    if(autoBusy || disposed || store.agent().status !== 'connected' || autoState?.supported!==true || autoState?.conflict)return;
    const enable=!autoState.enabled;
    const question=enable?t('Ativar o agente ao entrar no Windows? Não inicia MES ou coleta.','Start agent after Windows login? Does not run or collect MES.'):t('Desativar o início automático deste PC?','Disable auto-start on this PC?');
    if(!globalThis.confirm?.(question))return;
    autoBusy=true;autoMessage='';last='';render();
    try{
      const result=await client.auxiliary('autostartSet',{enabled:enable});
      if(result?.ok!==true || result.enabled!==enable)throw Error('Not confirmed');
      autoState=result;
      autoMessage=enable?t('Registrado para este usuário Windows. Confirme após reiniciar.','Registered for this Windows user. Verify after restart.'):t('Desativado. O agente atual continua rodando.','Disabled. The current agent continues running.');
    }catch{autoMessage=t('Não foi possível confirmar a alteração.','Could not confirm the change.');}
    finally{autoBusy=false;autoChecked=true;if(!disposed){last='';render();}}
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
    // A verified local agent should not bury the operation dashboard beneath
    // onboarding every time it rerenders. Pairing remains one click away via
    // the persistent "Configurar posto" button.
    const visible = expanded || viewerGuideOpen || (!connected && mode !== 'viewer');

    const detector=installationDetection(agent,!!client.paired?.());
    const shared=sharingState(agent);
    const receiving=shared.receiving==='server_confirmed'
      ?t('Leitura no servidor confirmada','Server read confirmed')
      :shared.receiving==='cached'?t('Somente cache','Cache only')
      :shared.receiving==='conflict'?t('Conflito entre origens','Competing sources')
      :shared.receiving==='error'?t('Falha na leitura','Read failed')
      :t('Sem confirmação do servidor','No server confirmation');
    const publishing=shared.publishing==='sent'?t('Envio concluído nesta sessão','Sent in this session')
      :shared.publishing==='legacy_conflict'?t('Histórico publicado; ponte legada em conflito','History published; legacy pointer conflict')
      :shared.publishing==='pending'?t('Aguardando envio','Awaiting upload')
      :t('Envio ainda não comprovado','Upload not yet proven');
    const conflictLines=new Set((Array.isArray(agent.sync?.origin_conflict_lines)?agent.sync.origin_conflict_lines:[]).filter(line=>LINE_IDS.includes(line)));
    const remoteHeads=new Map((Array.isArray(agent.sync?.remote_heads)?agent.sync.remote_heads:[]).filter(h=>LINE_IDS.includes(h?.line_id)).map(h=>[h.line_id,h]));
    const lineStatus=LINE_IDS.map((line,index)=>{
      const head=remoteHeads.get(line);
      const verified=shared.receiving==='server_confirmed';
      const conflict=conflictLines.has(line);
      const state=conflict?t('Conflito de origem · precisa conciliação','Source conflict · reconciliation required')
        :!head?t('Não recebida','Not received'):verified?t('Servidor confirmado','Server confirmed'):
        shared.receiving==='cached'?t('Cache local','Local cache'):t('Não confirmada','Unconfirmed');
      const detail=conflict?t('Duas ou mais instalações neste dia; histórico preservado','Two or more installations for this day; history preserved')
        :head?('Snapshot '+esc(head.snapshot_id||'—')+' · r'+esc(head.snapshot_revision??'—')):'—';
      return '<li data-share-line="'+esc(line)+'" data-share-conflict="'+String(conflict)+'"><strong>'+t('Linha','Line')+' '+(index+1)+'</strong><span>'+detail+'</span><small>'+esc(state)+'</small></li>';
    }).join('');
    const summary='<section class="ames-sync-guide" data-sync-guide><div class="ames-sync-guide-head"><b>'+t('Compartilhamento entre computadores','Cross-PC sharing')+'</b><small>'+t('Somente snapshots sanitizados e revisões','Sanitized snapshots and revisions only')+'</small></div><div class="ames-sync-guide-grid">'+
      '<div><small>'+t('Este PC → equipe','This PC → team')+'</small><strong>'+esc(publishing)+'</strong><span>'+t('Fila','Queue')+': '+(shared.pending??'—')+' · '+t('Último envio','Last upload')+': '+esc(shared.lastSentAt||'—')+'</span></div>'+
      '<div><small>'+t('Equipe → este PC','Team → this PC')+'</small><strong>'+esc(receiving)+'</strong><span>'+t('Linhas identificadas','Lines identified')+': '+shared.receivedLines.length+'/3 · '+t('Último evento','Last event')+': '+esc(shared.lastReceivedAt||'—')+'</span></div></div>'+
      '<ul class="ames-sync-line-list" aria-label="'+t('Linhas e revisões recebidas','Received lines and revisions')+'">'+lineStatus+'</ul>'+
      (conflictLines.size?'<p class="notice warn" data-source-conflict-warning>'+t('Há múltiplos publicadores para a mesma linha e dia produtivo. Os dados históricos estão preservados; a Central bloqueia a seleção automática até confirmar a origem oficial. Não apague SQLite nem Force o Firebase.','More than one publisher exists for the same line and production day. History is preserved. The Work Center blocks automatic selection until the official source is verified. Do not delete SQLite or force Firebase.')+'</p>':'')+
      '<p class="mes-context">'+t('Envio no PC A não prova recebimento no PC B. Compare linha, snapshot e revisão em ambos; o navegador precisa ficar autenticado e aberto para publicar.','Sending from PC A does not prove receipt on PC B. Compare line, snapshot and revision on both; the browser must remain signed in and open to publish.')+'</p>'+
      '<button class="button secondary" type="button" data-sync-guide-verify>'+t('Verificar conexões agora','Check connections now')+'</button></section>';
    const backup = maintenance.latest_backup;
    const backupSummary = backup
      ? `${esc(backup.created_at || t('data não informada', 'date not reported'))} · ${esc(formatBytes(backup.bytes))}${backup.reason ? ` · ${esc(backup.reason)}` : ''}`
      : t('Nenhum ponto criado nesta sessão foi reportado à Central.', 'No recovery point created in this session has been reported to Work Center.');
    const autostartPanel=connected
      ? '<section class="ames-setup-status" data-agent-autostart><b>'+t('Início automático do agente','Agent automatic startup')+'</b><p>'+
        (autoState?.supported===true?(autoState.enabled?t('Configurado neste Windows','Configured in this Windows user'):t('Desativado','Disabled')):
          autoBusy?t('Verificando...','Checking...'):t('Não verificado neste agente','Unverified on this agent'))+'</p>'+
        '<div class="mes-pagination"><button type="button" class="button secondary" data-autostart-toggle '+
        (autoBusy||autoState?.supported!==true||autoState?.conflict||(!autoState.enabled&&!autoState.installed)?'disabled':'')+'>'+
        (autoState?.enabled?t('Desativar início automático','Disable auto-start'):t('Ativar início automático','Enable auto-start'))+'</button>'+
        '<button type="button" class="button secondary" data-autostart-check '+(autoBusy?'disabled':'')+'>'+t('Verificar','Check')+'</button></div>'+
        '<small>'+t('Não abre A-MES, não faz login e não inicia coleta. Um agente antigo deve ser atualizado com backup.','Does not open MES, log in or collect. An old agent requires a backup-safe update.')+'</small>'+
        (autoState?.conflict?'<p role="alert">'+t('Conflito com outro registro de inicialização','Conflicting startup registration')+'</p>':'')+
        (autoMessage?'<p role="status">'+esc(autoMessage)+'</p>':'')+'</section>'
      : '';
    root.hidden=!visible;
    const key=JSON.stringify([checking,checked,expanded,viewerGuideOpen,mode,connected,pairing,connectionError,detector,shared,checks,maintenance,backupBusy,maintenanceMessage,autoState,autoBusy,autoChecked,autoMessage,map3012Busy,map3012Message,typeof document === 'undefined' ? '' : document.documentElement?.lang]);
    if(key===last)return;last=key;
    root.innerHTML = `<div class="ames-preparation" data-preparation>
      <p role="status">${checking ? 'Verificando este computador…' : connected ? 'Agente local conectado' : 'MES local não disponível neste computador'}${!connected && mode === 'viewer' ? ' · Dados compartilhados' : ''}</p>
      ${autostartPanel}
      ${connectionError?`<p class="notice warn" role="status">${esc(connectionError)}</p>`:''}
      ${!connected && client.canPairFromOfficial?.()?`<section class="notice warn" data-workstation-pair-hint><strong>${t('Conectar agente deste computador','Connect this computer’s agent')}</strong><p>${t('Se o agente já está conectado na Central local, não reinstale o CLEAN. Autorize uma única vez a Central HTTPS neste mesmo navegador.','If the agent is already connected locally, do not reinstall CLEAN. Authorize the HTTPS Work Center once in this browser.')}</p><button type="button" class="button primary" data-pair-local>${t('Autorizar agente local','Authorize local agent')}</button></section>`:''}${summary}
      ${pairing?`<button type="button" class="button secondary" data-pair-official>${t('Abrir HTTPS oficial pareado neste computador','Open paired official HTTPS on this computer')}</button><p>${t('Autoriza somente o agente deste computador na nova aba oficial. Não compartilhe a URL de pareamento. O computador sem MES precisa apenas dos dados da equipe.','Authorizes only this computer’s agent in the new official tab. Do not share the pairing URL. A computer without MES only needs team data.')}</p>`:''}
      ${visible ? `<p>Consulte os dados compartilhados ou prepare este computador para coleta. O login A-MES permanece manual.</p>
      <div class="mes-pagination"><button type="button" class="button secondary" data-use-shared>Usar somente dados compartilhados</button><button type="button" class="button secondary" data-prepare-pc>Preparar este computador</button></div>` : ''}
      ${expanded ? `<details open><summary>Pré-teste do posto</summary><ul>${checks.map(c => `<li data-check-state="${c.state}">${esc(c.label)} — <span>${c.state === 'ok' ? 'Verificado' : c.state === 'missing' ? 'Pendente' : 'Não verificado'}</span></li>`).join('')}</ul><p>${ready ? 'Pronto para teste' : 'Conclua os itens pendentes e confirme o login manual A-MES antes da coleta.'}</p><button type="button" class="button secondary" data-preflight ${checking ? 'disabled' : ''}>Verificar novamente</button>
      <section class="notice ${maintenance.tone === 'partial' ? 'warn' : ''}" data-workstation-maintenance><b>${t('Manutenção do posto', 'Workstation maintenance')} · ${esc(maintenanceStateLabel(maintenance.tone))}</b><br><small>${t('Build instalada', 'Installed build')}: ${esc(maintenance.build || '—')} · ${t('Candidato reportado', 'Reported candidate')}: ${esc(maintenance.candidate || '—')} · Setup: ${maintenance.setup_complete ? t('concluído', 'complete') : t('não confirmado', 'not confirmed')}</small><p>${t('Verificação local', 'Local verification')}: ${maintenance.localChecks.map(item => `${esc(maintenanceCheckLabel(item.key))} ${item.state === 'ok' ? '✓' : item.state === 'missing' ? '!' : '?'}`).join(' · ')}</p><p><b>${t('Ponto de recuperação', 'Recovery point')}:</b> ${backupSummary}</p><div class="mes-pagination"><button type="button" class="button secondary" data-workstation-backup ${!connected || backupBusy ? 'disabled' : ''}>${backupBusy ? t('Criando ponto de recuperação…', 'Creating recovery point…') : t('Criar ponto de recuperação agora', 'Create recovery point now')}</button></div>${maintenanceMessage ? `<p role="status">${esc(maintenanceMessage)}</p>` : ''}<details data-3012-map-tools><summary>${t('Diagnóstico 3012 Home', '3012 Home diagnostics')}</summary><p>${t('Mapeia somente a estrutura técnica da 3012 correta na Home. Não executa consulta, não lê valores dos campos e não coleta cookie, sessão ou cabeçalhos.', 'Maps only the technical structure of the canonical 3012 Home view. It does not run a query, read field values, or collect cookies, session data or headers.')}</p><div class="mes-pagination"><button type="button" class="button secondary" data-map-3012 ${!connected || map3012Busy ? 'disabled' : ''}>${map3012Busy ? t('Mapeando 3012 Home…', 'Mapping 3012 Home…') : t('Mapear 3012 Home (somente leitura)', 'Map 3012 Home (read-only)')}</button></div>${map3012Message ? `<p role="status">${esc(map3012Message)}</p>` : ''}<small>${t('O agente reserva a sessão MES, abre a view Home correta e baixa um JSON sanitizado. Envie esse JSON no chat; a consulta controlada por SN será a etapa seguinte.', 'The agent reserves the MES session, opens the correct Home view and downloads a sanitized JSON. Send that JSON in chat; the controlled SN query is the next step.')}</small></details><small>${t('A atualização e o rollback dos arquivos continuam fora do navegador. Crie um ponto de recuperação, encerre o agente antes de substituir arquivos e use somente o pacote/candidato validado para este build.', 'File update and rollback remain outside the browser. Create a recovery point, stop the agent before replacing files, and use only the package/candidate validated for this build.')}</small></section>
      <section data-installation></section></details>` : ''}
      ${!expanded&&viewerGuideOpen?'<section data-installation></section>':''}
    </div>`;
    root.querySelector('[data-sync-guide-verify]')?.addEventListener('click',async()=>{if(checking)return;checking=true;last='';render();try{await verify();}catch{}finally{checking=false;if(!disposed){last='';render();}}});
    root.querySelector('[data-use-shared]')?.addEventListener('click', () => choose('viewer'));
    root.querySelector('[data-prepare-pc]')?.addEventListener('click', () => choose('collector'));
    root.querySelector('[data-preflight]')?.addEventListener('click', check);
    root.querySelector('[data-pair-local]')?.addEventListener('click',()=>client.openLocalPairing());
    root.querySelector('[data-pair-official]')?.addEventListener('click',()=>client.openOfficial());
    root.querySelector('[data-workstation-backup]')?.addEventListener('click', backupNow);
    root.querySelector('[data-autostart-check]')?.addEventListener('click', readAutostart);
    root.querySelector('[data-autostart-toggle]')?.addEventListener('click', toggleAutostart);
    if(connected && !autoChecked && !autoBusy)queueMicrotask(readAutostart);
    if(!connected){autoChecked=false;autoState=null;}
    root.querySelector('[data-map-3012]')?.addEventListener('click', map3012Now);
    onboarding?.clear(); onboarding = null;
    if (expanded || viewerGuideOpen) {
      onboarding = createOnboardingView(root.querySelector('[data-installation]'), {
        onChoice:choose,
        getAgent:()=>store.agent(),
        isPaired:()=>!!client.paired?.(),
        canPair:()=>!!client.canPairFromOfficial?.(),
        onPair:()=>client.openLocalPairing()
      });
      void onboarding.render();
    }
    if (!checked && !checking) queueMicrotask(check);
  }
  return { render, open() { expanded = true; choose('collector'); }, collapse(){expanded=false;viewerGuideOpen=false;render();}, clear() { disposed = true; onboarding?.clear(); root.replaceChildren(); } };
}
