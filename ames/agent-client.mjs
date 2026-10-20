import { AGENT_URL, SCHEDULER_POLICY, collectionScope, r12CompatibleBuild } from './data/agent-contract.mjs';
import { LINE_IDS, LEGACY_SCHEMA } from './data/contract.mjs';
import {CANONICAL_SCHEMA,DATASETS,normalizeCanonical} from './data/canonical.mjs';

const AGENT_TOKEN_KEY='central.ames.agentToken.v1';
function bootstrapAgentToken(explicit=''){
  if(explicit)return String(explicit);
  if(typeof window==='undefined')return '';
  let token='';
  try{
    const raw=String(window.location?.hash||'').replace(/^#/,'');
    const params=new URLSearchParams(raw);
    token=params.get('ames_agent_token')||'';
    if(token){
      window.sessionStorage?.setItem(AGENT_TOKEN_KEY,token);
      params.delete('ames_agent_token');
      const rest=params.toString();
      window.history?.replaceState?.(null,'',window.location.pathname+window.location.search+(rest?'#'+rest:''));
    }else token=window.sessionStorage?.getItem(AGENT_TOKEN_KEY)||'';
  }catch{}
  return token;
}

const requestTimeout=path=>path==='/ready'?2500:path==='/health'?12000:path==='/diagnostics/3012/map'?45000:30000;
const boundedLimit=(value,fallback=100000,max=100000)=>{const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback;};
const boundedOffset=(value,max=100000)=>{const n=Number(value);return Number.isInteger(n)&&n>=0?Math.min(n,max):0;};

// Transport belongs to the existing session; all operational data lives in store.
export function createAgentClient(store, {fetcher=fetch, changed=()=>{}, schedule=setTimeout, unschedule=clearTimeout, now=Date.now, agentToken=''}={}) {
  let generation=0, controller=new AbortController(), timer, busy=false, refreshing=false, lastPartial=-1,lastRefresh=0,pendingSubmission=null;
  const workstationToken=bootstrapAgentToken(agentToken);
  const canOpenOfficial=()=>!!workstationToken&&globalThis.location?.protocol==='http:'&&['127.0.0.1','localhost'].includes(globalThis.location?.hostname)&&globalThis.location?.port==='8765';
  const publish=patch=>{store.updateAgent(patch);changed();};
  async function request(path,body,blob=false) {
    const token=generation;
    const headers={};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(workstationToken)headers['X-Central-Agent-Token']=workstationToken;
    let response;try{response=await fetcher(AGENT_URL+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(requestTimeout(path))]),cache:'no-store',credentials:'omit'});}catch(error){error.code ||= 'agent-network';throw error;}
    if(response.status===401)throw Object.assign(new Error('Agente local não autorizado nesta aba. Abra pelo launcher ou use o pareamento HTTPS no posto local.'),{code:'agent-unauthorized'});
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
      production_day_start:cfg.production_day_start||cfg.day_start||'07:00',
      timezone:cfg.timezone||'America/Sao_Paulo',
      non_production_dates:Array.isArray(cfg.non_production_dates)?cfg.non_production_dates.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0,730):[],
      extra_production_dates:Array.isArray(cfg.extra_production_dates)?cfg.extra_production_dates.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0,730):[],
      work_shifts:cfg.work_shifts||null,
      monitor_interval_minutes:cfg.monitor_interval_minutes,
      backup_retention:cfg.backup_retention,
      auto_backup_on_start:cfg.auto_backup_on_start
    };
  }
  function publicBackup(raw){
    if(!raw||typeof raw!=='object')return null;
    const bytes=Number(raw.bytes),when=raw.created_at||raw.modified_at||null;
    return {
      created_at:typeof when==='string'?when.slice(0,64):null,
      bytes:Number.isFinite(bytes)&&bytes>=0?bytes:null,
      reason:['manual','native_console','startup','update','rollback'].includes(String(raw.reason||''))?String(raw.reason):null
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
        const datasets=Object.fromEntries(data);let removedDefectsAvailable=true;
        try{datasets.removed_defects=(await request('/base?dataset=removed_defects'+q)).rows||[];}
        catch(error){if(error.name==='AbortError')throw error;removedDefectsAvailable=false;datasets.removed_defects=[];}
        let insights;
        try {insights=await request(`/insights?line=${encodeURIComponent(summary.line)}&snapshot_id=${encodeURIComponent(summary.snapshot_id)}`);}
        catch(error){if(error.name==='AbortError')throw error;publish({error:'Indicadores de reuso indisponíveis: '+error.message});}
        payloads.push({schema:'central-agent-read-v1',legacy:{schema:LEGACY_SCHEMA,line:summary.line,summary,generated_at:before.generated_at,defects:datasets.defects||[]},datasets,removed_defects_available:removedDefectsAvailable,insights});
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
      publish({...(raw.kind==='sn_lookup'&&raw.result?{resultSource:'sn'}:{}),job:{id:raw.id,kind:raw.kind,status:raw.status,stage:raw.stage,message:raw.message,progress:raw.progress,mes_state:raw.mes_state,stage_progress:raw.stage_progress||{},partial_refresh:raw.partial_refresh||0,scope:raw.scope,error:raw.error,result:['sn_lookup','deep_trace'].includes(raw.kind)?raw.result:undefined}});
      const partial=Number(raw.partial_refresh||0),done=['done','error','cancelled','skipped'].includes(raw.status);
      if(done||(partial!==lastPartial&&now()-lastRefresh>2200)){
        try{await refresh();lastPartial=partial;}catch(error){if(token!==generation)return;publish({error:error.message});}
      }
      if(!done&&token===generation)timer=schedule(()=>poll(id,token),850);
    }catch(e){if(token===generation){publish({error:'Leitura do job interrompida: '+e.message});timer=schedule(()=>poll(id,token),850);}}
  }
  async function action(work,{quiet=false}={}) {
    if(busy)throw new Error('Uma solicitação já está em andamento.');
    busy=true;const token=generation;
    try {publish({error:''});const result=await work();if(token!==generation)throw new DOMException('Sessão encerrada','AbortError');return result;}
    catch(e){if(token===generation){if(quiet||['agent-network','agent-unauthorized'].includes(e.code)){store.setLocalConnected(false);publish({status:'disconnected',readiness:null,connection_error:{code:e.code||'agent-check',message:e.message},error:quiet?'':e.message});}else publish({error:e.message});}throw e;}
    finally{if(token===generation)busy=false;}
  }
  return Object.freeze({
    paired:()=>!!workstationToken,
    canOpenOfficial,
    openOfficial(){
      if(!canOpenOfficial())throw Error('Pareamento disponível somente no posto local autorizado.');
      // Fixed trusted destination, fragment only, never a configurable redirect or cloud field.
      const target=new URL('https://central-cora-v2.vercel.app/Central-de-Controle-/');
      target.hash=new URLSearchParams({ames_agent_token:workstationToken}).toString();
      globalThis.window.open(target.href,'_blank','noopener,noreferrer');
    },
    connect:(options={})=>action(async()=>{
      let ready=null;
      try{ready=await request('/ready');}
      catch(error){
        if(error.name==='AbortError')throw error;
        if(!String(error.message||'').includes('HTTP 404'))throw error;
      }
      const healthRaw=await request('/health');
      const health={...healthRaw,agent_build:healthRaw.agent_build||ready?.agent_build||''};
      if(health.agent_version!=='0.5.23'||health.mes_scheduler?.policy!==SCHEDULER_POLICY)throw new Error('Instale o patch de serialização com scheduler FIFO antes de conectar o Console.');
      let capabilities=null;
      try {
        const candidate=await request('/v2/capabilities');
        if(candidate.schema===CANONICAL_SCHEMA&&candidate.native_console&&candidate.cursor&&candidate.revision)capabilities=candidate;
      } catch(error) {
        if(error.name==='AbortError')throw error;
        if(String(error.message||'').includes('não autorizado'))throw error;
      }
      if(!capabilities){
        if(!r12CompatibleBuild(health))throw Error('Use o agente canônico 0.5.24-rc1 ou a automação local 3022-R12+ validada.');
        capabilities={schema:'central-r12-local',native_console:true,cursor:false,revision:false,process_timeline:true,legacy_r12:true,agent_build:health.agent_build};
      }
      const cfg=await request('/config');
      const config=publicConfig(cfg);
      const runtime={
        scheduler:health.mes_scheduler||null,
        preflight:health.preflight||null,
        workstation:health.workstation||null,
        candidate_version:health.candidate_version||ready?.candidate_version||null,
        setup_complete:!!health.setup_complete,
        latest_snapshot_id:health.latest_snapshot_id??null,
        latest_backup:publicBackup(health.latest_backup),
        network:health.network||null,
        network_guardian:health.network_guardian||null
      };
      publish({status:'connected',connection_error:null,config,capabilities,runtime,readiness:{engine:!!health.engine_found,chrome:!!health.chrome_cdp_reachable,ames:!!health.ames_reachable,process:!!health.auto_3022_ready,playwright:health.preflight?.playwright??health.playwright_ready??null,python:health.preflight?.python??null,dependencies:health.preflight?.dependencies??null,sqlite:health.preflight?.sqlite??null,session:null},agent_build:health.agent_build||ready?.agent_build||'',error:''});
      const monitor=await request('/monitor');publish({monitor:{enabled:!!monitor.enabled,interval_minutes:monitor.interval_minutes,next_run_at:monitor.next_run_at}});
      await refresh();
    },options),
    refresh:()=>action(refresh),
    localHistoryList:async(line)=>{
      check();
      if(!LINE_IDS.includes(line))throw Error('Linha de histórico inválida');
      const rows=await request('/local-history?'+new URLSearchParams({line}));
      if(!Array.isArray(rows)||rows.some(h=>h.line_id!==line||!Number.isSafeInteger(Number(h.snapshot_id))||Number(h.snapshot_id)<1))throw Error('Índice local de histórico inválido');
      return rows;
    },
    // B3.4b3: scalar metadata about raw captures only. Never import raw
    // 3074/2114/3022 results into live Store or Firebase publication.
    sourceCaptures:async({snapshot_id,line_id,snapshot_revision,content_hash,source_view=null,before=null,limit=20}={})=>{
      check();
      const sid=Number(snapshot_id),rev=Number(snapshot_revision),n=Number(limit);
      if(!LINE_IDS.includes(line_id)||!Number.isSafeInteger(sid)||sid<1||
         !Number.isSafeInteger(rev)||rev<1||!Number.isInteger(n)||n<1||n>50||
         !(/^[a-f0-9]{64}$/).test(content_hash||''))throw Error('Identidade de captura inválida');
      if(source_view!==null&&!['3074','2114','3022'].includes(source_view))throw Error('Fonte da captura inválida');
      const q=new URLSearchParams({snapshot_id:String(sid),line:line_id,
        snapshot_revision:String(rev),content_hash,limit:String(n)});
      if(source_view)q.set('source_view',source_view);
      if(before)q.set('before',String(before));
      const data=await request('/source-captures?'+q);
      const scalarKeys=new Set(['snapshot_id','line_id','snapshot_revision','source_view',
        'source_status','capture_revision','job_id','stored_at','source_id','progress_only',
        'checkpoint_kind','sample_count','source_complete','population_complete',
        'local_only','period_start','period_end','period_mode']);
      if(data?.items?.some(x=>!x||Object.keys(x).some(k=>!scalarKeys.has(k))))
        throw Error('Campos inesperados no índice de capturas');
      if(data?.schema!=='ames-local-source-capture-v1'||data.metadata_only!==true||
         data.local_only!==true||data.source_complete!==false||
         String(data.snapshot_id)!==String(sid)||data.line_id!==line_id||
         data.snapshot_revision!==rev||data.content_hash!==content_hash||
         !Array.isArray(data.items)||data.items.length>n||
         data.items.some(x=>x.snapshot_id!==String(sid)||x.line_id!==line_id||
           x.snapshot_revision!==rev||x.local_only!==true||x.source_complete!==false||
           !['3074','2114','3022'].includes(x.source_view)||
           (source_view&&x.source_view!==source_view)||
           Object.hasOwn(x,'result')||Object.hasOwn(x,'payload_json')||
           Object.hasOwn(x,'repair_comment')))throw Error('Índice de capturas incompatível');
      return data;
    },
    // B3.2: on-workstation saved individual SN searches; never publish raw job
    // results to Firebase or treat query time as an operational production date.
    savedSnHistory:async({sn='',start=null,end=null,before=null,limit=20}={})=>{
      check();
      if(!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>50)throw Error('Limite de histórico SN inválido');
      const q=new URLSearchParams({limit:String(limit)});
      if(sn)q.set('sn',String(sn));
      if(start)q.set('start',String(start));
      if(end)q.set('end',String(end));
      if(before)q.set('before',String(before));
      const response=await request('/saved-sn-history?'+q);
      if(!Array.isArray(response?.items)||response?.clock_kind!=='query_created_at'||response.local_only!==true||
        response.items.some(x=>x?.line_id!==null||x?.production_date!==null||
          x?.clock_kind!=='query_created_at'||!(/^[a-f0-9]{64}$/).test(x?.entry_hash||'')))throw Error('Índice de consultas SN incompatível');
      return response;
    },
    openSavedSnHistory:async(entry)=>{
      check();
      if(!(/^[A-Za-z0-9_-]{1,128}$/).test(entry?.job_id||'')||
        !(/^[a-f0-9]{64}$/).test(entry?.entry_hash||''))throw Error('Identidade de consulta SN inválida');
      const q=new URLSearchParams({job_id:entry.job_id,entry_hash:entry.entry_hash});
      const value=await request('/saved-sn-history?'+q);
      if(value?.job_id!==entry.job_id||value?.entry_hash!==entry.entry_hash||
        value?.clock_kind!=='query_created_at'||value?.local_only!==true||
        value?.line_id!==null||value?.production_date!==null)throw Error('Resultado SN divergente');
      return value;
    },
    historyCandidates:async({before=null,limit=20}={})=>{
      check();
      const query=new URLSearchParams({limit:String(Math.min(40,Math.max(1,Number(limit)||20)))});
      if(before!==null)query.set('before',String(before));
      const response=await request('/v2/history-candidates?'+query);
      if(!Array.isArray(response?.candidates))throw Error('Índice de histórico incompatível');
      return response;
    },
    historicalPayload:async(snapshotId,line,revision=null)=>{
      check();
      if(!LINE_IDS.includes(line)||!Number.isSafeInteger(Number(snapshotId))||Number(snapshotId)<1)throw Error('Histórico local inválido');
      if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))throw Error('Revisão histórica inválida');
      const query=new URLSearchParams({line,snapshot_id:String(snapshotId)});
      if(revision!==null)query.set('snapshot_revision',String(revision));
      const payload=await request('/local-history?'+query);
      normalizeCanonical(payload);
      if(payload.line_id!==line||String(payload.snapshot_id)!==String(snapshotId)||(revision!==null&&payload.snapshot_revision!==revision))throw Error('Revisão histórica divergente');
      return payload;
    },
    saveConfig:value=>action(async()=>{check();const scope=collectionScope(value);const cfg={configured_lines:scope.lines,performance:scope.performance};const saved=await request('/config',cfg);publish({config:publicConfig(saved?.config||saved)});}),
    collect:(type,value)=>action(async()=>{
      check();if(store.agent().job&&!['done','error','cancelled','skipped'].includes(store.agent().job.status))throw new Error('Aguarde ou cancele o job atual.');
      const scope=type==='sn'?null:collectionScope(value);let path,body;
      if(type==='deep'){
        path='/deep-trace';body={...scope};
        if(store.agent().capabilities?.exact_trace_targets!==true)throw Error('Atualize o agente para rastrear o snapshot exato do período selecionado.');
        body.snapshot_targets=Object.fromEntries(scope.lines.map(line=>{
          const read=store.read(line),p=read.snapshot?.canonical,period=p?.summary?.period;
          if(read.source!=='local'||!p||p.source_id!==store.agent().capabilities.source_id||!period?.start_at||!period?.end_at)throw Error('Selecione uma revisão local com período comprovado para '+line+'.');
          return [line,{source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,content_hash:p.content_hash,period}];
        }));
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
      // A response timeout may be followed by a publication refresh. Retrying the
      // same selected snapshot must replay its original revision/request identity.
      const retryScope=type==='deep'?{...body,snapshot_targets:Object.fromEntries(Object.entries(body.snapshot_targets).map(([line,{snapshot_revision,content_hash,...target}])=>[line,target]))}:body;
      const signature=JSON.stringify([path,retryScope]);
      if(pendingSubmission&&pendingSubmission.signature!==signature)throw Error('Confirme a solicitação anterior repetindo o mesmo escopo antes de iniciar outra.');
      pendingSubmission ||= {signature,id:crypto.randomUUID(),body};body={...pendingSubmission.body,request_id:pendingSubmission.id};
      if(type==='deep')publish({submitting:true,error:''});
      let job;try{job=await request(path,body);if(!job?.id)throw Error('O agente não retornou um job.');}finally{if(type==='deep')publish({submitting:false});}
      pendingSubmission=null;publish({job:{id:job.id,kind:job.kind,status:job.status,stage:job.stage,message:job.message,scope:{trace_mode:value.trace_mode}},error:''});
      lastPartial=-1;unschedule(timer);const token=generation;timer=schedule(()=>poll(job.id,token),850);
    }),
    cancel:()=>action(async()=>{check();const job=store.agent().job;if(job)await request('/jobs/'+encodeURIComponent(job.id)+'/cancel',{});}),
    monitor:(enabled,value)=>action(async()=>{check();const scope=collectionScope(value),interval=Number(value.interval_minutes);if(enabled&&(!Number.isInteger(interval)||interval<5))throw new Error('Intervalo mínimo do monitor: 5 minutos.');const result=await request(enabled?'/monitor/start':'/monitor/stop',enabled?{mode:'today',lines:scope.lines,performance:scope.performance,interval_minutes:interval}:{});publish({monitor:{enabled:!!result.enabled,interval_minutes:result.interval_minutes,next_run_at:result.next_run_at||null}});}),
    auxiliary:(name,value={})=>action(async()=>{
      check();const line=value.line;if(line&&!LINE_IDS.includes(line))throw Error('Linha inválida');let result;
      if(name==='catalog')result=await request('/base/catalog?'+new URLSearchParams(value.snapshot_id?{snapshot_id:value.snapshot_id}:{}));
      else if(name==='trends')result=await request('/trends?'+new URLSearchParams({line,limit:boundedLimit(value.limit,500,500)}));
      else if(name==='dataset'){
        const params={dataset:value.dataset,line,limit:boundedLimit(value.limit,100000,100000),offset:boundedOffset(value.offset)};
        if(value.snapshot_id)params.snapshot_id=value.snapshot_id;
        result=await request('/base?'+new URLSearchParams(params));
      }
      else if(name==='map3012')result=await request('/diagnostics/3012/map',{});
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
      if(name==='backup')result={...result,backup:publicBackup(result?.backup)};
      const configPatch=name==='config'?publicConfig(result):name==='setup'?publicConfig(result?.config||result):undefined;
      publish({auxiliary:{name,result,line},resultSource:'auxiliary',...(configPatch?{config:configPatch}:{})});if(['repairs','import'].includes(name))await refresh();return result;
    }),
    excel:()=>action(async()=>{check();const blob=await request('/export/excel/download?team=1',undefined,true);const header=new Uint8Array(await blob.slice(0,2).arrayBuffer());if(header[0]!==80||header[1]!==75)throw new Error('Resposta Excel inválida.');return blob;}),
    clear(){generation++;unschedule(timer);controller.abort();controller=new AbortController();busy=false;refreshing=false;lastPartial=-1;lastRefresh=0;pendingSubmission=null;store.setLocalConnected(false);store.updateAgent({status:'disconnected',connection_error:null,config:null,job:null,readiness:null,runtime:null,monitor:null,capabilities:null,auxiliary:null,resultSource:null,upload_path:null,agent_build:'',error:''});}
  });
}
