import {LINE_IDS} from './data/contract.mjs';
import {SOURCE_STATE,sourceStateLabel} from './data/source-provenance.mjs';
import {readHardeningDiagnostics} from './agent-diagnostics.mjs';
import {read3012Status} from './agent-3012-health.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(pt,en)=>typeof document!=='undefined'&&document.documentElement?.lang?.startsWith('en')?en:pt;
const locale=()=>typeof document!=='undefined'?document.documentElement?.lang||'pt-BR':'pt-BR';
const rows=(snapshot,name)=>{
  if(name==='3028')return snapshot?.occurrences||[];
  if(name==='3074')return snapshot?.material_trace?.records||snapshot?.canonical?.datasets?.material_reuse||[];
  if(name==='2114')return snapshot?.pcba_history?.records||snapshot?.canonical?.datasets?.pcba_history||[];
  if(name==='3022')return snapshot?.process_timeline?.events||snapshot?.canonical?.datasets?.process_timeline||[];
  return [];
};
const status=(tone,label,detail,sourceState)=>({tone,label,detail,source_state:sourceState});
const normalizedStatus=value=>String(value||'').trim().toLowerCase();
const COLLECTED=new Set(['available','complete','completed','ok','success','partial','transported']);
const FAILED=new Set(['error','failed','failure']);
const datasetStatus=(snapshot,key)=>normalizedStatus(snapshot?.[key]?.status);
const coverage=(snapshots,key)=>{
  const values=snapshots.map(x=>datasetStatus(x.read.snapshot,key));
  return {
    collected:values.filter(v=>COLLECTED.has(v)).length,
    partial:values.filter(v=>v==='partial').length,
    failed:values.filter(v=>FAILED.has(v)).length,
    values
  };
};
const displayCount=(count,state)=>{
  if(state===SOURCE_STATE.ZERO)return 0;
  if(state===SOURCE_STATE.OK)return count;
  if((state===SOURCE_STATE.PARTIAL||state===SOURCE_STATE.CACHED)&&count>0)return count;
  return null;
};
const readSourceState=read=>read?.source_state||(!read?.snapshot?SOURCE_STATE.NOT_COLLECTED:read?.source==='local_cache'?SOURCE_STATE.CACHED:SOURCE_STATE.OK);

