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
