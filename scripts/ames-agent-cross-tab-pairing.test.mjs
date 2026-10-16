import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){this.map=new Map();}
  getItem(key){return this.map.has(key)?this.map.get(key):null;}
  setItem(key,value){this.map.set(key,String(value));}
  removeItem(key){this.map.delete(key);}
  clear(){this.map.clear();}
}

const TOKEN='AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-PAIR';
const KEY='central.ames.agentToken.v1';

function browser({hash='',session=new MemoryStorage(),local=new MemoryStorage()}={}){
  let replaced='';
  globalThis.window={
    location:{hash,pathname:'/Central-de-Controle/',search:''},
    sessionStorage:session,
    localStorage:local,
    history:{replaceState(_state,_title,url){replaced=String(url);}}
  };
  return {session,local,replaced:()=>replaced};
}

const moduleUrl=new URL('../ames/agent-client.mjs',import.meta.url);

test('launcher pairing persists on the official origin and a fresh tab reuses it',async()=>{
  const local=new MemoryStorage();
  const first=browser({hash:'#ames_agent_token='+encodeURIComponent(TOKEN),local});
  const mod=await import(moduleUrl.href+'?pair='+Date.now());
  assert.equal(mod.bootstrapAgentToken(),TOKEN);
  assert.equal(first.session.getItem(KEY),TOKEN);
  assert.equal(local.getItem(KEY),TOKEN);
  assert.equal(first.replaced(),'/Central-de-Controle/');

  const second=browser({local,session:new MemoryStorage()});
  assert.equal(mod.bootstrapAgentToken(),TOKEN);
  assert.equal(second.session.getItem(KEY),TOKEN);
});

test('an already-open official tab adopts a pairing created later and clears it on 401',async()=>{
  const local=new MemoryStorage(),session=new MemoryStorage();browser({local,session});
  const mod=await import(moduleUrl.href+'?dynamic='+Date.now());
  const seen=[];
  const store={updateAgent(){},agent(){return {status:'disconnected'};}};
  const client=mod.createAgentClient(store,{fetcher:async(_url,options)=>{
    seen.push(options.headers?.['X-Central-Agent-Token']||'');
    return {status:401,ok:false,json:async()=>({})};
  }});
  local.setItem(KEY,TOKEN);
  await assert.rejects(client.connect(),/não autorizado/i);
  assert.equal(seen[0],TOKEN);
  assert.equal(local.getItem(KEY),null);
  assert.equal(session.getItem(KEY),null);
});
