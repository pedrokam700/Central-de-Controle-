import { LINE_IDS } from './data/contract.mjs';
import { AGENT_URL } from './data/agent-contract.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const STAGES=['3028','3074','2114','3022'];

function stageInfo(job,stage,processReady){
  if(stage==='3022'&&!processReady)return {pct:0,label:'indisponível neste agente',state:'disabled'};
  const entries=Object.entries(job?.stage_progress||{});
  const match=entries.find(([key,value])=>String(key).includes(stage)||String(value?.stage||'').includes(stage));
  if(match){const p=match[1]||{};return {pct:Number(p.line_percent??p.percent??0)||0,label:p.detail||p.message||`${p.current??0}/${p.total??0}`,state:'active'};}
  const active=String(job?.stage||'').includes(stage);
  const currentIndex=STAGES.findIndex(x=>String(job?.stage||'').includes(x));
  const done=currentIndex>=0&&STAGES.indexOf(stage)<currentIndex;
  return {pct:active?Math.max(8,Number(job?.progress||0)):done?100:0,label:active?(job?.message||'em execução'):done?'concluído':'aguardando',state:active?'active':done?'done':'idle'};
}

function gateModel(agent,lines,processReady){
  const connected=agent.status==='connected';
  const core=[
    ['Agente local',connected,connected?'conectado':'desconectado'],
    ['Motor A-MES',!!agent.readiness?.engine,agent.readiness?.engine?'disponível':'indisponível'],
    ['Chrome / CDP',!!agent.readiness?.chrome,agent.readiness?.chrome?'conectado':'indisponível'],
    ['Rede A-MES',!!agent.readiness?.ames,agent.readiness?.ames?'conectada':'indisponível'],
    ['Scheduler FIFO',connected,connected?'validado na conexão':'aguarda conexão'],
    ['3022 em lote',processReady,processReady?'capacidade declarada':'indisponível / não declarada'],
  ];
  const coreReady=core.slice(0,5).every(([,ok])=>ok);
  const snapshots=lines.filter(x=>x.snapshot).length;
  const gateStatus=!connected?'CONECTE O AGENTE':!coreReady?'BLOQUEADO NO POSTO':!processReady?'PARCIAL · 3022 EM LOTE PENDENTE':'PRONTO PARA VALIDAR 9/9';
  const gateClass=!connected||!coreReady?'blocked':processReady?'ready':'partial';
  return {core,coreReady,snapshots,gateStatus,gateClass};
}

export function createMonitorRuntimeView(root,store){
  let host,last='';
  function render(){
    const a=store.agent(),job=a.job,processReady=a.status==='connected'&&a.capabilities?.process_timeline===true;
    const lines=LINE_IDS.map((line,i)=>{const read=store.read(line);return {line,index:i+1,snapshot:read.snapshot?.snapshot_id||null,source:read.source,freshness:read.freshness};});
    const lastBackup=a.auxiliary?.name==='backup'?(a.auxiliary.result?.path||a.auxiliary.result?.created_at||'criado nesta sessão'):'—';
    const gate=gateModel(a,lines,processReady),origin=globalThis.location?.origin||'origem não disponível';
    const key=JSON.stringify([a.status,a.readiness,a.agent_build,a.capabilities,a.auxiliary?.name,lastBackup,job?.id,job?.status,job?.stage,job?.progress,job?.stage_progress,processReady,lines,origin]);if(key===last)return;last=key;
    if(!host){host=document.createElement('section');host.className='ames-monitor-runtime';root.append(host);}
    host.innerHTML=`<div class="ames-runtime-grid"><section class="mes-context-panel"><div class="section-head"><div><h3>Pipeline da execução</h3><p>Mesmo fluxo operacional da automação local; cada etapa mostra somente o que o agente realmente declara ou executa.</p></div><span class="ames-runtime-job">${esc(job?`${job.status||''} · ${job.id||''}`:'AGUARDANDO')}</span></div><div class="ames-runtime-pipeline">${STAGES.map(stage=>{const info=stageInfo(job,stage,processReady);return`<article class="ames-runtime-stage ${info.state}"><div><b>${stage}</b><span>${Math.max(0,Math.min(100,info.pct))}%</span></div><div class="ames-runtime-bar"><i style="width:${Math.max(0,Math.min(100,info.pct))}%"></i></div><small>${esc(info.label)}</small></article>`}).join('')}</div></section><aside class="mes-context-panel"><div class="section-head"><div><h3>Estado do motor</h3><p>O navegador é interface; coleta e persistência ficam no agente/SQLite.</p></div></div><div class="ames-runtime-kv"><span>Endpoint local</span><b>${esc(AGENT_URL)}</b><span>Agente</span><b>${a.status==='connected'?'Conectado':'Desconectado'}</b><span>Motor</span><b>${a.readiness?.engine?'Disponível':'Indisponível'}</b><span>Chrome CDP</span><b>${a.readiness?.chrome?'Conectado':'Indisponível'}</b><span>Rede A-MES</span><b>${a.readiness?.ames?'Conectada':'Indisponível'}</b><span>3022 em lote</span><b>${processReady?'Disponível':'Indisponível'}</b><span>Último backup da sessão</span><b>${esc(lastBackup)}</b><span>Build</span><b>${esc(a.agent_build||a.capabilities?.agent_build||'—')}</b></div></aside></div><div class="ames-runtime-lines">${lines.map(x=>`<span><b>Linha ${x.index}</b> · ${esc(x.snapshot||'sem snapshot')} · ${esc(x.source||'sem fonte')} · ${esc(x.freshness||'idade desconhecida')}</span>`).join('')}</div>
    <section class="mes-context-panel ames-factory-gate"><div class="section-head"><div><h3>Gate físico · posto de fábrica</h3><p>Preflight para iniciar a validação real. Este painel nunca transforma CI, preview ou disponibilidade técnica em aprovação física 9/9.</p></div><span class="ames-gate-pill ${gate.gateClass}">${esc(gate.gateStatus)}</span></div><div class="ames-gate-grid"><div class="ames-gate-checks">${gate.core.map(([label,ok,note])=>`<div class="ames-gate-check ${ok?'ok':'pending'}"><span>${ok?'✓':'—'}</span><div><b>${esc(label)}</b><small>${esc(note)}</small></div></div>`).join('')}</div><div class="ames-gate-proof"><h4>Evidência que ainda exige o posto</h4><p><b>Shift 2114 automático</b><span>Pendente prova física sem seleção manual de OPC.</span></p><p><b>3022 múltiplas passagens / retrabalho</b><span>${processReady?'Capacidade declarada; ainda precisa caso real.':'Bloqueado até agente R12/canônico declarar process_timeline.'}</span></p><p><b>9/9 desktop + mobile</b><span>Pendente validação visual e funcional no ambiente real.</span></p><p><b>Reboot / bootstrap</b><span>Pendente reinício do notebook e recuperação da configuração.</span></p></div></div><div class="ames-gate-foot"><span><b>Snapshots carregados:</b> ${gate.snapshots}/3 linhas</span><span><b>Origem desta Central:</b> ${esc(origin)}</span><span><b>Regra:</b> GREEN físico somente após evidência no posto e aprovação do usuário.</span></div></section>`;
  }
  return {render,clear(){host?.remove();host=null;last='';}};
}
