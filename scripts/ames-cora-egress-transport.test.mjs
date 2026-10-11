import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyCoraExternalRoute,assertCoraExternalRequest,CORA_EGRESS_TRANSPORT_SCHEMA} from '../core/cora-egress-transport.mjs';

const apiContract=JSON.parse(fs.readFileSync('hardening/cora-api-contract.json','utf8'));

test('toda rota frontend conhecida possui classificação explícita de egress',()=>{
  for(const route of apiContract.routes){
    for(const method of route.methods){
      const verdict=classifyCoraExternalRoute(route.path.replace('/:id','/doc-test'),{method});
      assert.equal(verdict.schema,CORA_EGRESS_TRANSPORT_SCHEMA);
      assert.equal(verdict.known,true,`${method} ${route.path}`);
      assert.notEqual(verdict.mode,'blocked_unknown',`${method} ${route.path}`);
      assert.notEqual(verdict.mode,'blocked_method',`${method} ${route.path}`);
    }
  }
});

test('rota ou método não revisado falha fechado antes da rede',()=>{
  assert.throws(()=>assertCoraExternalRequest({path:'/api/new-unreviewed',method:'POST',payload:{}}),e=>e.code==='cora/route-not-allowlisted');
  assert.throws(()=>assertCoraExternalRequest({path:'/api/ai-metrics',method:'POST'}),e=>e.code==='cora/method-not-allowlisted');
});

test('rotas com conversa mídia ou documento permanecem local-only',()=>{
  for(const path of ['/api/chat-cognitive','/api/failure-intake','/api/generate-image','/api/generate-slides','/api/investigation-artifact','/api/transcribe-audio','/api/ai-memory']){
    const verdict=classifyCoraExternalRoute(path,{method:'POST'});
    assert.equal(verdict.mode,'local_only',path);
    assert.throws(()=>assertCoraExternalRequest({path,method:'POST',payload:{line:'TAN10101'}}),e=>e.code==='cora/route-local-only');
  }
});

test('métricas GET é a única rota externa sem payload cliente',()=>{
  const ok=assertCoraExternalRequest({path:'/api/ai-metrics',method:'GET'});
  assert.equal(ok.permitted,true);
  assert.equal(ok.route.mode,'external_no_payload');
  assert.throws(()=>assertCoraExternalRequest({path:'/api/ai-metrics',method:'GET',payload:{line:'TAN10101'}}),e=>e.code==='cora/unexpected-external-payload');
});

test('failure-analysis só aceita projeção técnica explicitamente sanitizada',()=>{
  const payload={line:'TAN10101',product_model:'CPH2859',defect_code:'D001',defect_desc:'LCD black stain',station:'P-04',quantity:3};
  assert.throws(()=>assertCoraExternalRequest({path:'/api/failure-analysis',method:'POST',payload,sanitized:false}),e=>e.code==='cora/egress-policy-blocked');
  const ok=assertCoraExternalRequest({path:'/api/failure-analysis',method:'POST',payload,sanitized:true});
  assert.equal(ok.permitted,true);
  assert.equal(ok.payloadPolicy.permitted,true);
  assert.equal(ok.route.mode,'structured_external_candidate');
});

test('texto livre, SN, conversa e segredo não podem ser disfarçados como analysis sanitizado',()=>{
  for(const payload of [
    {context:'verifique o caso'},
    {line:'TAN10101',pcba_sn:'0025270000000000'},
    {line:'TAN10101',conversation:[{role:'user',text:'x'}]},
    {line:'TAN10101',authorization:'Bearer SECRET'}
  ]){
    assert.throws(()=>assertCoraExternalRequest({path:'/api/failure-analysis/stream',method:'POST',payload,sanitized:true}),e=>e.code==='cora/egress-policy-blocked');
  }
});

test('erros de rota não ecoam conteúdo do payload bloqueado',()=>{
  assert.throws(
    ()=>assertCoraExternalRequest({path:'/api/failure-intake',method:'POST',payload:{text:'SUPER-SECRET-FACTORY-DATA'}}),
    e=>e.code==='cora/route-local-only'&&!String(e.message).includes('SUPER-SECRET-FACTORY-DATA')
  );
});
