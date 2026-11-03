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
    const target=new URL(opened[0]);assert.equal(target.origin,'https://pedrokam700.github.io');assert.equal(target.pathname,'/Central-de-Controle-/');assert.equal(target.search,'');assert.match(target.hash,/ames_agent_token=/);assert.equal(opened[2],'noopener,noreferrer');assert(!JSON.stringify(store.agent()).includes('fixture-secret'));
    globalThis.location=new URL('https://evil.example/');assert(!client.canOpenOfficial());assert.throws(()=>client.openOfficial());
  }finally{if(beforeLocation===undefined)delete globalThis.location;else globalThis.location=beforeLocation;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('official HTTPS can open explicit local confirmation, but untrusted domains cannot',()=>{
  const beforeLocation=globalThis.location,beforeWindow=globalThis.window;
  let navigated='';
  try{
    globalThis.location=new URL('https://pedrokam700.github.io/Central-de-Controle-/');
    globalThis.window={location:{assign:url=>{navigated=url;}}};
    const client=createAgentClient(fakeStore());
    assert.equal(client.canPairFromOfficial(),true);
    client.openLocalPairing();
    assert.equal(navigated,'http://127.0.0.1:8765/workstation/parear');
    assert.equal(navigated.includes('ames_agent_token'),false);
    // Regression: missing trailing hyphen is NOT the deployed project site.
    globalThis.location=new URL('https://pedrokam700.github.io/Central-de-Controle/');
    assert.equal(client.canPairFromOfficial(),false,'wrong Pages project path cannot start pairing');
    globalThis.location=new URL('https://pedrokam700.github.io/Central-de-Controle-/');
    assert.equal(client.canPairFromOfficial(),true,'exact public Pages base path allows pairing');
    globalThis.location=new URL('https://pedrokam700.github.io/other-repo/');
    assert.equal(client.canPairFromOfficial(),false);
    globalThis.location=new URL('https://central-cora-v2.vercel.app/Central-de-Controle-/');
    assert.equal(client.canPairFromOfficial(),false);
    globalThis.location=new URL('https://evil.example/');
    assert.equal(client.canPairFromOfficial(),false);
    assert.throws(()=>client.openLocalPairing(),/oficial/);
    globalThis.location=new URL('http://127.0.0.1:8765/');
    assert.equal(client.canPairFromOfficial(),false);
    assert.throws(()=>client.openLocalPairing(),/oficial/);
  }finally{
    if(beforeLocation===undefined)delete globalThis.location;else globalThis.location=beforeLocation;
    if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;
  }
});

test('public local agent identification sends no token and never probes MES or leaks identity',async()=>{
 const requests=[],store=fakeStore();
 const fetcher=async(uri,opt)=>{
   requests.push({uri,opt});return {ok:true,json:async()=>({
     ok:true,ready:true,agent_version:'0.5.23',agent_build:'CANONICAL-R11-BATCH',pid:123,workstation_pairing_flow:3,workstation_pairing_revision:4,
     workstation_token:'MUST_NOT_LEAK',source_id:'MUST_NOT_LEAK'
   })};
 };
 const client=createAgentClient(store,{fetcher});
 const status=await client.detectInstalled();
 assert.deepEqual(status,{state:'detected'});
 assert.deepEqual(store.agent().workstation_probe,{state:'detected'});
 assert.equal(requests.length,1);
 assert.equal(requests[0].uri,'http://127.0.0.1:8765/api/v1/ready');
 assert.equal(requests[0].opt.method,'GET');
 assert.equal(requests[0].opt.credentials,'omit');
 assert.equal(requests[0].opt.headers,undefined);
 assert(!JSON.stringify(store.agent()).includes('MUST_NOT_LEAK'));
});
test('unknown /ready or browser loopback denial is not falsely classified as missing installation',async()=>{
 for(const fetcher of [
   async()=>({ok:true,json:async()=>({ready:true,pid:456})}),
   async()=>{throw Error('Private Network Access blocked');}
 ]){
   const client=createAgentClient(fakeStore(),{fetcher});
   assert.deepEqual(await client.detectInstalled(),{state:'unknown'});
 }
});

test('old flow-2 Vercel agent must be identified as outdated, not incorrectly promised a working HTTPS pair',async()=>{
 // Flow 2 still targets old Vercel origin; GitHub Pages requires flow 3.
 const store=fakeStore();
 const client=createAgentClient(store,{fetcher:async()=>({ok:true,json:async()=>({
  ok:true,ready:true,agent_version:'0.5.23',agent_build:'CANONICAL-R11-BATCH',pid:345
 })})});
 assert.deepEqual(await client.detectInstalled(),{state:'outdated',reason:'pairing_contract'});
 assert.deepEqual(store.agent().workstation_probe,{state:'outdated',reason:'pairing_contract'});
});

test('copied local 127 and localhost tabs probe their own origin; HTTPS stays on fixed loopback',async()=>{
  const original=globalThis.location;
  try{
    for(const [location,expected] of [
      ['http://127.0.0.1:8765/Central-de-Controle-/','http://127.0.0.1:8765/api/v1/ready'],
      ['http://localhost:8765/Central-de-Controle-/','http://localhost:8765/api/v1/ready'],
      ['https://pedrokam700.github.io/Central-de-Controle-/','http://127.0.0.1:8765/api/v1/ready']
    ]){
      globalThis.location=new URL(location);
      const requests=[];
      const client=createAgentClient(fakeStore(),{fetcher:async (url,options)=>{
        requests.push({url,options});return {ok:true,json:async()=>({
          ready:true,agent_version:'0.5.23',agent_build:'CANONICAL-R11-BATCH',
          pid:123,workstation_pairing_flow:3,workstation_pairing_revision:4
        })};
      }});
      await client.detectInstalled();
      assert.equal(requests[0].url,expected);
      assert.equal(requests[0].options.headers,undefined);
      assert.equal(client.paired(),false);
    }
  }finally{
    if(original===undefined)delete globalThis.location;
    else globalThis.location=original;
  }
});
