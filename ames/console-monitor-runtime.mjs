import { LINE_IDS } from './data/contract.mjs';
import { AGENT_URL } from './data/agent-contract.mjs';
import { readHardeningDiagnostics } from './agent-diagnostics.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STAGES=['3028','3074','2114','3022'];
const RELEASE_BUILD_URL=new URL('../../release-build.json',import.meta.url).href;
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;

export function physicalOriginStatus(origin){
  const raw=String(origin||'').trim().replace(/\/$/,'');
  try{
    const url=new URL(raw);
    const host=String(url.hostname||'').toLowerCase();
    const loopback=host==='127.0.0.1'||host==='localhost'||host==='::1';
    if(loopback&&['http:','https:'].includes(url.protocol))return {ok:true,mode:'local'};
  }catch{}
  return {ok:false,mode:'unapproved'};
}

function originNote(state){
  if(state?.mode==='local')return t('pacote CLEAN local no próprio posto','local CLEAN package on this workstation');
  return t('origem não aprovada para o gate físico; use o CLEAN local','origin not approved for the physical gate; use the local CLEAN package');
}

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

function gateModel(agent,lines,processReady,frontend,origin){
  const connected=agent.status==='connected',frontendReady=!!frontend?.sha,originState=physicalOriginStatus(origin),originDescription=originNote(originState);
  const core=[
    ['Agente local',connected,connected?'conectado':'desconectado'],
    ['Motor A-MES',!!agent.readiness?.engine,agent.readiness?.engine?'disponível':'indisponível'],
    ['Chrome / CDP',!!agent.readiness?.chrome,agent.readiness?.chrome?'conectado':'indisponível'],
    ['Rede A-MES',!!agent.readiness?.ames,agent.readiness?.ames?'conectada':'indisponível'],
    ['Scheduler FIFO',connected,connected?'validado na conexão':'aguarda conexão'],
    [t('Origem da Central','Central origin'),originState.ok,originDescription],
    ['Frontend SHA',frontendReady,frontendReady?String(frontend.sha):frontend===null?'carregando identificação':'não identificado'],
    ['3022 em lote',processReady,processReady?'capacidade declarada':'indisponível / não declarada'],
  ];
  const coreReady=core.slice(0,7).every(([,ok])=>ok);
  const snapshots=lines.filter(x=>x.snapshot).length;
  const gateStatus=!connected?'CONECTE O AGENTE':!coreReady?'BLOQUEADO NO POSTO':!processReady?'PARCIAL · 3022 EM LOTE PENDENTE':'PRONTO PARA VALIDAR 9/9';
  const gateClass=!connected||!coreReady?'blocked':processReady?'ready':'partial';
  return {core,coreReady,snapshots,gateStatus,gateClass,originState,originDescription};
}

function guardianStatus(value){
  if(!value||typeof value!=='object')return null;
  if(typeof value.status==='string'&&value.status)return value.status;
  if(typeof value.state==='string'&&value.state)return value.state;
  if(value.ok===true)return 'ok';
  if(value.enabled===true)return 'enabled';
  return null;
}

export function runtimeDiagnostics(agent,lines=[],hardening=null){
  const readiness=agent?.readiness||{},runtime=agent?.runtime||{};
  const checks=[readiness.python,readiness.dependencies,readiness.playwright,readiness.sqlite];
  const known=checks.filter(value=>value!==null&&value!==undefined).length;
  const ok=checks.filter(value=>value===true).length;
  const hardeningOk=hardening?.status==='ok';
  return Object.freeze({
    scheduler:runtime.scheduler?.policy||runtime.scheduler?.name||null,
    preflight:{ok,known,total:checks.length},
    setupComplete:runtime.setup_complete===true,
    candidateVersion:runtime.candidate_version||null,
    latestSnapshotId:runtime.latest_snapshot_id??null,
    guardian:guardianStatus(runtime.network_guardian),
    hardening:hardeningOk?hardening.level:null,
    sqliteIntegrity:hardeningOk?hardening.integrity:null,
    performanceIndexes:hardeningOk?hardening.performanceIndexes:null,
    diagnosticsStatus:hardening?.status||null,
    freshLines:lines.filter(line=>line.freshness==='fresh').length,
    staleLines:lines.filter(line=>line.freshness==='stale').length,
    missingLines:lines.filter(line=>!line.snapshot).length,
    error:String(agent?.error||''),
  });
}

function ageLabel(ms){
  if(!Number.isFinite(ms)||ms<0)return '—';
  if(ms<60000)return '< 1 min';
  const minutes=Math.floor(ms/60000);if(minutes<60)return `${minutes} min`;
  const hours=Math.floor(minutes/60);if(hours<48)return `${hours} h`;
  return `${Math.floor(hours/24)} d`;
}

