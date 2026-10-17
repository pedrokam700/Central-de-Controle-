import {collectionStatus} from './collection-status.mjs';
import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';
import {readHardeningDiagnostics,readAgentJobDiagnostics} from './agent-diagnostics.mjs';
import {automationLanguage,automationText,formatAutomationTime,formatDuration,sourceLabel,freshnessLabel,readinessLabel,formatBytes,diagnosticsLabel} from './automation-support.mjs';

export function createAutomationView(root,store,client) {
  let config,agentKey='',mounted=false,disposed=false;
  let supportDiagnostics=null,supportJobs=null,supportBusy=false,supportError='';
  const text=(pt,en)=>automationText(automationLanguage(),pt,en);

  function renderSupport(state){
    const host=root.querySelector('[data-agent-support]');if(!host)return;
    const language=automationLanguage(),timezone=state.config?.timezone||'America/Sao_Paulo',runtime=state.runtime||{},readiness=state.readiness||{};
    const title=root.querySelector('[data-agent-support-title]');if(title)title.textContent=automationText(language,'Suporte, origem e desempenho','Support, source & performance');
    const lineRows=LINE_IDS.map((line,index)=>{
      const read=store.read(line),snapshot=read.snapshot,raw=snapshot?.collected_at||'';
      return `<tr><td>${automationText(language,'Linha','Line')} ${index+1} · ${esc(line)}</td><td>${esc(sourceLabel(read.source,language))}</td><td>${esc(freshnessLabel(read.freshness,language))}</td><td title="${esc(raw)}">${esc(formatAutomationTime(raw,{language,timeZone:timezone}))}</td><td>${esc(snapshot?.snapshot_id||'—')}</td></tr>`;
    }).join('');
    const job=state.job;
    const backup=runtime.latest_backup;
    const monitor=state.monitor;
    const sync=state.sync;
    const recentJobs=supportJobs?.jobs||[];
    const latestSuccess=recentJobs.find(item=>item.status==='done')||null;
    const latestError=recentJobs.find(item=>item.status==='error')||null;
    const jobLine=(item,label)=>item?`<p><b>${label}:</b> <span title="${esc(item.finished_at||item.started_at||item.created_at||'')}">${esc(formatAutomationTime(item.finished_at||item.started_at||item.created_at,{language,timeZone:timezone}))}</span> · ${esc(item.kind||'—')} · ${esc(formatDuration(item.started_at,item.finished_at,{language}))}${item.stage?` · ${esc(item.stage)}`:''}</p>`:`<p><b>${label}:</b> —</p>`;
    let diagnosticHtml=`<p>${automationText(language,'Diagnóstico detalhado ainda não consultado. A leitura é local e somente leitura; não executa comandos no MES.','Detailed diagnostics have not been read yet. This is local and read-only; it does not execute MES commands.')}</p>`;
    if(supportBusy)diagnosticHtml=`<p role="status">${automationText(language,'Lendo diagnóstico local...','Reading local diagnostics...')}</p>`;
    else if(supportError)diagnosticHtml=`<p class="notice warn">${esc(supportError)}</p>`;
    else if(supportDiagnostics){
      const diag=supportDiagnostics,indexes=diag.performanceIndexes,origins=diag.originPolicy;
      diagnosticHtml=`<p><b>${automationText(language,'Diagnóstico','Diagnostics')}:</b> ${esc(diagnosticsLabel(diag.status,diag.reason,language))}${diag.level?` · hardening ${esc(diag.level)}`:''}${diag.integrity?` · integrity ${esc(diag.integrity)}`:''}</p>
        ${indexes?`<p><b>${automationText(language,'Índices locais','Local indexes')}:</b> ${indexes.ok?automationText(language,'OK','OK'):automationText(language,'atenção','attention')} · ${esc(indexes.present??'—')}/${esc(indexes.expected??'—')}${indexes.missing?.length?` · ${automationText(language,'faltando','missing')}: ${indexes.missing.slice(0,8).map(esc).join(', ')}`:''}</p>`:''}
        ${origins?`<p><b>${automationText(language,'Política de origem','Origin policy')}:</b> ${origins.ok?automationText(language,'OK','OK'):automationText(language,'atenção','attention')} · ${esc(origins.mode||'—')} · local ${esc(origins.localOrigins??'—')} · remote ${esc(origins.remoteOrigins??'—')} · rejected ${esc(origins.rejectedEntries??'—')}</p>`:''}`;
    }
    if(supportJobs&&supportJobs.status!=='ok')diagnosticHtml+=`<p><b>${automationText(language,'Histórico de jobs','Job history')}:</b> ${esc(diagnosticsLabel(supportJobs.status,supportJobs.reason,language))}</p>`;
    host.innerHTML=`<div class="ames-reuse-kpis">
      <article class="stat"><span class="stat-label">${automationText(language,'POSTO','WORKSTATION')}</span><strong>${esc(state.status||'disconnected')}</strong><span class="stat-note">Build/SHA: ${esc(state.agent_build||state.capabilities?.agent_build||'—')}<br>Runtime: ${esc(runtime.candidate_version||'—')}</span></article>
      <article class="stat"><span class="stat-label">${automationText(language,'SAÚDE LOCAL','LOCAL HEALTH')}</span><strong>${automationText(language,'SQLite','SQLite')} ${esc(readinessLabel(readiness.sqlite,language))}</strong><span class="stat-note">Engine ${esc(readinessLabel(readiness.engine,language))} · Chrome ${esc(readinessLabel(readiness.chrome,language))} · A-MES ${esc(readinessLabel(readiness.ames,language))} · 3022 ${esc(readinessLabel(readiness.process,language))}</span></article>
      <article class="stat"><span class="stat-label">${automationText(language,'EXECUÇÃO','EXECUTION')}</span><strong>${esc(job?.stage||automationText(language,'sem job ativo','no active job'))}</strong><span class="stat-note">${job?`${automationText(language,'Status','Status')}: ${esc(job.status||'—')} · ${automationText(language,'Job','Job')} ${esc(job.id||'—')}`:automationText(language,'Nenhuma execução registrada nesta sessão.','No execution recorded in this session.')}</span></article>
    </div>
    <div class="table-wrap"><table><thead><tr><th>${automationText(language,'Linha','Line')}</th><th>${automationText(language,'Origem','Source')}</th><th>${automationText(language,'Atualidade','Freshness')}</th><th>${automationText(language,'Última coleta','Last collection')}</th><th>Snapshot</th></tr></thead><tbody>${lineRows}</tbody></table></div>
    <p><b>${automationText(language,'Monitor','Monitor')}:</b> ${monitor?(monitor.enabled?automationText(language,'ativo','active'):automationText(language,'desativado','disabled')):automationText(language,'não informado','unknown')}${monitor?.interval_minutes?` · ${esc(monitor.interval_minutes)} min`:''}${monitor?.next_run_at?` · ${automationText(language,'próximo','next')}: <span title="${esc(monitor.next_run_at)}">${esc(formatAutomationTime(monitor.next_run_at,{language,timeZone:timezone}))}</span>`:''}</p>
    <p><b>${automationText(language,'Sincronização','Sync')}:</b> ${sync?`${esc(sync.status||'—')} · ${esc(sync.pending??'—')} ${automationText(language,'pendente(s)','pending')} · ${automationText(language,'leitura remota','remote read')} ${esc(sync.read_status||'—')}`:automationText(language,'não informada','unknown')}</p>
    <p><b>${automationText(language,'Último backup conhecido','Latest known backup')}:</b> ${backup?`<span title="${esc(backup.created_at||'')}">${esc(formatAutomationTime(backup.created_at,{language,timeZone:timezone}))}</span> · ${esc(formatBytes(backup.bytes))} · ${esc(backup.reason||'—')}`:'—'}</p>
    ${jobLine(latestSuccess,automationText(language,'Último sucesso','Last success'))}
    ${jobLine(latestError,automationText(language,'Último erro','Last error'))}${latestError?.error?`<p class="notice warn"><b>${automationText(language,'Erro','Error')}:</b> ${esc(latestError.error)}</p>`:''}
    <div class="mes-context-panel"><h4>${automationText(language,'Diagnóstico técnico do posto','Workstation technical diagnostics')}</h4>${diagnosticHtml}<div class="mes-pagination"><button type="button" class="button secondary" data-agent-support-refresh${supportBusy?' disabled':''}>${supportBusy?automationText(language,'Lendo...','Reading...'):automationText(language,'Atualizar diagnóstico','Refresh diagnostics')}</button></div></div>`;
  }

  function render(){
    if(!mounted){
      root.innerHTML=`<div class="ames-reuse-kpis ames-monitor-actions">
        <article class="stat"><span class="stat-label">ROTINA DA MANHÃ</span><strong>Fechar dia anterior</strong><span class="stat-note">Consulta diretamente o 3028 no período anterior e preserva cada linha em snapshot próprio.</span><button class="button primary" data-agent-action="previous_day">Atualizar dia anterior</button></article>
        <article class="stat"><span class="stat-label">DURANTE O DIA</span><strong>Monitorar hoje</strong><span class="stat-note">Atualize quando quiser ou deixe recorrente. Cada ciclo consulta o 3028 direto no A-MES.</span><div class="mes-pagination"><button class="button secondary" data-agent-action="today">Atualizar agora</button><button class="button primary" data-agent-action="monitorStart">Iniciar monitoramento</button><button class="button secondary" data-agent-action="monitorStop">Parar</button><select name="interval_minutes" aria-label="Intervalo monitor"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">60 min</option></select></div></article>
        <article class="stat"><span class="stat-label">AT / REPARO</span><strong>Atualizar estados</strong><span class="stat-note">Atualiza 2114 das PCBAs já conhecidas ou executa rastreabilidade 3074 + 2114 + 3022.</span><div class="mes-pagination"><button class="button primary" data-agent-action="deep">Rastrear 3074 + 2114 + 3022</button><button class="button secondary" data-agent-action="repairs">Atualizar N/Y</button><button class="button secondary" data-agent-action="excel">Baixar Excel</button></div></article>
      </div>
      <div class="ames-collection-strip"><b>Status da coleta:</b> <span data-agent-strip>pronto. Ao iniciar, o andamento ou erro aparecerá aqui.</span></div>
      <details class="mes-context-panel ames-monitor-config"><summary>Execução avançada e filtros</summary><div class="ames-monitor-config-body"><div class="section-head"><div><h3>Escopo da coleta</h3><p>Use apenas quando precisar limitar linha, período, falha ou desempenho.</p></div><div class="mes-pagination"><button class="button secondary" data-agent-action="connect">Conectar agente local</button><button class="button secondary" data-agent-action="refresh">Atualizar leitura</button><button class="button secondary" data-agent-action="cancel">Cancelar job</button></div></div><form data-agent-form><fieldset><legend>Linhas da coleta</legend>${LINE_IDS.map((line,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${line}">Linha ${i+1} · ${line}</label>`).join('')}<button type="button" class="button secondary" data-agent-lines="all">Todas</button><button type="button" class="button secondary" data-agent-lines="none">Limpar seleção</button></fieldset><div class="mes-filters"><label>Perfil<select name="performance"><option value="balanced">Equilibrado</option><option value="fast">Rápido</option><option value="safe">Seguro</option></select></label><details><summary>Limites avançados</summary><p>Sem limite por padrão. Preencha somente para limitar esta execução.</p><label>Ocorrências máximas / linha<input type="number" name="max_failures" min="1" max="100000" placeholder="Sem limite"></label><label>PCBAs máximas / linha<input type="number" name="max_pcbas" min="1" max="100000" placeholder="Sem limite"></label></details><label>Falhas para rastreabilidade<select name="defectMode"><option value="all">Todas as falhas</option><option value="selected">Códigos selecionados</option></select></label><details><summary>Códigos manuais (avançado)</summary><label>Códigos exatos separados por vírgula<input name="codes" autocomplete="off" placeholder="Separados por vírgula"></label></details><label>Turno / metadado<input name="shift" placeholder="1st Shift"></label><label>Início<input type="datetime-local" name="start_at"></label><label>Fim<input type="datetime-local" name="end_at"></label></div><div class="mes-pagination"><button type="button" class="button secondary" data-agent-action="save">Salvar linhas/perfil</button><button type="button" class="button primary" data-agent-action="custom">Coletar período selecionado</button></div></form><div data-agent-status role="status" aria-live="polite"></div></div></details>
      <details class="mes-context-panel ames-monitor-support"><summary data-agent-support-title>Suporte, origem e desempenho</summary><div data-agent-support></div></details>`;
      mounted=true;
    }
    const state=store.agent();
    if(state.config&&state.config!==config){const interval=root.querySelector('[name=interval_minutes]');if(interval)interval.value=String(state.config.monitor_interval_minutes||30);config=state.config;for(const input of root.querySelectorAll('[name=lines]'))input.checked=config.configured_lines.includes(input.value);root.querySelector('[name=performance]').value=config.performance;}
    for(const button of root.querySelectorAll('[data-agent-action]'))button.disabled=button.dataset.agentAction!=='connect'&&(state.status!=='connected'||!!state.submitting);
    const strip=root.querySelector('[data-agent-strip]');
    if(strip)strip.innerHTML=collectionStatus(state);
    renderSupport(state);
    const key=JSON.stringify(state);if(key===agentKey)return;agentKey=key;
    const job=state.job;
    root.querySelector('[data-agent-status]').innerHTML=`${state.readiness?`<p><b>Estado do motor:</b> ${state.readiness.engine?'disponível':'indisponível'} · Chrome ${state.readiness.chrome?'conectado':'indisponível'} · rede A-MES ${state.readiness.ames?'conectada':'indisponível'} · 3022 ${state.readiness.process?'pronto':'não confirmado'}</p>`:''}${state.sync?`<p><b>Sincronização:</b> ${esc(state.sync.status||'aguardando')} · ${esc(state.sync.pending||0)} pendente(s) · leitura remota ${esc(state.sync.read_status||'aguardando')}</p>`:''}${state.monitor?`<p><b>Monitor:</b> ${state.monitor.enabled?'ativo':'desativado'} · intervalo ${esc(state.monitor.interval_minutes||'não informado')} min</p>`:''}${job?`${Object.entries(job.stage_progress||{}).map(([stage,p])=>`<p>${esc(stage)} · ${esc(p.line||'linha não informada')} · ${esc(p.current)} / ${esc(p.total)} · ${esc(p.line_percent)}% · ${esc(p.detail||'')}</p>`).join('')}`:'<p>Nenhum job iniciado nesta sessão.</p>'}`;
  }
  function scope(){const form=root.querySelector('form');const value=Object.fromEntries(new FormData(form));const codes=(value.codes||'').split(',').map(x=>x.trim()).filter(Boolean);if(value.defectMode==='selected'&&!codes.length)throw Error('Informe ao menos um código de falha.');return {...value,interval_minutes:root.querySelector('[name=interval_minutes]')?.value||30,lines:[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value),defect_codes:value.defectMode==='selected'?codes:[],max_failures:Number(value.max_failures||0),max_pcbas:Number(value.max_pcbas||0)};}
  root.addEventListener('submit',e=>e.preventDefault());
  root.addEventListener('click',async event=>{
    const supportButton=event.target.closest('[data-agent-support-refresh]');
    if(supportButton){
      if(supportBusy)return;
      supportBusy=true;supportError='';renderSupport(store.agent());
      try{[supportDiagnostics,supportJobs]=await Promise.all([readHardeningDiagnostics(),readAgentJobDiagnostics()]);}
      catch(error){supportError=error?.message||text('Falha ao ler diagnóstico local.','Failed to read local diagnostics.');}
      finally{supportBusy=false;if(!disposed)renderSupport(store.agent());}
      return;
    }
    const select=event.target.closest('[data-agent-lines]');if(select){for(const box of root.querySelectorAll('[name=lines]'))box.checked=select.dataset.agentLines==='all';return;}
    const button=event.target.closest('[data-agent-action]');if(!button||button.disabled||!client)return;
    button.disabled=true;
    if(button.dataset.agentAction==='deep'){store.updateAgent({submitting:true,error:''});render();}
    try{const action=button.dataset.agentAction,value=scope();
      if(action==='connect')await client.connect();
      else if(action==='refresh')await client.refresh();
      else if(action==='save')await client.saveConfig(value);
      else if(action==='monitorStart'||action==='monitorStop')await client.monitor(action==='monitorStart',{...value,interval_minutes:root.querySelector('[name=interval_minutes]').value});
      else if(action==='cancel')await client.cancel();
      else if(action==='excel'){const blob=await client.excel(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMES_EQUIPE_LINHAS.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else if(action==='repairs'){for(const line of value.lines)await client.auxiliary('repairs',{line,snapshot_id:store.read(line).snapshot?.snapshot_id,unresolved_only:true});}
      else if(action==='deep')await client.collect('deep',{...value,trace_mode:'full'});
      else if(action==='custom')await client.collect('custom',value);
      else await client.collect(action,value);
    }catch(error){if(!disposed)store.updateAgent({error:error.message});}
    finally{if(!disposed){store.updateAgent({submitting:false});render();button.focus();}}
  });
  return {render,clear(){disposed=true;}};
}
