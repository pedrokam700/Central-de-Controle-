import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoraBrowserTransport,CORA_BROWSER_TRANSPORT_SCHEMA} from '../core/cora-browser-transport.mjs';

const ORIGIN='https://central.example';

function response({ok=true,status=200,data={ok:true}}={}){
  return {ok,status,json:async()=>data};
}

test('same-origin POST stays available and preserves auth through the destination boundary',async()=>{
  const calls=[];
  const client=createCoraBrowserTransport({
    fetcher:async(url,options)=>{calls.push({url,options});return response({data:{saved:true}});},
    getOrigin:()=>ORIGIN,
    getToken:async()=>'LOCAL-TOKEN'
  });
  assert.equal(client.schema,CORA_BROWSER_TRANSPORT_SCHEMA);
  const data=await client.postJSON('/api/ai-memory',{type:'user_correction'});
  assert.equal(data.saved,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,ORIGIN+'/api/ai-memory');
  assert.equal(calls[0].options.headers.Authorization,'Bearer LOCAL-TOKEN');
  assert.deepEqual(JSON.parse(calls[0].options.body),{type:'user_correction'});
});

test('external endpoint is blocked before fetch and browser cannot approve providers',async()=>{
  let called=0;
  const client=createCoraBrowserTransport({fetcher:async()=>{called++;return response();},getOrigin:()=>ORIGIN});
  await assert.rejects(
    ()=>client.fetch('https://provider.example/api/failure-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({line:'TAN10101',product_model:'CPH2859',defect_code:'D001'})}),
    error=>error?.code==='cora/external-origin-not-approved'
  );
  assert.equal(called,0);
});

test('GET metrics keeps no-body semantics through the boundary',async()=>{
  let captured;
  const client=createCoraBrowserTransport({fetcher:async(url,options)=>{captured={url,options};return response();},getOrigin:()=>ORIGIN});
  await client.fetch('/api/ai-metrics',{headers:{}});
  assert.equal(captured.url,ORIGIN+'/api/ai-metrics');
  assert.equal(captured.options.method,'GET');
  assert.equal(Object.hasOwn(captured.options,'body'),false);
});

test('non-JSON request body fails closed before network submission',async()=>{
  let called=0;
  const client=createCoraBrowserTransport({fetcher:async()=>{called++;return response();},getOrigin:()=>ORIGIN});
  await assert.rejects(()=>client.fetch('/api/ai-audit',{method:'POST',body:'not-json'}),/valid JSON/);
  assert.equal(called,0);
});

test('postJSON preserves backend error semantics without leaking provider approval',async()=>{
  const client=createCoraBrowserTransport({fetcher:async()=>response({ok:false,status:400,data:{error:'bad request'}}),getOrigin:()=>ORIGIN,getToken:async()=>null});
  await assert.rejects(()=>client.postJSON('/api/ai-memory',{x:1}),/bad request/);
});
