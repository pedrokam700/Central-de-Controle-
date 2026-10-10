import { AGENT_URL, SCHEDULER_POLICY, collectionScope, r12CompatibleBuild } from './data/agent-contract.mjs';
import { LINE_IDS, LEGACY_SCHEMA } from './data/contract.mjs';
import {CANONICAL_SCHEMA,DATASETS} from './data/canonical.mjs';

// Transport belongs to the existing session; all operational data lives in store.
export function createAgentClient(store, {fetcher=fetch, changed=()=>{}, schedule=setTimeout, unschedule=clearTimeout, now=Date.now}={}) {
  let generation=0, controller=new AbortController(), timer, busy=false, refreshing=false, lastPartial=-1,lastRefresh=0,pendingSubmission=null;
  const publish=patch=>{store.updateAgent(patch);changed();};
  async function request(path,body,blob=false) {
    const token=generation;
    const response=await fetcher(AGENT_URL+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error(`Agente: HTTP ${response.status}`);
    const data=blob?await response.blob():await response.json();
    if(token!==generation)throw new DOMException('Sessão encerrada','AbortError');
    return data;
  }
  function check(){if(store.agent().status!=='connected')throw new Error('Conecte o agente com scheduler compatível.');}
  function publicConfig(cfg={}){
    return {
      ...Object.fromEntries(['ames_host','ames_port','ames_start_url','chrome_profile_dir'].map(k=>[k,cfg[k]||''])),
      configured_lines:(cfg.configured_lines||[]).filter(l=>LINE_IDS.includes(l)),
      performance:['fast','balanced','safe'].includes(cfg.performance)?cfg.performance:'balanced',
      day_start:cfg.day_start,
      monitor_interval_minutes:cfg.monitor_interval_minutes,
      backup_retention:cfg.backup_retention,
      auto_backup_on_start:cfg.auto_backup_on_start
    };
  }
  async function refresh() {
    check();if(refreshing)return;refreshing=true;const token=generation;
    try {
      if(store.agent().capabilities?.schema===CANONICAL_SCHEMA){
        const response=await request('/v2/snapshots'),payloads=[];
        for(const head of response.snapshots||[]){
          const cached=store.localCanonical().find(p=>p.line_id===head.line_id&&p.source_id===head.source_id&&p.snapshot_id===head.snapshot_id&&p.snapshot_revision===head.snapshot_revision&&p.content_hash===head.content_hash);if(cached){payloads.push(cached);continue;}
          const datasets={};let insights=null;
          for(const dataset of [...DATASETS,'insights']){
            let cursor=null;const rows=[],seen=new Set();
            do{
              const q=new URLSearchParams({snapshot_id:head.snapshot_id,line:head.line_id,revision:head.snapshot_revision,dataset,limit:500});if(cursor)q.set('cursor',cursor);
              const page=await request('/v2/records?'+q);
              if(page.snapshot_revision!==head.snapshot_revision||page.line_id!==head.line_id||page.source_id!==head.source_id||String(page.snapshot_id)!==String(head.snapshot_id))throw Error('Revisão misturada');
              rows.push(...page.rows);cursor=page.next_cursor;if(cursor&&seen.has(cursor))throw Error('Cursor repetido');if(cursor)seen.add(cursor);
              if(!cursor&&rows.length!==page.total)throw Error('Transporte incompleto');
            }while(cursor);
            if(dataset==='insights')insights=rows[0]||null;else datasets[dataset]=rows;
          }
          payloads.push({...head,datasets,insights});
        }
        const errors=store.replaceLocalSnapshots(payloads);if(errors.length)throw Error(errors.map(e=>e.reason).join('; '));
        store.setLocalConnected(true);lastRefresh=now();changed();return;
      }
      // Compatibilidade explícita com a automação local 3022-R12+.
      // O transporte legado permanece somente local e continua marcado como cobertura parcial.
      const before=await request('/team-dashboard'), payloads=[];
      if(!Array.isArray(before.lines)||!Object.hasOwn(before,'snapshot_ids'))throw new Error('Dashboard do agente incompatível.');
      for(const entry of before.lines) {
        const summary={line:entry.line,snapshot_id:entry.snapshot_id,collected_at:entry.collected_at,defect_rows:entry.defect_rows,fpy:entry.metrics?.fpy,check_fpy:entry.metrics?.check_fpy,quantity:entry.metrics?.quantity};
        if(!LINE_IDS.includes(summary.line)||!summary.snapshot_id)continue;
        const q=`&line=${encodeURIComponent(summary.line)}&snapshot_id=${encodeURIComponent(summary.snapshot_id)}&limit=100000`;
        const names=['defects','pcba_history','material_reuse','history_contexts','process_events','process_defect_contexts'];
        const data=await Promise.all(names.map(async name=>[name,(await request('/base?dataset='+name+q)).rows]));
        const datasets=Object.fromEntries(data);
        let insights;
        try {insights=await request(`/insights?line=${encodeURIComponent(summary.line)}&snapshot_id=${encodeURIComponent(summary.snapshot_id)}`);}
        catch(error){if(error.name==='AbortError')throw error;publish({error:'Indicadores de reuso indisponíveis: '+error.message});}
        payloads.push({schema:'central-agent-read-v1',legacy:{schema:LEGACY_SCHEMA,line:summary.line,summary,generated_at:before.generated_at,defects:datasets.defects||[]},datasets,insights});
      }
      const after=await request('/team-dashboard');
      const signature=x=>JSON.stringify((x.lines||[]).map(r=>[r.line,r.snapshot_id,r.collected_at]));
      if(signature(before)!==signature(after))throw new Error('Snapshot mudou durante a leitura. Atualize novamente.');
      const errors=store.replaceLocalSnapshots(payloads);if(errors.length)publish({error:errors.map(e=>e.reason).join('; ')});
      store.setLocalConnected(true);lastRefresh=now();changed();
    }finally{if(token===generation)refreshing=false;}
  }
  async function poll(id,token) {
    if(token!==generation)return;
    try {
      const raw=await request('/jobs/'+encodeURIComponent(id));
      publish({...(raw.kind==='sn_lookup'&&raw.result?{resultSource:'sn'}:{}),job:{id:raw.id,kind:raw.kind,status:raw.status,stage:raw.stage,message:raw.message,progress:raw.progress,mes_state:raw.mes_state,stage_progress:raw.stage_progress||{},partial_refresh:raw.partial_refresh||0,result:raw.kind==='sn_lookup'?raw.result:undefined}});
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
    try {publish({error:''});const result=await work();if(token!==generation)throw new DOMException('Sessão encerrada','AbortError');return result;}
    catch(e){if(token===generation)publish({error:e.message});throw e;}
    finally{if(token===generation)busy=false;}
  }
  return Object.freeze({
    connect:()=>action(async()=>{
      const health=await request('/health');
      if(health.agent_version!=='0.5.23'||health.mes_scheduler?.policy!==SCHEDULER_POLICY)throw new Error('Instale o patch de serialização com scheduler FIFO antes de conectar o Console.');
      let capabilities=null;
      try {
        const candidate=await request('/v2/capabilities');
        if(candidate.schema===CANONICAL_SCHEMA&&candidate.native_console&&candidate.cursor&&candidate.revision)capabilities=candidate;
      } catch(error) {
        if(error.name==='AbortError')throw error;
      }
      if(!capabilities){
        if(!r12CompatibleBuild(health))throw Error('Use o agente canônico 0.5.24-rc1 ou a automação local 3022-R12+ validada.');
        capabilities={schema:'central-r12-local',native_console:true,cursor:false,revision:false,process_timeline:true,legacy_r12:true,agent_build:health.agent_build};
      }
      const cfg=await request('/config');
      const config=publicConfig(cfg);
      publish({status:'connected',config,capabilities,readiness:{engine:!!health.engine_found,chrome:!!health.chrome_cdp_reachable,ames:!!health.ames_reachable,process:!!health.auto_3022_ready,playwright:health.playwright_ready!==false},agent_build:health.agent_build||'',error:''});
      const monitor=await request('/monitor');publish({monitor:{enabled:!!monitor.enabled,interval_minutes:monitor.interval_minutes,next_run_at:monitor.next_run_at}});
      await refresh();
    }),
    refresh:()=>action(refresh),
    saveConfig:value=>action(async()=>{check();const scope=collectionScope(value);const cfg={configured_lines:scope.lines,performance:scope.performance};await request('/config',cfg);publish({config:{...store.agent().config,...cfg}});}),
    collect:(type,value)=>action(async()=>{
      check();if(store.agent().job&&!['done','error','cancelled','skipped'].includes(store.agent().job.status))throw new Error('Aguarde ou cancele o job atual.');
      const scope=collectionScope(value);let path,body;
      if(type==='deep'){
        path='/deep-trace';body={...scope};
        if(value.trace_mode!==undefined){
          if(!['full','process_only','reuse_only'].includes(value.trace_mode))throw Error('Modo de rastreabilidade inválido.');
          if(value.trace_mode==='process_only'&&store.agent().capabilities?.process_timeline!==true)throw Error('process_only exige coleta 3022 em lote. Conecte um agente 3022-R12+ ou aguarde a incorporação do coletor 3022 no agente canônico.');
          body.trace_mode=value.trace_mode;
        }
      }
      else if(type==='today'||type==='previous_day'){path='/runs';body={preset:type,lines:scope.lines,performance:scope.performance};}
      else if(type==='custom'){path='/runs';body={preset:'custom',mode:'custom',lines:scope.lines,performance:scope.performance,start_at:value.start_at,end_at:value.end_at,shift:value.shift||null};if(!body.start_at||!body.end_at||body.start_at>=body.end_at)throw Error('Informe período válido.');}
      else if(type==='sn'){path='/sn-lookup';body={sn:String(value.sn||'').trim(),include_3022:true};if(!body.sn)throw Error('Informe o SN.');}
      else if(type==='imported'){path='/runs';body={mode:'manual',source_path:value.source_path,lines:scope.lines,shift:value.shift||null};if(!body.source_path)throw Error('Envie o arquivo antes de iniciar.');}
      else throw new Error('Coleta inválida.');
      const signature=JSON.stringify([path,body]);
      if(pendingSubmission&&pendingSubmission.signature!==signature)throw Error('Confirme a solicitação anterior repetindo o mesmo escopo antes de iniciar outra.');
      pendingSubmission ||= {signature,id:crypto.randomUUID()};body.request_id=pendingSubmission.id;
      const job=await request(path,body);pendingSubmission=null;publish({job:{id:job.id,kind:job.kind,status:job.status,stage:job.stage,message:job.message},error:''});
      lastPartial=-1;unschedule(timer);const token=generation;timer=schedule(()=>poll(job.id,token),850);
    }),
    cancel:()=>action(async()=>{check();const job=store.agent().job;if(job)await request('/jobs/'+encodeURIComponent(job.id)+'/cancel',{});}),
    monitor:(enabled,value)=>action(async()=>{check();const scope=collectionScope(value),interval=Number(value.interval_minutes);if(enabled&&(!Number.isInteger(interval)||interval<5))throw new Error('Intervalo mínimo do monitor: 5 minutos.');const result=await request(enabled?'/monitor/start':'/monitor/stop',enabled?{mode:'today',lines:scope.lines,performance:scope.performance,interval_minutes:interval}:{});publish({monitor:{enabled:!!result.enabled,interval_minutes:result.interval_minutes}});}),
    auxiliary:(name,value={})=>action(async()=>{
      check();const line=value.line;if(line&&!LINE_IDS.includes(line))throw Error('Linha inválida');let result;
      if(name==='catalog')result=await request('/base/catalog');
      else if(name==='trends')result=await request('/trends?line='+encodeURIComponent(line)+'&limit=10000');
      else if(name==='dataset')result=await request('/base?'+new URLSearchParams({dataset:value.dataset,line,limit:100000}));
      else if(name==='backup')result=await request('/backup',{reason:'native_console'});
      else if(name==='repairs')result=await request('/repairs/refresh',{snapshot_id:value.snapshot_id,line,unresolved_only:!!value.unresolved_only});
      else if(name==='chrome')result=await request('/chrome/start',{});
      else if(name==='upload')result=await request('/upload/3028',{filename:value.filename,data_b64:value.data_b64});
      else if(name==='import')result=await request('/import/integrated',{payload:value.payload,source_name:value.filename});
      else if(name==='search')result=await request('/cora/search?'+new URLSearchParams({line,q:value.q}));
      else if(name==='config')result=await request('/config');
      else if(name==='setup')result=await request('/config',value.config);
      else if(name==='jobs')result=await request('/jobs');
      else if(name==='monitor')result=await request('/monitor');
      else throw Error('Operação desconhecida');
      const configPatch=name==='config'?publicConfig(result):name==='setup'?{...store.agent().config,...value.config}:undefined;
      publish({auxiliary:{name,result,line},resultSource:'auxiliary',...(configPatch?{config:configPatch}:{})});if(['repairs','import'].includes(name))await refresh();return result;
    }),
    excel:()=>action(async()=>{check();const blob=await request('/export/excel/download?team=1',undefined,true);const header=new Uint8Array(await blob.slice(0,2).arrayBuffer());if(header[0]!==80||header[1]!==75)throw new Error('Resposta Excel inválida.');return blob;}),
    clear(){generation++;unschedule(timer);controller.abort();controller=new AbortController();busy=false;refreshing=false;lastPartial=-1;lastRefresh=0;pendingSubmission=null;store.setLocalConnected(false);store.updateAgent({status:'disconnected',config:null,job:null,readiness:null,monitor:null,capabilities:null,auxiliary:null,resultSource:null,upload_path:null,agent_build:'',error:''});}
  });
}
