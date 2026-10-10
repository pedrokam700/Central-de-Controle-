function processReady(store){
  return store.agent()?.status==='connected' && store.agent()?.capabilities?.process_timeline===true;
}

function ensureNotice(root,key,message,tone='warn'){
  let node=root.querySelector(`[data-capability-note="${key}"]`);
  if(!node){
    node=document.createElement('div');
    node.dataset.capabilityNote=key;
    node.className=`notice ${tone}`;
    const anchor=root.querySelector('.ames-console-form,.ames-process-evidence,.mes-context-panel');
    (anchor?.parentNode||root).insertBefore(node,anchor?.nextSibling||root.firstChild);
  }
  node.textContent=message;
  return node;
}

function clearNotice(root,key){root.querySelector(`[data-capability-note="${key}"]`)?.remove();}

function applyTrace(root,store){
  const ready=processReady(store);
  const radio=root.querySelector('input[name="trace_mode"][value="process_only"]');
  const card=radio?.closest('.ames-mode-card');
  if(radio){
    radio.disabled=!ready;
    card?.classList.toggle('ames-capability-disabled',!ready);
    card?.setAttribute('aria-disabled',String(!ready));
    const small=card?.querySelector('small');
    if(small)small.textContent=ready?'Somente horários 3022':'3022 em lote indisponível neste agente';
    if(!ready&&radio.checked){
      const fallback=root.querySelector('input[name="trace_mode"][value="reuse_only"]')||root.querySelector('input[name="trace_mode"][value="full"]');
      if(fallback)fallback.checked=true;
    }
  }
  const full=root.querySelector('input[name="trace_mode"][value="full"]')?.closest('.ames-mode-card')?.querySelector('small');
  if(full)full.textContent=ready?'3074 + 2114 + 3022':'3074 + 2114; 3022 será marcado como indisponível';
  if(ready)clearNotice(root,'trace-process');
  else ensureNotice(root,'trace-process','O agente conectado não declara coleta 3022 em lote. Reuso 3074/2114 continua disponível; process_only fica bloqueado até um agente 3022-R12+ ou o agente canônico incorporar o coletor validado.','warn');
}

function applySn(root,store){
  const ready=processReady(store);
  const pipeline=[...root.querySelectorAll('.ames-pipeline span')];
  if(pipeline[3])pipeline[3].textContent=ready?'3022':'3022*';
  if(ready)clearNotice(root,'sn-process');
  else ensureNotice(root,'sn-process','A consulta individual ainda pode tentar a tela 3022 e devolver aviso explícito, mas este agente não declara timeline 3022 integrada. Trate horários de processo como indisponíveis até haver evidência retornada pela fonte.','warn');
}

function applyProcess(root,store){
  const ready=processReady(store);
  if(ready)clearNotice(root,'process-view');
  else ensureNotice(root,'process-view','3022 em lote não está habilitado no agente conectado. Evidência 3022 já persistida continua visível nesta página; nova coleta de processo exige agente 3022-R12+ ou coletor canônico validado.','warn');
}

export function applyMonitorProcessCapability(root,store){
  const button=root?.querySelector('[data-agent-action="deep"]');
  if(!button)return;
  const ready=processReady(store);
  button.textContent=ready?'Rastrear 3074 + 2114 + 3022':'Rastrear 3074 + 2114 · 3022 indisponível';
  button.title=ready?'Coleta completa disponível neste agente.':'Este agente não declara 3022 em lote. A coleta continua com 3074 + 2114 e o Console sinaliza 3022 como indisponível.';
  const card=button.closest('.stat');
  const note=card?.querySelector('.stat-note');
  if(note)note.textContent=ready?'Atualiza 2114 das PCBAs já conhecidas ou executa rastreabilidade 3074 + 2114 + 3022.':'Atualiza 2114 e reuso 3074. O 3022 em lote fica explícito como indisponível até o agente declarar essa capacidade.';
}

export function withProcessCapability(view,root,store,kind){
  const apply=kind==='trace'?applyTrace:kind==='sn'?applySn:applyProcess;
  return Object.freeze({
    render(){view.render();apply(root,store);},
    clear(){view.clear?.();}
  });
}
