import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient,publicAgentWorkstationIdentity,AGENT_WORKSTATION_IDENTITY_SCHEMA} from '../ames/agent-client.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {CANONICAL_SCHEMA} from '../ames/data/canonical.mjs';
import {SCHEDULER_POLICY} from '../ames/data/agent-contract.mjs';

const WS='ws_'+'a'.repeat(32);
const publicIdentity={
  schema:'central-workstation-identity-v1',
  workstation_id:WS,
  stable:true,
  identity_kind:'random_local_capability',
  hostname:'FACTORY-PC-SECRET',
  path:'C:/secret/workstation_identity.json',
  token:'DO_NOT_STORE'
};

function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(value)};}
function rig({hardening='valid',agentToken='PAIRING_SECRET'}={}){
  const store=createAmesStore(),calls=[];
  const fetcher=async(url,options={})=>{
    const key=new URL(url).pathname.replace('/api/v1/','');
    calls.push({key,headers:{...(options.headers||{})},credentials:options.credentials});
    if(key==='health')return response({agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY},engine_found:true,chrome_cdp_reachable:true,ames_reachable:true,auto_3022_ready:true});
    if(key==='hardening/health'){
      if(hardening==='missing')return response({error:'not_found'},404);
      if(hardening==='invalid')return response({ok:true,workstation_identity:{...publicIdentity,workstation_id:'invalid'}});
      return response({ok:true,workstation_identity:publicIdentity});
    }
    if(key==='v2/capabilities')return response({schema:CANONICAL_SCHEMA,native_console:true,cursor:true,revision:true,process_timeline:true});
    if(key==='config')return response({configured_lines:['TAN10101'],performance:'fast'});
    if(key==='monitor')return response({enabled:false,interval_minutes:5,next_run_at:null});
    if(key==='v2/snapshots')return response({snapshots:[]});
    throw new Error('Unexpected route '+key);
  };
  return {store,calls,client:createAgentClient(store,{fetcher,agentToken})};
}

test('public workstation identity projection accepts only stable validated local capability fields',()=>{
  const projected=publicAgentWorkstationIdentity({workstation_identity:publicIdentity});
  assert.deepEqual(projected,{schema:AGENT_WORKSTATION_IDENTITY_SCHEMA,workstation_id:WS,stable:true,identity_kind:'random_local_capability'});
  const serialized=JSON.stringify(projected);
  for(const forbidden of ['FACTORY-PC-SECRET','C:/secret','DO_NOT_STORE','hostname','path','token'])assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.equal(publicAgentWorkstationIdentity({workstation_identity:{...publicIdentity,workstation_id:'invalid'}}),null);
  assert.equal(publicAgentWorkstationIdentity({workstation_identity:{...publicIdentity,stable:false}}),null);
  assert.equal(publicAgentWorkstationIdentity({workstation_identity:{...publicIdentity,schema:'other'}}),null);
});

test('hardened local agent identity becomes session-scoped browser state without leaking pairing token',async()=>{
  const h=rig();
  await h.client.connect();
  assert.equal(h.store.agent().workstation_identity_status,'ready');
  assert.deepEqual(h.store.agent().workstation_identity,{schema:AGENT_WORKSTATION_IDENTITY_SCHEMA,workstation_id:WS,stable:true,identity_kind:'random_local_capability'});
  const serialized=JSON.stringify(h.store.agent());
  assert.equal(serialized.includes('PAIRING_SECRET'),false);
  assert.equal(serialized.includes('FACTORY-PC-SECRET'),false);
  assert(h.calls.some(c=>c.key==='hardening/health'));
  assert(h.calls.every(c=>c.credentials==='omit'));
  h.client.clear();
  assert.equal(h.store.agent().workstation_identity,null);
  assert.equal(h.store.agent().workstation_identity_status,null);
});

test('legacy agent without hardening health remains connected but explicitly unfenced',async()=>{
  const h=rig({hardening:'missing'});
  await h.client.connect();
  assert.equal(h.store.agent().status,'connected');
  assert.equal(h.store.agent().workstation_identity,null);
  assert.equal(h.store.agent().workstation_identity_status,'legacy_unavailable');
  h.client.clear();
});

test('malformed hardened identity never becomes collector identity and does not break MES compatibility',async()=>{
  const h=rig({hardening:'invalid'});
  await h.client.connect();
  assert.equal(h.store.agent().status,'connected');
  assert.equal(h.store.agent().workstation_identity,null);
  assert.equal(h.store.agent().workstation_identity_status,'invalid');
  h.client.clear();
});