function sourceModel(store,source,repairStatus=null){
  const agent=store.agent();
  const reads=LINE_IDS.map((line,index)=>({line,index:index+1,read:store.read(line)}));
  const snapshots=reads.filter(x=>x.read.snapshot);
  const totalSnapshots=snapshots.length;
  const latest=snapshots.map(x=>x.read.snapshot?.collected_at).filter(Boolean).sort().at(-1)||null;

  if(source==='3028'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3028').length,0);
    const fresh=snapshots.filter(x=>x.read.freshness==='fresh').length;
    const state=totalSnapshots===0
      ?status('unknown',t('Não coletado','Not collected'),t('Nenhuma linha possui snapshot 3028 carregado.','No line has a loaded 3028 snapshot.'),SOURCE_STATE.NOT_COLLECTED)
      :fresh===totalSnapshots&&totalSnapshots===LINE_IDS.length
        ?status('ok',t('Atual','Current'),`${totalSnapshots}/${LINE_IDS.length} ${t('linhas com snapshot fresco','lines with fresh snapshot')}`,count===0?SOURCE_STATE.ZERO:SOURCE_STATE.OK)
        :status('partial',t('Parcial','Partial'),`${fresh}/${LINE_IDS.length} ${t('linhas frescas','fresh lines')}`,SOURCE_STATE.PARTIAL);
    return {source,label:'3028',name:t('Falhas / FPY','Failures / FPY'),count,displayCount:displayCount(count,state.source_state),state,latest,reads,unit:t('ocorrências carregadas','loaded occurrences')};
  }

  if(source==='3074'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3074').length,0),c=coverage(snapshots,'material_trace');
    const state=totalSnapshots===0
      ?status('unknown',t('Não coletado','Not collected'),t('Sem snapshot para avaliar a 3074.','No snapshot is available to assess 3074.'),SOURCE_STATE.NOT_COLLECTED)
      :c.collected===0&&c.failed
        ?status('error',t('Erro','Error'),t('A coleta 3074 foi tentada e falhou; ausência de registros não equivale a zero.','3074 collection was attempted and failed; missing records do not mean zero.'),SOURCE_STATE.ERROR)
        :c.collected===0
          ?status('unknown',t('Não coletado','Not collected'),t('Nenhum snapshot comprova execução da 3074.','No snapshot proves a 3074 collection.'),SOURCE_STATE.NOT_COLLECTED)
          :c.collected===totalSnapshots&&c.partial===0
            ?status('ok',t('Disponível','Available'),`${c.collected}/${totalSnapshots} ${t('snapshots com dataset comprovado','snapshots with proven dataset')}`,count===0?SOURCE_STATE.ZERO:SOURCE_STATE.OK)
            :status('partial',t('Parcial','Partial'),`${c.collected}/${totalSnapshots} ${t('snapshots com evidência 3074','snapshots with 3074 evidence')}`,SOURCE_STATE.PARTIAL);
    return {source,label:'3074',name:t('Materiais / vínculos','Materials / bindings'),count,displayCount:displayCount(count,state.source_state),state,latest,reads,unit:t('registros carregados','loaded records')};
  }

  if(source==='2114'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'2114').length,0),c=coverage(snapshots,'pcba_history');
    const state=totalSnapshots===0
      ?status('unknown',t('Não coletado','Not collected'),t('Sem snapshot para avaliar a 2114.','No snapshot is available to assess 2114.'),SOURCE_STATE.NOT_COLLECTED)
      :c.collected===0&&c.failed
        ?status('error',t('Erro','Error'),t('A coleta 2114 foi tentada e falhou; ausência de histórico não equivale a zero.','2114 collection was attempted and failed; missing history does not mean zero.'),SOURCE_STATE.ERROR)
        :c.collected===0
          ?status('unknown',t('Não coletado','Not collected'),t('Nenhum snapshot comprova execução da 2114.','No snapshot proves a 2114 collection.'),SOURCE_STATE.NOT_COLLECTED)
          :c.collected===totalSnapshots&&c.partial===0
            ?status('ok',t('Disponível','Available'),`${c.collected}/${totalSnapshots} ${t('snapshots com histórico comprovado','snapshots with proven history')}`,count===0?SOURCE_STATE.ZERO:SOURCE_STATE.OK)
            :status('partial',t('Parcial','Partial'),`${c.collected}/${totalSnapshots} ${t('snapshots com evidência 2114','snapshots with 2114 evidence')}`,SOURCE_STATE.PARTIAL);
    return {source,label:'2114',name:t('Histórico PCBA','PCBA history'),count,displayCount:displayCount(count,state.source_state),state,latest,reads,unit:t('eventos históricos','history events')};
  }

  if(source==='3022'){
    const count=snapshots.reduce((n,x)=>n+rows(x.read.snapshot,'3022').length,0),c=coverage(snapshots,'process_timeline');
    const capability=agent.capabilities?.process_timeline===true||snapshots.some(x=>x.read.snapshot?.canonical?.capabilities?.process_timeline===true);
    const state=!capability
      ?status('unknown',t('A validar','Needs validation'),t('O agente ainda não declarou a capacidade 3022.','The agent has not declared 3022 capability yet.'),SOURCE_STATE.UNAVAILABLE)
      :totalSnapshots===0
        ?status('unknown',t('Não coletado','Not collected'),t('Nenhuma linha possui snapshot para avaliar 3022.','No line has a snapshot to assess 3022.'),SOURCE_STATE.NOT_COLLECTED)
        :c.collected===0&&c.failed
          ?status('error',t('Erro','Error'),t('A 3022 falhou; não mostrar zero eventos como se a consulta tivesse sido concluída.','3022 failed; do not show zero events as if the query completed.'),SOURCE_STATE.ERROR)
          :c.collected===0
            ?status('unknown',t('Não coletado','Not collected'),t('Nenhum snapshot comprova coleta 3022.','No snapshot proves 3022 collection.'),SOURCE_STATE.NOT_COLLECTED)
            :c.collected===totalSnapshots&&c.partial===0
              ?status('ok',t('Disponível','Available'),`${c.collected}/${totalSnapshots} ${t('snapshots com processo comprovado','snapshots with proven process data')}`,count===0?SOURCE_STATE.ZERO:SOURCE_STATE.OK)
              :status('partial',t('Parcial','Partial'),`${c.collected}/${totalSnapshots} ${t('snapshots com evidência 3022','snapshots with 3022 evidence')}`,SOURCE_STATE.PARTIAL);
    return {source,label:'3022',name:t('Processo / passagem','Process / passage'),count,displayCount:displayCount(count,state.source_state),state,latest,reads,unit:t('eventos de processo','process events')};
  }

  const allOccurrences=snapshots.flatMap(x=>rows(x.read.snapshot,'3028'));
  const withEvidence=allOccurrences.filter(row=>Array.isArray(row?.repair_evidence_3012)&&row.repair_evidence_3012.length>0);
  const count=withEvidence.length;
  const cache=repairStatus?.status==='ok'?repairStatus.local:null;
  const cacheRows=Number.isFinite(Number(cache?.rows))?Number(cache.rows):0;
  const cacheSns=Number.isFinite(Number(cache?.coverageSns))?Number(cache.coverageSns):0;
  const cacheIntervals=Number.isFinite(Number(cache?.coverageIntervals))?Number(cache.coverageIntervals):0;
  const hasCacheCoverage=cacheSns>0||cacheIntervals>0;
  let state;
  if(!allOccurrences.length){
    state=hasCacheCoverage
      ?status('unknown',t('Cache local disponível','Local cache available'),t(`SQLite 3012 possui cobertura registrada para ${cacheSns} SN(s), mas não há ocorrências 3028 neste snapshot para cruzar.`,`3012 SQLite has recorded coverage for ${cacheSns} SN(s), but this snapshot has no 3028 occurrences to correlate.`),SOURCE_STATE.CACHED)
      :status('unknown',t('Não coletado','Not collected'),t('Não há ocorrências para medir cobertura 3012.','There are no occurrences to assess 3012 coverage.'),SOURCE_STATE.NOT_COLLECTED);
  }else if(count){
    const detail=`${count}/${allOccurrences.length} ${t('ocorrências com evidência 3012','occurrences with 3012 evidence')}${hasCacheCoverage?t(` · cache local: ${cacheSns} SN(s) / ${cacheIntervals} intervalo(s)`,` · local cache: ${cacheSns} SN(s) / ${cacheIntervals} interval(s)`):''}`;
    state=status(count===allOccurrences.length?'ok':'partial',count===allOccurrences.length?t('Coberto','Covered'):t('Parcial','Partial'),detail,count===allOccurrences.length?SOURCE_STATE.OK:SOURCE_STATE.PARTIAL);
  }else if(hasCacheCoverage){
    state=status('partial',t('Sem vínculo neste snapshot','No link in this snapshot'),t(`Nenhuma ocorrência atual tem evidência 3012 associada. O cache local contém ${cacheRows} registro(s) e cobertura para ${cacheSns} SN(s), mas isso não prova cobertura das PCBAs atuais.`,`No current occurrence has linked 3012 evidence. Local cache contains ${cacheRows} record(s) and coverage for ${cacheSns} SN(s), but this does not prove coverage of the current PCBAs.`),SOURCE_STATE.CACHED);
  }else{
    state=status('unknown',t('Não comprovado','Not proven'),t('Nenhuma evidência 3012 foi associada e não há cobertura exata registrada no cache local. Isso não equivale a zero reparos.','No 3012 evidence is linked and no exact-query coverage is recorded in the local cache. This does not mean zero repairs.'),SOURCE_STATE.NOT_COLLECTED);
  }
  return {source,label:'3012',name:t('Reparo / AT','Repair / AT'),count,displayCount:count>0?count:null,state,latest,reads,unit:t('ocorrências com evidência','occurrences with evidence'),cache:repairStatus?.status==='ok'?{...repairStatus.local,factoryValidated:repairStatus.factoryValidated,amesStartDate:repairStatus.amesStartDate}:null};
}

