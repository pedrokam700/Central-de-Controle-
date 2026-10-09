import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

export function createAutomationView(root,store,client) {
  let config,agentKey='',mounted=false,disposed=false;
  function render(){
    if(!mounted){
      root.innerHTML=`<details class="mes-context-panel"><summary>Coleta e agente deste computador</summary><p>Conecte somente no computador da fábrica com o patch de serialização instalado. Acesso direto ao agente local; nenhuma credencial A-MES é salva na Central.</p><div class="mes-pagination"><button class="button secondary" data-agent-action="connect">Conectar agente local</button><button class="button secondary" data-agent-action="refresh">Atualizar leitura</button></div><form data-agent-form><fieldset><legend>Linhas da coleta</legend>${LINE_IDS.map((line,i)=>`<label class="mes-opt-in"><input type="checkbox" name="lines" value="${line}">Linha ${i+1} · ${line}</label>`).join('')}<button type="button" class="button secondary" data-agent-lines="all">Todas</button><button type="button" class="button secondary" data-agent-lines="none">Limpar seleção</button></fieldset><div class="mes-filters"><label>Perfil<select name="performance"><option value="balanced">Equilibrado</option><option value="fast">Rápido</option><option value="safe">Seguro</option></select></label><label>Ocorrências máximas / linha (0 = todas)<input type="number" name="max_failures" min="0" max="100000" value="0"></label><label>PCBAs máximas / linha (0 = todas)<input type="number" name="max_pcbas" min="0" max="100000" value="0"></label></div><label>Falhas para 3074/2114<select name="defectMode"><option value="all">Todas as falhas</option><option value="selected">Códigos selecionados</option></select></label><label>Códigos exatos separados por vírgula<input name="codes" autocomplete="off" placeholder="D1, D2"></label><p>Linhas e perfil podem ser salvos no agente. Códigos e limites valem para esta execução 3074/2114; não alteram a coleta 3028. Nenhuma soma operacional entre linhas.</p><div class="mes-pagination"><button type="button" class="button secondary" data-agent-action="save">Salvar linhas/perfil no agente</button><button type="button" class="button secondary" data-agent-action="today">Coletar 3028 · hoje</button><button type="button" class="button secondary" data-agent-action="previous_day">Coletar 3028 · dia anterior</button><button type="button" class="button secondary" data-agent-action="deep">Coletar 3074 + 2114</button><button type="button" class="button secondary" data-agent-action="cancel">Solicitar cancelamento</button><button type="button" class="button secondary" data-agent-action="excel">Baixar Excel original · 11 sheets</button></div></form><details><summary>Monitor de baixa prioridade</summary><label>Intervalo (minutos)<input name="interval_minutes" type="number" min="5" value="30"></label><button type="button" class="button secondary" data-agent-action="monitorStart">Ativar monitor</button><button type="button" class="button secondary" data-agent-action="monitorStop">Desativar monitor</button><p>MES ocupado: pula o ciclo sem enfileirar. O monitor continua no agente mesmo ao sair da Central. Atualize a leitura para consultar seus resultados.</p></details><div data-agent-status role="status" aria-live="polite"></div></details>`;
      mounted=true;
    }
    const state=store.agent();
    if(state.config&&state.config!==config){root.querySelector('[name=interval_minutes]').value=state.config.monitor_interval_minutes||30;config=state.config;for(const input of root.querySelectorAll('[name=lines]'))input.checked=config.configured_lines.includes(input.value);root.querySelector('[name=performance]').value=config.performance;}
    for(const button of root.querySelectorAll('[data-agent-action]'))button.disabled=button.dataset.agentAction!=='connect'&&state.status!=='connected';
    const key=JSON.stringify(state);if(key===agentKey)return;agentKey=key;
    const job=state.job;
    root.querySelector('[data-agent-status]').innerHTML=`<p>Agente: ${state.status==='connected'?'conectado · scheduler FIFO verificado':'desconectado'}${state.readiness?` · motor ${state.readiness.engine?'disponível':'indisponível'} · Chrome ${state.readiness.chrome?'acessível':'indisponível'} · rede MES ${state.readiness.ames?'acessível':'indisponível'}`:''}</p>${state.sync?`<p>Sincronização desta conta: ${esc(state.sync.status||'aguardando')} · ${esc(state.sync.pending||0)} pendente(s). Leitura remota: ${esc(state.sync.read_status||'aguardando')}<br>${esc(state.sync.error||state.sync.read_error||'')}</p>`:''}${state.error?`<p>${esc(state.error)}</p>`:''}${state.monitor?`<p>Monitor: ${state.monitor.enabled?'ativo':'desativado'} · intervalo ${esc(state.monitor.interval_minutes||'não informado')} min</p>`:''}${job?`<p>Job ${esc(job.id)} · ${esc(job.status)} · ${esc(job.stage)} · ${esc(job.mes_state||'')}<br>${esc(job.message||'')}</p>${Object.entries(job.stage_progress||{}).map(([stage,p])=>`<p>${esc(stage)} · ${esc(p.line||'linha não informada')} · ${esc(p.current)} / ${esc(p.total)} · ${esc(p.line_percent)}% nesta linha<br>${esc(p.detail||'')}</p>`).join('')}`:'<p>Nenhum job iniciado nesta sessão. Não há progresso estimado.</p>'}`;
  }
  function scope(){const form=root.querySelector('form');const value=Object.fromEntries(new FormData(form));const codes=value.codes.split(',').map(x=>x.trim()).filter(Boolean);if(value.defectMode==='selected'&&!codes.length)throw Error('Informe ao menos um código de falha.');return {...value,lines:[...form.querySelectorAll('[name=lines]:checked')].map(x=>x.value),defect_codes:value.defectMode==='selected'?codes:[]};}
  root.addEventListener('submit',e=>e.preventDefault());
  root.addEventListener('click',async event=>{
    const select=event.target.closest('[data-agent-lines]');if(select){for(const box of root.querySelectorAll('[name=lines]'))box.checked=select.dataset.agentLines==='all';return;}
    const button=event.target.closest('[data-agent-action]');if(!button||button.disabled||!client)return;
    button.disabled=true;
    try{const action=button.dataset.agentAction;
      if(action==='connect')await client.connect();
      else if(action==='refresh')await client.refresh();
      else if(action==='save')await client.saveConfig(scope());
      else if(action==='monitorStart'||action==='monitorStop')await client.monitor(action==='monitorStart',{...scope(),interval_minutes:root.querySelector('[name=interval_minutes]').value});
      else if(action==='cancel')await client.cancel();
      else if(action==='excel'){const blob=await client.excel(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMES_EQUIPE_LINHAS.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else await client.collect(action,scope());
    }catch(error){if(!disposed)store.updateAgent({error:error.message});}
    finally{if(!disposed){render();button.focus();}}
  });
  return {render,clear(){disposed=true;}};
}
