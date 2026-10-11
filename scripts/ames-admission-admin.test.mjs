import test from 'node:test';
import assert from 'node:assert/strict';
import {approveV2Profile,denyV2Profile,changeV2AccessLevel,ADMISSION_AUDIT_SCHEMA} from '../core/admission-admin.mjs';

const admin={uid:'admin-1',role:'user',disabled:false,admission_version:2,access_level:'admin',approval_state:'approved'};
const viewer={uid:'user-1',role:'user',disabled:false,admission_version:2,access_level:'viewer',approval_state:'pending'};


test('admin pode aprovar perfil v2 com nível explícito e trilha auditável',()=>{
  const result=approveV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:viewer,accessLevel:'operator',reason:'Operação de linha',at:100});
  assert.deepEqual(result.patch,{approval_state:'approved',access_level:'operator',disabled:false,approved_by:'admin-1',approved_at:100,updatedAt:100});
  assert.equal(result.audit.schema,ADMISSION_AUDIT_SCHEMA);
  assert.equal(result.audit.action,'approve');
  assert.equal(result.audit.target_uid,'user-1');
  assert.equal(result.audit.actor_uid,'admin-1');
  assert.equal(result.audit.after.access_level,'operator');
});

test('aprovação exige administrador ativo e e-mail verificado',()=>{
  const operator={...admin,access_level:'operator'};
  assert.throws(()=>approveV2Profile({actorProfile:operator,actorUid:'op',targetProfile:viewer,accessLevel:'viewer'}),/Apenas administrador/);
  assert.throws(()=>approveV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:viewer,accessLevel:'viewer',actorEmailVerified:false}),/Apenas administrador/);
});

test('autoaprovação e autoescalonamento são recusados',()=>{
  const self={...viewer,uid:'admin-1'};
  assert.throws(()=>approveV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:self,accessLevel:'admin'}),/Autoaprovação/);
  const approved={...self,approval_state:'approved'};
  assert.throws(()=>changeV2AccessLevel({actorProfile:admin,actorUid:'admin-1',targetProfile:approved,accessLevel:'admin'}),/Autoescalonamento/);
});

test('negação desativa perfil v2 e registra razão sem apagar identidade',()=>{
  const result=denyV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:viewer,reason:'Sem autorização',at:200});
  assert.equal(result.patch.approval_state,'denied');
  assert.equal(result.patch.disabled,true);
  assert.equal(result.patch.denied_by,'admin-1');
  assert.equal(result.audit.reason,'Sem autorização');
  assert.equal(result.audit.after.access_level,'viewer');
});

test('mudança de nível exige perfil v2 previamente aprovado',()=>{
  const approved={...viewer,approval_state:'approved',access_level:'operator'};
  const result=changeV2AccessLevel({actorProfile:admin,actorUid:'admin-1',targetProfile:approved,accessLevel:'engineer',reason:'Responsável técnico',at:300});
  assert.deepEqual(result.patch,{access_level:'engineer',updatedAt:300});
  assert.equal(result.audit.action,'change_access_level');
  assert.equal(result.audit.before.access_level,'operator');
  assert.equal(result.audit.after.access_level,'engineer');
  assert.throws(()=>changeV2AccessLevel({actorProfile:admin,actorUid:'admin-1',targetProfile:viewer,accessLevel:'engineer'}),/Somente perfil V2 aprovado/);
});

test('perfil legado nunca é migrado implicitamente por comando administrativo',()=>{
  const legacy={uid:'legacy-1',role:'user',disabled:false};
  assert.throws(()=>approveV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:legacy,accessLevel:'operator'}),/migrado explicitamente/);
  assert.throws(()=>denyV2Profile({actorProfile:admin,actorUid:'admin-1',targetProfile:legacy}),/migrado explicitamente/);
});