export function buildDataHealth(store,repairStatus=null){
  return ['3028','3074','2114','3022','3012'].map(source=>sourceModel(store,source,repairStatus));
}

export function buildSecurityHealth(diagnostics){
  const policy=diagnostics?.status==='ok'?diagnostics.originPolicy:null;
  if(!policy)return {tone:'unknown',label:t('Segurança não comprovada','Security unproven'),detail:t('Diagnóstico local indisponível ou posto ainda não pareado.','Local diagnostics are unavailable or the workstation is not paired yet.'),remote:null,rejected:null};
  const rejected=Number.isFinite(Number(policy.rejectedEntries))?Number(policy.rejectedEntries):null;
  const remote=Number.isFinite(Number(policy.remoteOrigins))?Number(policy.remoteOrigins):null;
  const ok=policy.ok===true&&rejected===0;
  return {tone:ok?'ok':'partial',label:ok?t('Política CORS validada','CORS policy validated'):t('Configuração legada filtrada','Legacy configuration filtered'),detail:ok?t('Somente loopback e origens HTTPS explicitamente autorizadas são aceitas.','Only loopback and explicitly authorized HTTPS origins are accepted.'):t('Entradas inseguras antigas foram ignoradas em runtime; revise a configuração do posto quando conveniente.','Unsafe legacy entries were ignored at runtime; review workstation configuration when convenient.'),remote,rejected,mode:policy.mode||null};
}

