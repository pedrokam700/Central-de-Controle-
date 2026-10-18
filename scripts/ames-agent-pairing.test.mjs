import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';

function fakeStore(){
  let agent={status:'disconnected',error:''};
  return {
    agent:()=>agent,
    updateAgent:patch=>{agent={...agent,...patch};},
    setLocalConnected:()=>{},
    localCanonical:()=>[],
    replaceLocalSnapshots:()=>[]
  };
}

test('agent client sends workstation token and surfaces 401 as pairing error', async()=>{
  const token='test-workstation-token-abcdefghijklmnopqrstuvwxyz123456';
  let request=null;
  const fetcher=async(url,options)=>{
    request={url,options};
    return {status:401,ok:false};
  };
  const client=createAgentClient(fakeStore(),{fetcher,agentToken:token});
  await assert.rejects(client.connect(),/não autorizado|launcher deste posto/i);
  assert.ok(request,'request esperado');
  assert.equal(request.options.headers['X-Central-Agent-Token'],token);
  assert.equal(request.options.credentials,'omit');
});

test('quiet agent check preserves actionable pairing diagnostic, not a global cloud failure',async()=>{
  const store=fakeStore(),client=createAgentClient(store,{fetcher:async()=>({status:401,ok:false})});
  await assert.rejects(client.connect({quiet:true}));assert.equal(store.agent().status,'disconnected');assert.equal(store.agent().connection_error.code,'agent-unauthorized');assert.match(store.agent().connection_error.message,/HTTPS/);
});
test('HTTPS pairing is an explicit local action to fixed official origin; token never enters state',()=>{
  const beforeLocation=globalThis.location,beforeWindow=globalThis.window,store=fakeStore();let opened;
  try{
    globalThis.location=new URL('http://127.0.0.1:8765/Central-de-Controle-/');globalThis.window={open:(...args)=>opened=args};
    const client=createAgentClient(store,{agentToken:'fixture-secret'});assert(client.canOpenOfficial());client.openOfficial();
    const target=new URL(opened[0]);assert.equal(target.origin,'https://central-cora-v2.vercel.app');assert.equal(target.search,'');assert.match(target.hash,/ames_agent_token=/);assert.equal(opened[2],'noopener,noreferrer');assert(!JSON.stringify(store.agent()).includes('fixture-secret'));
    globalThis.location=new URL('https://evil.example/');assert(!client.canOpenOfficial());assert.throws(()=>client.openOfficial());
  }finally{if(beforeLocation===undefined)delete globalThis.location;else globalThis.location=beforeLocation;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});
