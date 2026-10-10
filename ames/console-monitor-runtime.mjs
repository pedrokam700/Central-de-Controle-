import { LINE_IDS } from './data/contract.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STAGES=['3028','3074','2114','3022'];

function stageInfo(job,stage,processReady){
  if(stage==='3022'&&!processReady)return {pct:0,label:'indisponível neste agente',state:'disabled'};
  const entries=Object.entries(job?.stage_progress||{});
  const match=entries.find(([key,value])=>String(key).includes(stage)||String(value?.stage||'').includes(stage));
  if(match){const p=match[1]||{};return {pct:Number(p.line_percent??p.percent??0)||0,label:p.detail||p.message||`${p.current??0}/${p.total??0}`,state:'active'};}
  const active=String(job?.stage||'').includes(stage);
  const done=STAGES.indexOf(stage)<STAGES.findIndex(x=>String(job?.stage||'').includes(x));
  return {pct:active?Math.max(8,Number(job?.progress||0)):done?100:0,label:active?(job?.message||'em execução'):done?'concluído':'aguardando',state:active?'active':done?'done':'idle'};
}

export function createMonitorRuntimeView(root,store){
  let host,last='';
  function render(){
    const a=store.agent(),job=a.job,processReady=a.status==='connected'&&a.capabilities?.process_timeline===true;
    const lines=LINE_IDS.map((line,i)=>{const read=store.read(line);return {line,index:i+1,snapshot:read.snapshot?.snapshot_id||null,source:read.source,freshness:read.freshness};});
    const key=JSON.stringify([a.status,a.readiness,a.agent_build,job?.id,job?.status,job?.stage,job?.progress,job?.stage_progress,processReady,lines]);if(key===last)return;last=key;
    if(!host){host=document.createElement('section');host.className='ames-monitor-runtime';root.append(host);}
    host.innerHTML=`<div class="ames-runtime-grid"><section class="mes-context-panel"><div class="section-head"><div><h3>Pipeline da execução</h3><p>Mesmo fluxo operacional da automação local; cada etapa mostra somente o que o agente realmente declara ou executa.</p></div><span class="ames-runtime-job">${esc(job?`${job.status||''} · ${job.id||''}`:'AGUARDANDO')}</span></div><div class="ames-runtime-pipeline">${STAGES.map(stage=>{const info=stageInfo(job,stage,processReady);return`<article class="ames-runtime-stage ${info.state}"><div><b>${stage}</b><span>${Math.max(0,Math.min(100,info.pct))}%</span></div><div class="ames-runtime-bar"><i style="width:${Math.max(0,Math.min(100,info.pct))}%"></i></div><small>${esc(info.label)}</small></article>`}).join('')}</div></section><aside class="mes-context-panel"><div class="section-head"><div><h3>Estado do motor</h3><p>O navegador é interface; coleta e persistência ficam no agente/SQLite.</p></div></div><div class="ames-runtime-kv"><span>Agente</span><b>${a.status==='connected'?'Conectado':'Desconectado'}</b><span>Motor</span><b>${a.readiness?.engine?'Disponível':'Indisponível'}</b><span>Chrome CDP</span><b>${a.readiness?.chrome?'Conectado':'Indisponível'}</b><span>Rede A-MES</span><b>${a.readiness?.ames?'Conectada':'Indisponível'}</b><span>3022 em lote</span><b>${processReady?'Disponível':'Indisponível'}</b><span>Build</span><b>${esc(a.agent_build||a.capabilities?.agent_build||'—')}</b></div></aside></div><div class="ames-runtime-lines">${lines.map(x=>`<span><b>Linha ${x.index}</b> · ${esc(x.snapshot||'sem snapshot')} · ${esc(x.source||'sem fonte')} · ${esc(x.freshness||'idade desconhecida')}</span>`).join('')}</div>`;
  }
  return {render,clear(){host?.remove();host=null;last='';}};
}