export function buildWorkstationHealth(agent={}){
  const runtime=agent?.runtime||{},readiness=agent?.readiness||{};
  const build=String(agent?.agent_build||agent?.capabilities?.agent_build||'').trim()||null;
  const candidate=String(runtime?.candidate_version||'').trim()||null;
  const setup=Object.prototype.hasOwnProperty.call(runtime,'setup_complete')?!!runtime.setup_complete:null;
  const definitions=[
    ['engine',t('Motor','Engine')],['chrome','Chrome/CDP'],['ames','A-MES'],['sqlite','SQLite'],
    ['python','Python'],['dependencies',t('Dependências','Dependencies')],['playwright','Playwright'],['process','3022']
  ];
  const checks=definitions.map(([key,label])=>({key,label,value:readiness[key]===true?true:readiness[key]===false?false:null}));
  const known=checks.filter(check=>check.value!==null).length;
  const ready=checks.filter(check=>check.value===true).length;
  const failed=checks.filter(check=>check.value===false).length;
  const unknown=checks.length-known;
  if(agent?.status!=='connected')return {
    tone:'unknown',label:t('Posto local não conectado','Local workstation not connected'),
    detail:t('A Central pode continuar usando dados compartilhados ou cache, mas o health local não está sendo confirmado agora.','The Work Center can still use shared data or cache, but local health is not being confirmed right now.'),
    connected:false,build,candidate,setup,checks,known,ready,failed,unknown
  };
  if(!known)return {
    tone:'unknown',label:t('Health do posto não informado','Workstation health not reported'),
    detail:t('O agente está conectado, mas não informou verificações de runtime suficientes para declarar o posto pronto.','The agent is connected, but it did not report enough runtime checks to declare the workstation ready.'),
    connected:true,build,candidate,setup,checks,known,ready,failed,unknown
  };
  const tone=setup===true&&failed===0&&unknown===0?'ok':'partial';
  const label=tone==='ok'?t('Posto pronto','Workstation ready'):t('Posto conectado com pendências','Workstation connected with pending checks');
  const detail=`${ready}/${known} ${t('verificações informadas prontas','reported checks ready')} · ${failed} ${t('falha(s)','failed')} · ${unknown} ${t('não informada(s)','not reported')}`;
  return {tone,label,detail,connected:true,build,candidate,setup,checks,known,ready,failed,unknown};
}

export function buildSyncHealth(agent={}){
  const sync=agent?.sync||{};
  const safePair=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isInteger(n)&&n>=0)?value.slice():null;
  const comparisonStates=['unsupported_installation_count','period_unverified','different_periods','ambiguous_identifiers','candidate_overlap','no_candidate_matches'];
  const comparison=value=>({state:comparisonStates.includes(value?.state)?value.state:'period_unverified',
    window_scope:['same_window','overlap_only'].includes(value?.window_scope)?value.window_scope:null,
    observed_defects:safePair(value?.observed_defects),coverage_complete:Array.isArray(value?.coverage_complete)&&value.coverage_complete.length===2?value.coverage_complete.map(x=>x===true):null,
    unverifiable_rows:safePair(value?.unverifiable_rows),ambiguous_keys:safePair(value?.ambiguous_keys),outside_common_window:safePair(value?.outside_common_window),
    candidate_matches:Number.isInteger(value?.candidate_matches)&&value.candidate_matches>=0?value.candidate_matches:null,
    unmatched_observed:safePair(value?.unmatched_observed)});
  const conflicts=(Array.isArray(sync.origin_conflict_candidates)?sync.origin_conflict_candidates:[])
    .filter(item=>LINE_IDS.includes(item?.line_id))
    .map(item=>({line_id:item.line_id,
      installations:Number.isInteger(item.installations)?item.installations:0,
      distinct_sources:Number.isInteger(item.distinct_sources)?item.distinct_sources:0,
      identity_collision:item.identity_collision===true,
      observation_comparison:comparison(item.observation_comparison),
      candidates:(Array.isArray(item.candidates)?item.candidates:[]).slice(0,10).map(candidate=>({
        source_id:String(candidate.source_id||''),snapshot_id:String(candidate.snapshot_id??''),
        snapshot_revision:Number(candidate.snapshot_revision)||0,collected_at:candidate.collected_at||null
      }))}));
  const heads=(Array.isArray(sync.remote_heads)?sync.remote_heads:[])
    .filter(head=>LINE_IDS.includes(head?.line_id))
    .map(head=>({
      line_id:head.line_id,
      source_id:String(head.source_id||''),
      snapshot_id:String(head.snapshot_id??''),
      snapshot_revision:Number(head.snapshot_revision)||0,
      collected_at:head.collected_at||null,
      authority:['team_latest','operational_day_history'].includes(head.authority)?head.authority:null
    }))
    .sort((a,b)=>LINE_IDS.indexOf(a.line_id)-LINE_IDS.indexOf(b.line_id));
  const readStatus=normalizedStatus(sync.read_status);
  const latest=sync.remote_latest_collected_at||heads.map(head=>head.collected_at).filter(Boolean).sort().at(-1)||null;
  const authority=sync.remote_scope==='operational_day_history'?'operational_day_history':sync.remote_scope==='team_latest'||heads.some(head=>head.authority==='team_latest')?'team_latest':null;
  if(readStatus==='origin_conflict')return {
    tone:'error',label:t('Origens concorrentes — verificação necessária','Competing sources — review required'),
    detail:t('Mais de uma instalação apresentou dados para a mesma linha e dia operacional. Nenhuma origem foi escolhida automaticamente.','More than one installation reported the same production line and day. No origin was selected automatically.'),
    heads,conflicts,count:heads.length,latest,authority,read_status:readStatus,has_error:true
  };
  if(readStatus==='cached')return {
    tone:'partial',label:t('Cache compartilhado; servidor não confirmado','Shared cache; server not confirmed'),
    detail:t('Evidência preservada no navegador. Aguarde reconexão para confirmar a versão do servidor.','Evidence preserved in this browser. Reconnect to confirm the server version.'),
    heads,count:heads.length,latest,authority,read_status:readStatus,has_error:false
  };
  if(readStatus==='error'){
    return {
      tone:heads.length?'partial':'error',
      label:heads.length?t('Atualização falhou; última leitura preservada','Refresh failed; last read preserved'):t('Erro de sincronização','Synchronization error'),
      detail:heads.length?t('A atualização compartilhada falhou, mas a última evidência válida continua identificada abaixo.','Shared refresh failed, but the last valid evidence remains identified below.'):t('Não foi possível obter uma leitura compartilhada válida. Dados locais continuam independentes.','A valid shared read could not be obtained. Local data remains independent.'),
      heads,count:heads.length,latest,authority,read_status:readStatus,has_error:true
    };
  }
  if(!heads.length){
    return {
      tone:'unknown',
      label:t('Sem leitura compartilhada','No shared read'),
      detail:t('Nenhum snapshot remoto está ativo neste momento. Isso não altera nem invalida a base local.','No remote snapshot is active right now. This does not change or invalidate the local database.'),
      heads,count:0,latest:null,authority,read_status:readStatus||'idle',has_error:false
    };
  }
  const complete=heads.length===LINE_IDS.length;
  return {
    tone:complete?'ok':'partial',
    label:complete?t('Cobertura compartilhada completa','Complete shared coverage'):t('Cobertura compartilhada parcial','Partial shared coverage'),
    detail:`${heads.length}/${LINE_IDS.length} ${t('linhas com snapshot compartilhado identificado','lines with identified shared snapshot')}`,
    heads,count:heads.length,latest,authority,read_status:readStatus||'ready',has_error:false
  };
}

