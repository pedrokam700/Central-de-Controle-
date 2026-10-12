import {LINE_IDS} from './data/contract.mjs';
import {createCollectorLeaseClient} from './collector-lease-client.mjs';
import {createCollectorLeaseObserver} from './collector-lease-observer.mjs';

export const COLLECTOR_AUTHORITY_RUNTIME_SCHEMA='central-collector-authority-runtime-v1';

const publicLine=observation=>Object.freeze({
  line_id:observation.line_id,
  status:observation.status,
  reason:observation.reason,
  authoritative:false
});

export function createCollectorAuthorityRuntime(store,{
  db,doc,getDoc,runTransaction,serverTimestamp,currentUid,
  now=()=>Date.now(),minIntervalMs=30000,changed=()=>{}
}={}){
  if(!store||typeof store.agent!=='function'||typeof store.updateAgent!=='function')throw new TypeError('A-MES store obrigatório');
  for(const [name,value] of Object.entries({doc,getDoc,runTransaction,serverTimestamp,currentUid,now,changed}))if(typeof value!=='function')throw new TypeError(`${name} obrigatório`);
  if(!db)throw new TypeError('db obrigatório');
  if(!Number.isFinite(minIntervalMs)||minIntervalMs<0)throw new TypeError('minIntervalMs inválido');

  let key='',observer=null,lastAt=0,inFlight=null,generation=0;
  const publish=patch=>{store.updateAgent({collector_authority:patch});try{changed(patch);}catch{}};
  const base=(status,extra={})=>Object.freeze({
    schema:COLLECTOR_AUTHORITY_RUNTIME_SCHEMA,
    mode:'observe_only',
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

  function ensureObserver(pre){
    if(observer&&key===pre.key)return observer;
    key=pre.key;
    const leaseClient=createCollectorLeaseClient({
      db,doc,getDoc,runTransaction,serverTimestamp,
      currentUid:()=>String(currentUid()||'').trim(),
      workstationId:pre.workstation
    });
    observer=createCollectorLeaseObserver({leaseClient});
    lastAt=0;
    return observer;
  }

  async function refresh({force=false}={}){
    const pre=prerequisites();
    if(!pre.ready){key='';observer=null;lastAt=0;inFlight=null;publish(pre.state);return pre.state;}
    ensureObserver(pre);
    const time=Number(now());
    if(!force&&lastAt&&time-lastAt<minIntervalMs)return store.agent().collector_authority||base('throttled');
    if(inFlight)return inFlight;
    const run=++generation;
    inFlight=(async()=>{
      const lines=[];
      for(const line of pre.lines){
        const observation=await observer.observe(line);
        if(run!==generation)return store.agent().collector_authority||base('superseded');
        lines.push(publicLine(observation));
      }
      const state=base('observed',{observed_at_ms:time,lines:Object.freeze(lines)});
      if(run===generation){lastAt=time;publish(state);}
      return state;
    })().finally(()=>{if(run===generation)inFlight=null;});
    return inFlight;
  }

  function clear(){
    generation++;key='';observer=null;lastAt=0;inFlight=null;
    store.updateAgent({collector_authority:null});
  }

  return Object.freeze({
    refresh,clear,
    activation:'runtime_observer_only_no_claim_no_confirm_no_fence_no_enforcement'
  });
}
