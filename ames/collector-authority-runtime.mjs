import {LINE_IDS} from './data/contract.mjs';
import {createCollectorLeaseClient} from './collector-lease-client.mjs';
import {createCollectorLeaseObserver} from './collector-lease-observer.mjs';
import {createCollectorFenceConfirmation} from './collector-fence-confirmation.mjs';

export const COLLECTOR_AUTHORITY_RUNTIME_SCHEMA='central-collector-authority-runtime-v1';

const publicLine=(observation,confirmation=null)=>{
  const confirmed=confirmation?.status==='confirmed';
  const confirmationUnavailable=confirmation?.status==='unavailable';
  const notConfirmed=confirmation?.status==='not_confirmed';
  const status=confirmed?'confirmed_current':notConfirmed?'not_confirmed':confirmationUnavailable?'confirmation_unavailable':observation.status;
  const reason=confirmation?.reason||observation.reason;
  return Object.freeze({line_id:observation.line_id,status,reason,authoritative:confirmed});
};

export function createCollectorAuthorityRuntime(store,{
  db,doc,getDoc,runTransaction,serverTimestamp,currentUid,
  now=()=>Date.now(),minIntervalMs=30000,changed=()=>{}
}={}){
  if(!store||typeof store.agent!=='function'||typeof store.updateAgent!=='function')throw new TypeError('A-MES store obrigatório');
  for(const [name,value] of Object.entries({doc,getDoc,runTransaction,serverTimestamp,currentUid,now,changed}))if(typeof value!=='function')throw new TypeError(`${name} obrigatório`);
  if(!db)throw new TypeError('db obrigatório');
  if(!Number.isFinite(minIntervalMs)||minIntervalMs<0)throw new TypeError('minIntervalMs inválido');

  let key='',observer=null,confirmation=null,lastAt=0,inFlight=null,generation=0;
  const confirmedFences=new Map();
  const publish=patch=>{store.updateAgent({collector_authority:patch});try{changed(patch);}catch{}};
  const base=(status,extra={})=>Object.freeze({
    schema:COLLECTOR_AUTHORITY_RUNTIME_SCHEMA,
    mode:'observe_and_confirm_same_workstation',
    status,
    authoritative:false,
    enforcement:false,
    lines:[],
    ...extra
  });

  function prerequisites(){
    const agent=store.agent()||{},uid=String(currentUid()||'').trim();
    const workstation=agent.workstation_identity?.stable===true?String(agent.workstation_identity.workstation_id||''):'';
    const configured=[...new Set((agent.config?.configured_lines||[]).filter(line=>LINE_IDS.includes(line)))].sort();
    if(!uid)return {ready:false,state:base('no_session',{reason:'authenticated_user_unavailable'})};
    if(!workstation)return {ready:false,state:base('identity_unavailable',{reason:'stable_workstation_identity_unavailable'})};
    if(!configured.length)return {ready:false,state:base('no_lines',{reason:'no_configured_mes_lines'})};
    return {ready:true,uid,workstation,lines:configured,key:`${uid}|${workstation}|${configured.join(',')}`};
  }

  function ensureContext(pre){
    if(observer&&confirmation&&key===pre.key)return;
    key=pre.key;
    confirmedFences.clear();
    const leaseClient=createCollectorLeaseClient({
      db,doc,getDoc,runTransaction,serverTimestamp,
      currentUid:()=>String(currentUid()||'').trim(),
      workstationId:pre.workstation
    });
    observer=createCollectorLeaseObserver({leaseClient});
    confirmation=createCollectorFenceConfirmation({leaseClient});
    lastAt=0;
  }

  async function refresh({force=false}={}){
    const pre=prerequisites();
    if(!pre.ready){key='';observer=null;confirmation=null;confirmedFences.clear();lastAt=0;inFlight=null;publish(pre.state);return pre.state;}
    ensureContext(pre);
    const time=Number(now());
    if(!force&&lastAt&&time-lastAt<minIntervalMs)return store.agent().collector_authority||base('throttled');
    if(inFlight)return inFlight;
    const run=++generation;
    inFlight=(async()=>{
      const lines=[];
      for(const line of pre.lines){
        const observation=await observer.observe(line);
        if(run!==generation)return store.agent().collector_authority||base('superseded');
        const confirmationResult=await confirmation.confirm(observation);
        if(run!==generation)return store.agent().collector_authority||base('superseded');
        if(confirmationResult.status==='confirmed'&&confirmationResult.publication_fence)confirmedFences.set(line,confirmationResult.publication_fence);
        else confirmedFences.delete(line);
        lines.push(publicLine(observation,confirmationResult));
      }
      const state=base('observed_and_confirmed',{observed_at_ms:time,lines:Object.freeze(lines)});
      if(run===generation){lastAt=time;publish(state);}
      return state;
    })().finally(()=>{if(run===generation)inFlight=null;});
    return inFlight;
  }

  function clear(){
    generation++;key='';observer=null;confirmation=null;confirmedFences.clear();lastAt=0;inFlight=null;
    store.updateAgent({collector_authority:null});
  }

  return Object.freeze({
    refresh,clear,
    activation:'runtime_same_workstation_server_confirmation_private_fence_no_sync_binding_no_enforcement'
  });
}