// Physical A/B test evidence: metadata only. No source_id, UID, PCBA, MES
// cookies, raw payloads, hostnames, or free-form error messages are copied.
export function factorySyncEvidence(agent={},at=new Date()){
  const sync=agent?.sync||{};
  const line=value=>LINE_IDS.includes(value)?value:null;
  const num=value=>Number.isFinite(value)&&value>=0&&value<=86400000?Math.round(value):null;
  const timing=(v,fields)=>Object.fromEntries(fields.map(k=>[k,num(v?.[k])]));
  const sent=sync.last_sent||{},rHeads=Array.isArray(sync.remote_heads)?sync.remote_heads:[];
  const safeTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)?value.slice(0,35):null;
  const safeVersion=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(value)?value:null;
  const safeId=value=>/^\d+$/.test(String(value||''))?String(value):null;
  const authority=value=>['team_latest','operational_day_history'].includes(value)?value:null;
  return {
    schema:'ames-pr38-factory-a-b-v1',
    captured_at:at.toISOString(),
    agent_build:safeVersion(agent?.agent_build),
    local_agent_connected:agent?.status==='connected',
    publishing:{
      status:typeof sync.status==='string'&&/^[a-z_]{1,50}$/.test(sync.status)?sync.status:'unknown',
      pending:Number.isInteger(sync.pending)?Math.max(0,sync.pending):null,
      blocked_lines:(sync.identity_blocked||[]).map(line).filter(Boolean),
      last_sent:line(sent.line_id)?{
        line_id:sent.line_id,snapshot_id:safeId(sent.snapshot_id),
        revision:Number.isInteger(sent.snapshot_revision)?sent.snapshot_revision:null,
        authority:authority(sent.authority),sent_at:safeTimestamp(sent.sent_at)
      }:null,
      last_timings_ms:timing(sync.last_publish_timing,['parts_ms','head_ms','history_ms','total_ms'])
    },
    receiving:{
      status:typeof sync.read_status==='string'&&/^[a-z_]{1,50}$/.test(sync.read_status)?sync.read_status:'unknown',
      authority:authority(sync.remote_scope),received_at:safeTimestamp(sync.last_received_at),
      listener_event_at:safeTimestamp(sync.server_received_at),
      conflict_lines:(sync.origin_conflict_lines||[]).map(line).filter(Boolean),
      conflict_candidates:(sync.origin_conflict_candidates||[]).filter(item=>line(item?.line_id)).map(item=>({
        line_id:item.line_id,
        installations:Number.isInteger(item.installations)?item.installations:null,
        distinct_sources:Number.isInteger(item.distinct_sources)?item.distinct_sources:null,
        identity_collision:item.identity_collision===true,
        comparison_state:['candidate_overlap','no_candidate_matches','different_periods','period_unverified','ambiguous_identifiers','unsupported_installation_count'].includes(item.observation_comparison?.state)?item.observation_comparison.state:null,
        candidate_matches:Number.isInteger(item.observation_comparison?.candidate_matches)&&item.observation_comparison.candidate_matches>=0?item.observation_comparison.candidate_matches:null
      })),
      visible_heads:rHeads.filter(h=>line(h?.line_id)).map(h=>({
        line_id:h.line_id,snapshot_id:safeId(h.snapshot_id),
        revision:Number.isInteger(h.snapshot_revision)?h.snapshot_revision:null,
        collected_at:safeTimestamp(h.collected_at),authority:authority(h.authority)
      })),
      last_timings_ms:timing(sync.last_receive_timing,['read_ms','download_ms']),
      candidates:Number.isInteger(sync.last_receive_timing?.candidates)?sync.last_receive_timing.candidates:null,
      downloaded:Number.isInteger(sync.last_receive_timing?.downloaded)?sync.last_receive_timing.downloaded:null,
      cache_hits:Number.isInteger(sync.last_receive_timing?.cache_hits)?sync.last_receive_timing.cache_hits:null,
      skipped_versions:Number.isInteger(sync.last_receive_timing?.skipped_versions)?sync.last_receive_timing.skipped_versions:null
    }
  };
}