function integrityLabel(diagnostics){
  if(diagnostics.sqliteIntegrity==='ok')return 'OK';
  if(diagnostics.diagnosticsStatus==='ok')return diagnostics.sqliteIntegrity||t('não informado','not reported');
  return t('não comprovado','unproven');
}

function indexLabel(diagnostics){
  const indexes=diagnostics.performanceIndexes;
  if(!indexes)return t('não comprovado','unproven');
  if(indexes.expected!==null&&indexes.present!==null)return `${indexes.present}/${indexes.expected}${indexes.ok?' · OK':''}`;
  return indexes.ok?'OK':t('incompleto','incomplete');
}

export function createMonitorRuntimeView(root,store){
  let host,last='',releaseBuild=null,releaseLoaded=false,disposed=false,hardening=null,hardeningLoading=false,hardeningFor='';
  async function loadReleaseBuild(){
    if(releaseLoaded||disposed)return;releaseLoaded=true;
    try{
      const response=await fetch(RELEASE_BUILD_URL,{cache:'no-store',credentials:'omit'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json(),sha=typeof data?.sha==='string'&&/^[0-9a-f]{7,64}$/i.test(data.sha)?data.sha:null;
      releaseBuild={sha,branch:typeof data?.branch==='string'?data.branch:null,provider:typeof data?.provider==='string'?data.provider:null,build:typeof data?.build==='string'?data.build:null};
    }catch(error){releaseBuild={sha:null,error:error.message};}
    if(!disposed){last='';render();}
  }
  async function loadHardening(agent){
    if(disposed||hardeningLoading||agent.status!=='connected')return;
    const identity=String(agent.agent_build||agent.capabilities?.agent_build||'connected');
    if(hardeningFor===identity&&hardening)return;
    hardeningLoading=true;hardeningFor=identity;
    try{hardening=await readHardeningDiagnostics();}
    catch(error){hardening={status:'unavailable',reason:error?.name==='AbortError'?'aborted':'error'};}
    finally{hardeningLoading=false;if(!disposed){last='';render();}}
  }
  function render(){
    if(disposed)return;if(!releaseLoaded)void loadReleaseBuild();
    const a=store.agent(),job=a.job,processReady=a.status==='connected'&&a.capabilities?.process_timeline===true;
    if(a.status==='connected')void loadHardening(a);else if(hardening||hardeningFor){hardening=null;hardeningFor='';hardeningLoading=false;}
    const lines=LINE_IDS.map((line,i)=>{const read=store.read(line);return {line,index:i+1,snapshot:read.snapshot?.snapshot_id||null,source:read.source,freshness:read.freshness,age_ms:read.age_ms};});
    const diagnostics=runtimeDiagnostics(a,lines,hardening);
    const lastBackup=a.auxiliary?.name==='backup'?(a.auxiliary.result?.path||a.auxiliary.result?.created_at||'criado nesta sessão'):'—';
    const origin=globalThis.location?.origin||'origem não disponível',gate=gateModel(a,lines,processReady,releaseBuild,origin);
    const frontendSha=releaseBuild?.sha?String(releaseBuild.sha):releaseBuild===null?'carregando':'não informado';
    const frontendMeta=[releaseBuild?.provider,releaseBuild?.branch].filter(Boolean).join(' · ');
    const key=JSON.stringify([a.status,a.readiness,a.runtime,a.error,a.agent_build,a.capabilities,a.auxiliary?.name,lastBackup,job?.id,job?.status,job?.stage,job?.progress,job?.stage_progress,processReady,hardening,hardeningLoading,lines.map(x=>({...x,age_ms:Number.isFinite(x.age_ms)?Math.floor(x.age_ms/60000):null})),origin,releaseBuild,document.documentElement.lang]);if(key===last)return;last=key;
    if(!host){host=document.createElement('section');host.className='ames-monitor-runtime';root.append(host);}
    host.innerHTML=`<div class="ames-runtime-grid"><section class="mes-context-panel"><div class="section-head"><div><h3>Progresso da execução</h3><p>3028 → 3074 → 2114 → 3022, sem misturar as linhas.</p></div><span class="ames-runtime-job">${esc(job?`${job.status||''} · ${job.id||''}`:'AGUARDANDO')}</span></div><div class="ames-runtime-pipeline">${STAGES.map(stage=>{const info=stageInfo(job,stage,processReady);return`<article class="ames-runtime-stage ${info.state}"><div><b>${stage}</b><span>${Math.max(0,Math.min(100,info.pct))}%</span></div><div class="ames-runtime-bar"><i style="width:${Math.max(0,Math.min(100,info.pct))}%"></i></div><small>${esc(info.label)}</small></article>`}).join('')}</div></section><aside class="mes-context-panel"><div class="section-head"><div><h3>Estado do motor</h3><p>O navegador é apenas a interface.</p></div></div><div class="ames-runtime-kv"><span>Endpoint</span><b>${esc(AGENT_URL)}</b><span>Rede A-MES</span><b>${a.readiness?.ames?'Conectada':'Indisponível'}</b><span>Chrome A-MES</span><b>${a.readiness?.chrome?'Conectado':'Indisponível'}</b><span>Snapshots</span><b>${gate.snapshots}/3 linhas</b><span>Motor</span><b>${a.readiness?.engine?'Disponível':'Indisponível'}</b><span>3022 automático</span><b>${processReady?'Pronto':'A validar'}</b><span>Último backup</span><b>${esc(lastBackup)}</b></div></aside></div><details class="ames-runtime-diagnostics"><summary>Diagnóstico técnico e gate físico</summary><div class="ames-runtime-diagnostics-body"><section class="mes-context-panel ames-runtime-observability" data-no-i18n><div class="section-head"><div><h3>${t('Observabilidade local','Local observability')}</h3><p>${t('Estado técnico do posto sem expor token, payload MES ou dados pessoais.','Technical workstation state without exposing tokens, MES payloads or personal data.')}</p></div></div><div class="ames-runtime-kv"><span>Scheduler</span><b>${esc(diagnostics.scheduler||t('não informado','not reported'))}</b><span>Preflight</span><b>${diagnostics.preflight.known?`${diagnostics.preflight.ok}/${diagnostics.preflight.total} ${t('itens OK','checks OK')}`:t('não informado','not reported')}</b><span>Hardening</span><b>${esc(diagnostics.hardening||t('não comprovado','unproven'))}</b><span>SQLite</span><b>${esc(integrityLabel(diagnostics))}</b><span>${t('Índices SQLite','SQLite indexes')}</span><b>${esc(indexLabel(diagnostics))}</b><span>${t('Configuração do posto','Workstation setup')}</span><b>${diagnostics.setupComplete?t('concluída','complete'):t('pendente / não comprovada','pending / unproven')}</b><span>${t('Snapshot mais recente','Latest snapshot')}</span><b>${esc(diagnostics.latestSnapshotId??'—')}</b><span>${t('Linhas frescas','Fresh lines')}</span><b>${diagnostics.freshLines}/${LINE_IDS.length}</b><span>${t('Guardian de rede','Network guardian')}</span><b>${esc(diagnostics.guardian||t('não informado','not reported'))}</b></div><div class="ames-runtime-lines">${lines.map(x=>`<span><b>${t('Linha','Line')} ${x.index}</b> · ${esc(x.snapshot||t('sem snapshot','no snapshot'))} · ${esc(x.source||t('sem fonte','no source'))} · ${esc(x.freshness||t('idade desconhecida','unknown age'))} · ${t('idade','age')} ${ageLabel(x.age_ms)}</span>`).join('')}</div>${diagnostics.error?`<div class="notice warn"><b>${t('Último erro do agente','Latest agent error')}</b><br>${esc(diagnostics.error)}</div>`:''}</section><section class="mes-context-panel ames-factory-gate"><div class="section-head"><div><h3>Gate físico · posto de fábrica</h3><p>Informações de validação ficam recolhidas para não poluir a operação diária.</p></div><span class="ames-gate-pill ${gate.gateClass}">${esc(gate.gateStatus)}</span></div><div class="ames-gate-grid"><div class="ames-gate-checks">${gate.core.map(([label,ok,note])=>`<div class="ames-gate-check ${ok?'ok':'pending'}"><span>${ok?'✓':'—'}</span><div><b>${esc(label)}</b><small>${esc(note)}</small></div></div>`).join('')}</div><div class="ames-gate-proof"><h4>Evidência que ainda exige o posto</h4><p><b>Shift 2114 automático</b><span>Pendente prova física sem seleção manual de OPC.</span></p><p><b>3022 múltiplas passagens / retrabalho</b><span>${processReady?'Capacidade declarada; ainda precisa caso real.':'Bloqueado até agente R12/canônico declarar process_timeline.'}</span></p><p><b>9/9 desktop + mobile</b><span>Pendente validação visual e funcional no ambiente real.</span></p><p><b>Reboot / bootstrap</b><span>Pendente reinício do notebook e recuperação da configuração.</span></p></div></div><p>GREEN físico somente após evidência no posto e aprovação do usuário.</p><div class="ames-gate-foot"><span><b>Origem desta Central</b> ${esc(origin)} · ${esc(gate.originDescription)}</span><span><b>Frontend SHA:</b> ${esc(frontendSha)}${frontendMeta?` · ${esc(frontendMeta)}`:''}</span><span><b>Build agente:</b> ${esc(a.agent_build||a.capabilities?.agent_build||'—')}</span></div></section></div></details>`;
  }
  return {render,clear(){disposed=true;host?.remove();host=null;last='';hardening=null;hardeningFor='';hardeningLoading=false;}};
}
