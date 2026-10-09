import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

export function createAutomationView(root,store,client) {
  let config,agentKey='',mounted=false,disposed=false;
  function render(){
    if(!mounted){
      root.innerHTML=`<div class="ames-view-intro"><h2>Monitoramento A-MES</h2><p>Poucos cliques na frente; coleta, snapshots e correlações por trás. Cada linha continua independente.</p></div>
      <div class="ames-reuse-kpis">
        <article class="stat"><span class="stat-label">Rotina da manhã</span><strong>Fechar dia anterior</strong><p class="stat-note">Consulta 3028 da janela anterior e preserva cada linha em snapshot próprio.</p><button class="button secondary" data-agent-action="previous_day">Atualizar dia anterior</button></article>
        <article class="stat"><span class="stat-label">Durante o dia</span><strong>Monitorar hoje</strong><p class="stat-note">Atualize agora ou deixe recorrente. MES ocupado: monitor pula o ciclo sem criar fila.</p><div class="mes-pagination"><button class="button secondary" data-agent-action="today">Atualizar agora</button><button class="button secondary" data-agent-action="monitorStart">Iniciar monitoramento</button><button class="button secondary" data-agent-action="monitorStop">Parar</button></div></article>
        <article class="stat"><span class="stat-label">AT / reparo</span><strong>Atualizar estados</strong><p class="stat-note">Rastreia 3074, 2114 e 3022 ou atualiza somente o estado N/Y conhecido.</p><div class="mes-pagination"><button class="button secondary" data-agent-action="deep">Rastrear 3074 + 2114 + 3022</button><button class="button secondary" data-agent-action="repairs">Atualizar N/Y</button></div></article>
      </div>
      <section class="mes-context-panel"><div class="mes-pagination"><button class="button secondary" data-agent-action="connect">Conectar agente local</button><button class="button secondary" data-agent-action="refresh">Atualizar leitura</button><button class="button secondary" data-agent-action="excel">Baixar Excel</button><button class="button secondary" data-agent-action="cancel">Cancelar job</button></div><form data-agent-form><fieldset><legend>Linhas da coleta</legend>${LINE_IDS.map((line,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${line}">Linha ${i+1} · ${line}</label>`).join('')}<button type="button" class="button secondary" data-agent-lines="all">Todas</button><button type="button" class="button secondary" data-agent-lines="none">Limpar seleção</button></fieldset><div class="mes-filters"><label>Perfil<select name="performance"><option value="balanced">Equilibrado</option><option value="fast">Rápido</option><option value="safe">Seguro</option></select></label><label>Ocorrências máximas / linha (0 = todas)<input type="number" name="max_failures" min="0" max="100000" value="0"></label><label>PCBAs máximas / linha (0 = todas)<input type="number" name="max_pcbas" min="0" max="100000" value="0"></label><label>Intervalo monitor<select name="interval_minutes"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">60 min</option></select></label></div><label>Falhas para rastreabilidade<select name="defectMode"><option value="all">Todas as falhas</option><option value="selected">Códigos selecionados</option></select></label><label>Códigos exatos separados por vírgula<input name="codes" autocomplete="off" placeholder="vazio = todas"></label><div class="mes-pagination"><button type="button" class="button secondary" data-agent-action="save">Salvar linhas/perfil no agente</button></div><details><summary>Execução avançada / período customizado</summary><div class="mes-filters"><label>Início<input type="datetime-local" name="start_at"></label><label>Fim<input type="datetime-local" name="end_at"></label><label>Turno / metadado<input name="shift" placeholder="1st Shift"></label></div><button type="button" class="button secondary" data-agent-action="custom">Coletar período selecionado</button></details></form><div data-agent-status role="status" aria-live="polite"></div></section>`;
      mounted=true;
    }
    const state=store.agent();
    if(state.config&&state.config!==config){const interval=root.querySelector('[name=interval_minutes]');if(interval)interval.value=String(state.config.monitor_interval_minutes||30);config=state.config;for(const input of root.querySelectorAll('[name=lines]'))input.checked=config.configured_lines.includes(input.value);root.querySelector('[name=performance]').value=config.performance;}
    for(const button of root.querySelectorAll('[data-agent-action]'))button.disabled=button.dataset.agentAction!=='connect'&&state.status!=='connected';
    const key=JSON.stringify(state);if(key===agentKey)return;agentKey=key;
    const job=state.job;
    root.querySelector('[data-agent-status]').innerHTML=`<p><b>Status da coleta:</b> ${state.status==='connected'?'agente conectado · scheduler FIFO verificado':'agente desconectado'}${state.agent_build?` · ${esc(state.agent_build)}`:''}${state.readiness?` · motor ${state.readiness.engine?'disponível':'indisponível'} · Chrome ${state.readiness.chrome?'acessível':'indisponível'} · rede MES ${state.readiness.ames?'acessível':'indisponível'} · 3022 ${state.readiness.process?'pronto':'não confirmado'}`:''}</p>${state.sync?`<p>Sincronização desta conta: ${esc(state.sync.status||'aguardando')} · ${esc(state.sync.pending||0)} pendente(s). Leitura remota: ${esc(state.sync.read_status||'aguardando')}<br>${esc(state.sync.error||state.sync.read_error||'')}</p>`:''}${state.error?`<p class="notice warn">${esc(state.error)}</p>`:''}${state.monitor?`<p>Monitor: ${state.monitor.enabled?'ativo':'desativado'} · intervalo ${esc(state.monitor.interval_minutes||'não informado')} min</p>`:''}${job?`<p>Job ${esc(job.id)} · ${esc(job.status)} · ${esc(job.stage)} · ${esc(job.mes_state||'')}<br>${esc(job.message||'')}</p>${Object.entries(job.stage_progress||{}).map(([stage,p])=>`<p>${esc(stage)} · ${esc(p.line||'linha não informada')} · ${esc(p.current)} / ${esc(p.total)} · ${esc(p.line_percent)}% nesta linha<br>${esc(p.detail||'')}</p>`).join('')}`:'<p>Nenhum job iniciado nesta sessão.</p>'}`;
  }
  function scope(){const form=root.querySelector('form');const value=Object.fromEntries(new FormData(form));const codes=value.codes.split(',').map(x=>x.trim()).filter(Boolean);if(value.defectMode==='selected'&&!codes.length)throw Error('Informe ao menos um código de falha.');return {...value,lines:[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value),defect_codes:value.defectMode==='selected'?codes:[],max_failures:Number(value.max_failures||0),max_pcbas:Number(value.max_pcbas||0)};}
  root.addEventListener('submit',e=>e.preventDefault());
  root.addEventListener('click',async event=>{
    const select=event.target.closest('[data-agent-lines]');if(select){for(const box of root.querySelectorAll('[name=lines]'))box.checked=select.dataset.agentLines==='all';return;}
    const button=event.target.closest('[data-agent-action]');if(!button||button.disabled||!client)return;
    button.disabled=true;
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
    finally{if(!disposed){render();button.focus();}}
  });
  return {render,clear(){disposed=true;}};
}