export function createDataHealthView(root,store,{onEvidence=()=>{}}={}){
  let last='',security=null,securityFor='',securityLoading=false,repairStatus=null,repairFor='',repairLoading=false,disposed=false;
  async function loadSecurity(agent){if(disposed||securityLoading||agent.status!=='connected')return;const identity=String(agent.agent_build||agent.capabilities?.agent_build||'connected');if(securityFor===identity&&security)return;securityLoading=true;securityFor=identity;try{security=await readHardeningDiagnostics();}catch(error){security={status:'unavailable',reason:error?.name==='AbortError'?'aborted':'error'};}finally{securityLoading=false;if(!disposed){last='';render();}}}
  async function loadRepairStatus(agent){if(disposed||repairLoading||agent.status!=='connected')return;const identity=String(agent.agent_build||agent.capabilities?.agent_build||'connected');if(repairFor===identity&&repairStatus)return;repairLoading=true;repairFor=identity;try{repairStatus=await read3012Status();}catch(error){repairStatus={status:'unavailable',reason:error?.name==='AbortError'?'aborted':'error'};}finally{repairLoading=false;if(!disposed){last='';render();}}}
  function render(){
    if(disposed)return;const agent=store.agent();
    if(agent.status==='connected'){void loadSecurity(agent);void loadRepairStatus(agent);}else{if(security||securityFor){security=null;securityFor='';securityLoading=false;}if(repairStatus||repairFor){repairStatus=null;repairFor='';repairLoading=false;}}
    const model=buildDataHealth(store,repairStatus),workstationState=buildWorkstationHealth(agent),securityState=buildSecurityHealth(security),syncState=buildSyncHealth(agent);
    const key=JSON.stringify([model,agent.status,agent.agent_build,agent.connection_error,agent.sync,workstationState,syncState,security,securityLoading,repairStatus,repairLoading,typeof document==='undefined'?'':document.documentElement.lang]);if(key===last)return;last=key;
    const syncAuthority=syncState.authority==='operational_day_history'?t('Revisão imutável do dia operacional','Immutable operational-day revision'):syncState.authority==='team_latest'?t('Mais recente da equipe','Latest team snapshot'):t('Não informada','Not provided');
    const syncLines=syncState.heads.map((head,index)=>`${t('Linha','Line')} ${LINE_IDS.indexOf(head.line_id)+1||index+1} · ${esc(head.line_id)} · ${t('Origem','Source')} ${esc(head.source_id||'—')} · Snapshot ${esc(head.snapshot_id||'—')} r${esc(head.snapshot_revision)} · ${esc(head.collected_at||'—')}`).join('<br>');
    const syncConflicts=(syncState.conflicts||[]).map(item=>{
      const compare=item.observation_comparison;
      const label={candidate_overlap:t('Possíveis correspondências entre 3028 (não confirmadas)','Possible matches between 3028 captures (unconfirmed)'),no_candidate_matches:t('Sem correspondências candidatas entre as linhas observadas','No candidate matches between observed rows'),different_periods:t('Períodos divergentes: comparação bloqueada','Different periods: comparison blocked'),period_unverified:t('Período não comprovado: comparação bloqueada','Unverified period: comparison blocked'),ambiguous_identifiers:t('Identificadores ambíguos: contagens comparativas bloqueadas','Ambiguous identities: comparison counts blocked'),unsupported_installation_count:t('Comparação disponível apenas para duas instalações','Comparison requires exactly two installations')}[compare.state];
      const scope=compare.window_scope==='overlap_only'?` · ${t('Comparação restrita à janela temporal comum','Comparison restricted to common time window')}`:'';
      const counts=compare.observed_defects?` · ${t('Falhas observadas em cada coleta dentro da janela comum','Observed defects per capture inside common window')}: ${compare.observed_defects.join(' / ')}`:'';
      const possible=compare.candidate_matches!=null?` · ${t('Coincidências candidatas','Candidate matches')}: ${compare.candidate_matches}`:'';
      const outside=compare.outside_common_window?.some(x=>x)?` · ${t('Fora da janela comum (não comparadas)','Outside common window (not compared)')}: ${compare.outside_common_window.join(' / ')}`:'';
      const coverage=compare.coverage_complete?` · ${t('Cobertura 3028 reportada completa por coleta','3028 coverage reported complete per capture')}: ${compare.coverage_complete.map(x=>x?'sim':'não').join(' / ')}`:'';
      return `<li><b>${esc(item.line_id)}</b> · ${item.installations} ${t('instalações verificadas','verified installations')} · ${item.distinct_sources} ${t('identidades de origem','source identities')}${item.identity_collision?` · <strong>${t('identidade repetida entre instalações','same source identity across installations')}</strong>`:''}<ul>${item.candidates.map(candidate=>`<li>${esc(candidate.source_id||'—')} · Snapshot ${esc(candidate.snapshot_id)} r${esc(candidate.snapshot_revision)} · ${esc(candidate.collected_at||'—')}</li>`).join('')}</ul><p>${label}${scope}${counts}${possible}${outside}${coverage}</p></li>`;
    }).join('');
    const sync=agent.sync||{},sent=sync.last_sent,blockCount=Array.isArray(sync.identity_blocked)?sync.identity_blocked.length:0;
    const syncDetails=`<br><small>${t('Fila pendente','Pending queue')}: ${Number.isInteger(sync.pending)?sync.pending:'—'} · ${t('Publicação','Publication')}: ${esc(sync.status||'—')}<br>${t('Último snapshot enviado','Last snapshot sent')}: ${sent?`${esc(sent.line_id)} / ${esc(sent.source_id)} / ${esc(sent.snapshot_id)} r${esc(sent.snapshot_revision)} · ${esc(sent.sent_at)}`:'—'}<br>${t('Último recebimento','Last received')}: ${esc(sync.last_received_at||'—')} · ${t('Evento remoto recebido (relógio local)','Remote listener event (local clock)')}: ${esc(sync.server_received_at||'—')}<br>${t('Erro de publicação','Publication error')}: ${esc(sync.error||'—')}<br>${t('Erro de leitura','Read error')}: ${esc(sync.read_error||'—')}<br>${t('Cabeçalho legado bloqueado','Legacy head blocked')}: ${blockCount?esc(sync.identity_blocked.join(', ')):'—'} · ${t('Conflito de origens','Origin conflict')}: ${esc((sync.origin_conflict_lines||[]).join(', ')||'—')}<br>${t('Duração do último envio','Last publish duration')}: ${sync.last_publish_timing?.total_ms??'—'} ms · ${t('Recebimento','Receive duration')}: ${sync.last_receive_timing?.read_ms??'—'} ms · ${t('Revisões no índice','Indexed revisions')}: ${sync.last_receive_timing?.candidates??'—'} · ${t('Baixadas','Downloaded')}: ${sync.last_receive_timing?.downloaded??'—'} · ${t('Evitadas','Skipped')}: ${sync.last_receive_timing?.skipped_versions??'—'}<br>${t('Tempos locais de leitura e publicação não representam a latência total A → B.','Local read and publish timings are not the full A → B latency.')}</small>`;
    const setupLabel=workstationState.setup===true?t('concluído','complete'):workstationState.setup===false?t('pendente','pending'):'—';
    const workstationChecks=workstationState.checks.map(check=>`${esc(check.label)}: ${check.value===true?t('pronto','ready'):check.value===false?t('falha','failed'):'—'}`).join(' · ');
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-data-health"><div class="section-head"><div><h3>${t('Saúde e cobertura dos dados','Data health and coverage')}</h3><p>${t('Mostra o que foi realmente carregado. Ausência de evidência nunca é apresentada como zero.','Shows what was actually loaded. Missing evidence is never presented as zero.')}</p></div><span class="ames-health-agent ${agent.status==='connected'?'ok':'unknown'}">${agent.status==='connected'?t('Agente conectado','Agent connected'):t('Dados compartilhados / cache','Shared data / cache')}</span></div><div class="ames-data-health-grid">${model.map(item=>`<article class="ames-health-card ${item.state.tone}" data-source-state="${esc(item.state.source_state)}"><div class="ames-health-card-head"><div><b>${esc(item.label)}</b><span>${esc(item.name)}</span></div><span class="ames-health-state">${esc(item.state.label)}</span></div><strong>${item.displayCount??'—'}</strong><small>${esc(item.unit)}</small><p>${esc(item.state.detail)}</p><footer><span>${esc(item.latest||t('coleta não informada','collection not provided'))}</span><button type="button" class="button secondary" data-health-evidence="${esc(item.source)}">${t('Ver evidência','View evidence')}</button></footer></article>`).join('')}</div><div class="notice ${workstationState.tone==='partial'?'warn':''}" data-workstation-health><b>${t('Posto local','Local workstation')} · ${esc(workstationState.label)}</b><br>${esc(workstationState.detail)}${agent.connection_error?`<br><span role="status">${esc(agent.connection_error.code)}: ${esc(agent.connection_error.message)}</span>`:''}<br><small>${t('Build instalado','Installed build')}: ${esc(workstationState.build||'—')} · ${t('Candidato informado','Reported candidate')}: ${esc(workstationState.candidate||'—')} · ${t('Setup','Setup')}: ${esc(setupLabel)}${workstationChecks?`<br>${workstationChecks}`:''}</small></div><div class="notice ${syncState.tone==='partial'||syncState.tone==='error'?'warn':''}" data-sync-health><b>${t('Sincronização entre postos','Cross-workstation sync')} · ${esc(syncState.label)}</b><br>${esc(syncState.detail)}<br><small>${t('Autoridade','Authority')}: ${esc(syncAuthority)} · ${t('Última coleta remota','Latest remote collection')}: ${esc(syncState.latest||'—')}${syncLines?`<br>${syncLines}`:''}</small>${syncDetails}${syncConflicts?`<details open data-sync-origin-conflicts><summary>${t('Revisar origens conflitantes sem combinar dados','Review conflicting sources without combining data')}</summary><ul>${syncConflicts}</ul><p>${t('Apenas metadados verificados. Esses registros não comprovam fechamento FULL nem autorizam somar falhas entre postos.','Verified metadata only. These entries do not prove FULL closure or permit adding defects across workstations.')}</p></details>`:''}<p><button type="button" class="button secondary" data-sync-copy>${t('Copiar diagnóstico A/B (sem dados sensíveis)','Copy A/B diagnostic (no sensitive data)')}</button> <span role="status" data-sync-copy-status></span></p></div><div class="notice ${securityState.tone==='partial'?'warn':''}" data-security-health><b>${t('Segurança local','Local security')} · ${esc(securityState.label)}</b><br>${esc(securityState.detail)}<br><small>${t('Origens remotas autorizadas','Authorized remote origins')}: ${securityState.remote??'—'} · ${t('Entradas rejeitadas','Rejected entries')}: ${securityState.rejected??'—'}${securityState.mode?` · ${esc(securityState.mode)}`:''}</small></div></section>`;
    root.querySelector?.('[data-sync-copy]')?.addEventListener('click',async()=>{
      const status=root.querySelector('[data-sync-copy-status]');
      try{
        if(!navigator.clipboard?.writeText)throw Error('clipboard_unavailable');
        await navigator.clipboard.writeText(JSON.stringify(factorySyncEvidence(store.agent()),null,2));
        if(status)status.textContent=t('Diagnóstico copiado. Identifique este posto como A ou B ao enviar.','Diagnostic copied. Label this workstation A or B when sharing.');
      }catch{
        if(status)status.textContent=t('Cópia indisponível neste navegador. Não altere as permissões do agente.','Clipboard unavailable in this browser. Do not change agent permissions.');
      }
    });
    root.querySelectorAll('[data-health-evidence]').forEach(button=>button.addEventListener('click',()=>{const item=model.find(x=>x.source===button.dataset.healthEvidence);if(!item)return;const fields=[[t('Estado','Status'),item.state.label],[t('Proveniência','Provenance'),sourceStateLabel(item.state.source_state,locale())],[t('Registros visíveis','Visible records'),item.displayCount??'—'],[t('Última coleta','Last collection'),item.latest||'—'],[t('Build do agente','Agent build'),agent.agent_build||agent.capabilities?.agent_build||'—']];const notes=[t('0 só é mostrado quando a fonte foi comprovadamente consultada e retornou zero. Fonte não coletada, parcial sem cobertura ou com erro fica como —/estado explícito.','0 is shown only when the source was proven queried and returned zero. Uncollected, unproven partial, or failed sources remain — with an explicit status.')];if(item.source==='3012'&&item.cache){fields.push([t('Registros no SQLite 3012','3012 SQLite records'),item.cache.rows??'—'],[t('SNs com cobertura registrada','SNs with recorded coverage'),item.cache.coverageSns??'—'],[t('Intervalos de cobertura','Coverage intervals'),item.cache.coverageIntervals??'—'],['AMES_START_DATE',item.cache.amesStartDate||'—'],[t('Validação física 3012','3012 physical validation'),item.cache.factoryValidated?t('validada','validated'):t('pendente','pending')]);}onEvidence({title:`${item.label} · ${item.name}`,description:item.state.detail,fields,lines:item.reads.map(x=>({label:`${t('Linha','Line')} ${x.index} · ${x.line}`,snapshot:x.read.snapshot?.snapshot_id||t('sem snapshot','no snapshot'),freshness:x.read.freshness,detail:sourceStateLabel(readSourceState(x.read),locale())})),notes});}));
  }
  return {render,clear(){disposed=true;root?.replaceChildren();root?.removeAttribute('data-no-i18n');last='';security=null;securityFor='';repairStatus=null;repairFor='';}};
}
