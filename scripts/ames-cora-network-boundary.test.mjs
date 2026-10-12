import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCoraNetworkTarget,assertCoraNetworkRequest,prepareCoraNetworkRequest,CORA_NETWORK_BOUNDARY_SCHEMA} from '../core/cora-network-boundary.mjs';

const ORIGIN='https://central.example';
const PROVIDER='https://ai.example';

test('same-origin reviewed routes stay available without granting provider egress',()=>{
  for(const path of ['/api/ai-memory','/api/failure-intake','/api/generate-image','/api/families/rename']){
    const verdict=assertCoraNetworkRequest({url:path,origin:ORIGIN,method:'POST',payload:{text:'local app backend payload'}});
    assert.equal(verdict.schema,CORA_NETWORK_BOUNDARY_SCHEMA);
    assert.equal(verdict.boundary,'same_origin_application',path);
    assert.equal(verdict.permitted,true);
    assert.equal(verdict.providerEgressPermitted,false);
  }
});

test('unknown same-origin routes and wrong methods still fail closed',()=>{
  assert.throws(()=>assertCoraNetworkRequest({url:'/api/new-unreviewed',origin:ORIGIN,method:'POST',payload:{}}),e=>e.code==='cora/network-route-not-allowlisted');
  assert.throws(()=>assertCoraNetworkRequest({url:'/api/ai-metrics',origin:ORIGIN,method:'POST'}),e=>e.code==='cora/network-method-not-allowlisted');
});

test('local-only routes cannot be redirected to an external host even when that host is approved',()=>{
  for(const path of ['/api/ai-memory','/api/chat-cognitive','/api/generate-image','/api/transcribe-audio']){
    assert.throws(
      ()=>assertCoraNetworkRequest({url:PROVIDER+path,origin:ORIGIN,method:'POST',payload:{line:'TAN10101'},approvedExternalOrigins:[PROVIDER]}),
      e=>e.code==='cora/route-local-only',
      path
    );
  }
});

test('external destination must be explicitly approved before payload policy is evaluated',()=>{
  const payload={line:'TAN10101',product_model:'CPH2859',defect_code:'D001',defect_desc:'LCD black stain',station:'P-04',quantity:3};
  assert.throws(
    ()=>assertCoraNetworkRequest({url:PROVIDER+'/api/failure-analysis',origin:ORIGIN,method:'POST',payload,sanitized:true}),
    e=>e.code==='cora/external-origin-not-approved'
  );
  const ok=assertCoraNetworkRequest({url:PROVIDER+'/api/failure-analysis',origin:ORIGIN,method:'POST',payload,sanitized:true,approvedExternalOrigins:[PROVIDER]});
  assert.equal(ok.boundary,'approved_external_provider');
  assert.equal(ok.providerEgressPermitted,true);
  assert.equal(ok.externalPolicy.payloadPolicy.permitted,true);
});

test('approved external failure-analysis still rejects free text identifiers and secrets',()=>{
  for(const payload of [
    {context:'texto livre da fábrica'},
    {line:'TAN10101',pcba_sn:'0025270000000000'},
    {line:'TAN10101',conversation:[{role:'user',text:'x'}]},
    {line:'TAN10101',authorization:'Bearer SECRET'}
  ]){
    assert.throws(
      ()=>assertCoraNetworkRequest({url:PROVIDER+'/api/failure-analysis/stream',origin:ORIGIN,method:'POST',payload,sanitized:true,approvedExternalOrigins:[PROVIDER]}),
      e=>e.code==='cora/egress-policy-blocked'
    );
  }
});

test('application auth headers are allowed same-origin but blocked for approved external providers',()=>{
  const local=prepareCoraNetworkRequest({url:'/api/ai-memory',origin:ORIGIN,method:'POST',payload:{x:1},headers:{Authorization:'Bearer LOCAL','Content-Type':'application/json'}});
  assert.equal(local.headers.Authorization,'Bearer LOCAL');
  const technical={line:'TAN10101',product_model:'CPH2859',defect_code:'D001'};
  assert.throws(
    ()=>prepareCoraNetworkRequest({url:PROVIDER+'/api/failure-analysis',origin:ORIGIN,method:'POST',payload:technical,sanitized:true,approvedExternalOrigins:[PROVIDER],headers:{Authorization:'Bearer LOCAL','Content-Type':'application/json'}}),
    e=>e.code==='cora/external-auth-header-blocked'
  );
});

test('GET metrics may use approved external provider only without client payload',()=>{
  const ok=assertCoraNetworkRequest({url:PROVIDER+'/api/ai-metrics',origin:ORIGIN,method:'GET',approvedExternalOrigins:[PROVIDER]});
  assert.equal(ok.boundary,'approved_external_provider');
  assert.equal(ok.externalPolicy.route.mode,'external_no_payload');
  assert.throws(()=>assertCoraNetworkRequest({url:PROVIDER+'/api/ai-metrics',origin:ORIGIN,method:'GET',payload:{line:'TAN10101'},approvedExternalOrigins:[PROVIDER]}),e=>e.code==='cora/unexpected-external-payload');
});

test('origin checks are exact and cannot be bypassed by sibling or lookalike hosts',()=>{
  const v=classifyCoraNetworkTarget('https://central.example.attacker.test/api/ai-memory',{origin:ORIGIN,method:'POST'});
  assert.equal(v.sameOrigin,false);
  assert.equal(v.boundary,'external_unapproved');
  assert.throws(()=>assertCoraNetworkRequest({url:v.targetUrl,origin:ORIGIN,method:'POST',payload:{},approvedExternalOrigins:[ORIGIN]}),e=>e.code==='cora/external-origin-not-approved');
});

test('boundary errors never echo payload content',()=>{
  assert.throws(
    ()=>assertCoraNetworkRequest({url:'https://evil.example/api/ai-memory',origin:ORIGIN,method:'POST',payload:{text:'SUPER-SECRET-FACTORY-DATA'}}),
    e=>e.code==='cora/external-origin-not-approved'&&!String(e.message).includes('SUPER-SECRET-FACTORY-DATA')
  );
});
