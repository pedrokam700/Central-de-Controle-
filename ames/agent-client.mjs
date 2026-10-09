import { AGENT_URL, SCHEDULER_POLICY, collectionScope } from './data/agent-contract.mjs';
import { LINE_IDS, LEGACY_SCHEMA } from './data/contract.mjs';

// Transport belongs to the existing session; all operational data lives in store.
export function createAgentClient(store, {fetcher=fetch, changed=()=>{}, schedule=setTimeout, unschedule=clearTimeout, now=Date.now}={}) {
  let generation=0, controller=new AbortController(), timer, busy=false, refreshing=false, lastPartial=-1,lastRefresh=0;
  const publish=patch=>{store.updateAgent(patch);changed();};
  async function request(path,body,blob=false) {
    const token=generation;
    const response=await fetcher(AGENT_URL+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error(`Agente: HTTP ${response.status}`);
    const data=blob?await response.blob():await response.json();
    if(token!==generation)throw new DOMException('Sessão encerrada','AbortError');
    return data;
  }
  function check(){if(store.agent().status!=='connected')throw new Error('Conecte o agente com scheduler compatível.');}
  async function refresh() {
    check();if(refreshing)return;refreshing=true;const token=generation;
    try {
      // team-dashboard reads SQLite only; share/export would rebuild all reuse
      // insights twice just to pin snapshot IDs. Compute each insight once below.
      const before=await request('/team-dashboard'), payloads=[];
      if(!Array.isArray(before.lines)||!Object.hasOwn(before,'snapshot_ids'))throw new Error('Dashboard do agente incompatível.');
      for(const entry of before.lines) {
        const summary={line:entry.line,snapshot_id:entry.snapshot_id,collected_at:entry.collected_at,defect_rows:entry.defect_rows,fpy:entry.metrics?.fpy,check_fpy:entry.metrics?.check_fpy,quantity:entry.metrics?.quantity};
        if(!LINE_IDS.includes(summary.line)||!summary.snapshot_id)continue;
        const q=`&line=${encodeURIComponent(summary.line)}&snapshot_id=${encodeURIComponent(summary.snapshot_id)}&limit=100000`;
        const data=await Promise.all(['defects','pcba_history','material_reuse','history_contexts'].map(async name=>[name,(await request('/base?dataset='+name+q)).rows]));
        const datasets=Object.fromEntries(data);
        let insights;
        try {insights=await request(`/insights?line=${encodeURIComponent(summary.line)}&snapshot_id=${encodeURIComponent(summary.snapshot_id)}`);}
        catch(error){if(error.name==='AbortError')throw error;publish({error:'Indicadores de reuso indisponíveis: '+error.message});}
        payloads.push({schema:'central-agent-read-v1',legacy:{schema:LEGACY_SCHEMA,line:summary.line,summary,generated_at:before.generated_at,defects:datasets.defects||[]},datasets,insights});
      }
      // Pin IDs across the multi-request read; same-ID enrichment remains partial.
      const after=await request('/team-dashboard');
      const signature=x=>JSON.stringify((x.lines||[]).map(r=>[r.line,r.snapshot_id,r.collected_at]));
      if(signature(before)!==signature(after))throw new Error('Snapshot mudou durante a leitura. Atualize novamente.');
      store.replaceLocalSnapshots(payloads);store.setLocalConnected(true);lastRefresh=now();changed();
    }finally{if(token===generation)refreshing=false;}
  }
  async function poll(id,token) {
    if(token!==generation)return;
    try {
      const raw=await request('/jobs/'+encodeURIComponent(id));
      publish({job:{id:raw.id,kind:raw.kind,status:raw.status,stage:raw.stage,message:raw.message,progress:raw.progress,mes_state:raw.mes_state,stage_progress:raw.stage_progress||{},partial_refresh:raw.partial_refresh||0}});
      const partial=Number(raw.partial_refresh||0),done=['done','error','cancelled','skipped'].includes(raw.status);
      if(done||(partial!==lastPartial&&now()-lastRefresh>2200)){
        try{await refresh();lastPartial=partial;}catch(error){if(token!==generation)return;publish({error:error.message});}
      }
      if(!done&&token===generation)timer=schedule(()=>poll(id,token),850);
    }catch(e){if(token===generation){publish({error:'Leitura do job interrompida: '+e.message});timer=schedule(()=>poll(id,token),850);}}
  }
  async function action(work) {
    if(busy)throw new Error('Uma solicitação já está em andamento.');
    busy=true;const token=generation;
    try {publish({error:''});return await work();}
    catch(e){if(token===generation)publish({error:e.message});throw e;}
    finally{if(token===generation)busy=false;}
  }
  return Object.freeze({
    connect:()=>action(async()=>{
      const health=await request('/health');
      if(health.agent_version!=='0.5.23'||health.mes_scheduler?.policy!==SCHEDULER_POLICY)throw new Error('Instale o patch de serialização antes de conectar o Console.');
      const cfg=await request('/config');
      const config={configured_lines:(cfg.configured_lines||[]).filter(l=>LINE_IDS.includes(l)),performance:['fast','balanced','safe'].includes(cfg.performance)?cfg.performance:'balanced',day_start:cfg.day_start,monitor_interval_minutes:cfg.monitor_interval_minutes};
      publish({status:'connected',config,readiness:{engine:!!health.engine_found,chrome:!!health.chrome_cdp_reachable,ames:!!health.ames_reachable},error:''});
      const monitor=await request('/monitor');publish({monitor:{enabled:!!monitor.enabled,interval_minutes:monitor.interval_minutes,next_run_at:monitor.next_run_at}});
      await refresh();
    }),
    refresh:()=>action(refresh),
    saveConfig:value=>action(async()=>{check();const scope=collectionScope(value);const cfg={configured_lines:scope.lines,performance:scope.performance};await request('/config',cfg);publish({config:{...store.agent().config,...cfg}});}),
    collect:(type,value)=>action(async()=>{
      check();if(store.agent().job&&!['done','error','cancelled','skipped'].includes(store.agent().job.status))throw new Error('Aguarde ou cancele o job atual.');
      const scope=collectionScope(value);let path,body;
      if(type==='deep'){path='/deep-trace';body=scope;}
      else if(type==='today'||type==='previous_day'){path='/runs';body={preset:type,lines:scope.lines,performance:scope.performance};}
      else throw new Error('Coleta inválida.');
      const job=await request(path,body);publish({job:{id:job.id,kind:job.kind,status:job.status,stage:job.stage,message:job.message},error:''});
      lastPartial=-1;unschedule(timer);const token=generation;timer=schedule(()=>poll(job.id,token),850);
    }),
    cancel:()=>action(async()=>{check();const job=store.agent().job;if(job)await request('/jobs/'+encodeURIComponent(job.id)+'/cancel',{});}),
    monitor:(enabled,value)=>action(async()=>{check();const scope=collectionScope(value),interval=Number(value.interval_minutes);if(enabled&&(!Number.isInteger(interval)||interval<5))throw new Error('Intervalo mínimo do monitor: 5 minutos.');const result=await request(enabled?'/monitor/start':'/monitor/stop',enabled?{mode:'today',lines:scope.lines,performance:scope.performance,interval_minutes:interval}:{});publish({monitor:{enabled:!!result.enabled,interval_minutes:result.interval_minutes}});}),
    excel:()=>action(async()=>{check();const blob=await request('/export/excel/download?team=1',undefined,true);const header=new Uint8Array(await blob.slice(0,2).arrayBuffer());if(header[0]!==80||header[1]!==75)throw new Error('Resposta Excel inválida.');return blob;}),
    clear(){generation++;unschedule(timer);controller.abort();controller=new AbortController();busy=false;refreshing=false;lastPartial=-1;lastRefresh=0;store.setLocalConnected(false);store.updateAgent({status:'disconnected',config:null,job:null,readiness:null,monitor:null,error:''});}
  });
}
