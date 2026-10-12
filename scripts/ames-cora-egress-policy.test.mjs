import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCoraField,evaluateCoraExternalPayload,assertCoraExternalPayload,CORA_EGRESS_POLICY_SCHEMA} from '../core/cora-egress-policy.mjs';


test('credenciais, sessão e payload MES bruto nunca podem sair para IA externa',()=>{
  for(const key of ['password','ames_cookie','Authorization','local-agent-token','session','raw_json','raw_mes']){
    assert.equal(classifyCoraField(key).classification,'never_external',key);
  }
});

test('identificadores industriais/pessoais ficam local-only por padrão',()=>{
  for(const key of ['pcba_sn','material_sn','item_sn','defect_oper','email','evidence','images','comments','documents','conversation_history']){
    assert.equal(classifyCoraField(key).classification,'local_only',key);
  }
});

test('somente contexto técnico explicitamente allowlisted pode sair sanitizado',()=>{
  for(const key of ['line','product_model','defect_code','defect_desc','station','process','fpy','check_fpy','quantity']){
    assert.equal(classifyCoraField(key).classification,'sanitized_external',key);
  }
  assert.equal(classifyCoraField('new_unreviewed_field').classification,'local_only');
});

test('payload allowlisted ainda exige prova explícita de sanitização',()=>{
  const payload={line:'TAN10101',product_model:'CPH2859',defect_code:'D001',fpy:98.7};
  const raw=evaluateCoraExternalPayload(payload,{sanitized:false});
  assert.equal(raw.schema,CORA_EGRESS_POLICY_SCHEMA);
  assert.equal(raw.permitted,false);
  assert.ok(raw.violations.every(item=>item.classification==='requires_sanitization'));
  const safe=evaluateCoraExternalPayload(payload,{sanitized:true});
  assert.equal(safe.permitted,true);
  assert.equal(safe.violations.length,0);
});

test('um único SN ou segredo bloqueia todo payload mesmo se o restante for técnico',()=>{
  const withSn=evaluateCoraExternalPayload({line:'TAN10101',defect_code:'D001',pcba_sn:'002527...'},{sanitized:true});
  assert.equal(withSn.permitted,false);
  assert.ok(withSn.violations.some(item=>item.path==='pcba_sn'&&item.classification==='local_only'));
  const withSecret=evaluateCoraExternalPayload({line:'TAN10101',authorization:'Bearer secret'},{sanitized:true});
  assert.equal(withSecret.permitted,false);
  assert.ok(withSecret.violations.some(item=>item.classification==='never_external'));
});

test('assert falha fechado e não expõe conteúdo bloqueado na mensagem',()=>{
  assert.throws(
    ()=>assertCoraExternalPayload({line:'TAN10101',password:'SUPER-SECRET'},{sanitized:true}),
    error=>error.code==='cora/egress-policy-blocked'&&!String(error.message).includes('SUPER-SECRET')
  );
});
