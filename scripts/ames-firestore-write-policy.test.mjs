import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFirestoreWriteAllowed,requiredCapabilityForWrite,topCollectionFromPath} from '../core/firestore-write-policy.mjs';

const caps=level=>({
  active:true,
  read_shared:true,
  write_operational:['operator','engineer','supervisor','admin','legacy'].includes(level),
  write_technical:['engineer','supervisor','admin','legacy'].includes(level),
  administer:['admin','legacy_admin'].includes(level),
  publish_mes:['operator','engineer','supervisor','admin','legacy'].includes(level)
});

test('path resolve coleção raiz sem aceitar referência vazia',()=>{
  assert.equal(topCollectionFromPath('products/abc'),'products');
  assert.equal(topCollectionFromPath('/routineExecutions/x/child/y'),'routineExecutions');
  assert.equal(topCollectionFromPath(''),'');
});

test('matriz cliente espelha operacional técnico e admin das Rules',()=>{
  for(const c of ['reports','operationalFailures','activities','flows','aiConversations','amesUsers','amesTeamLines','amesLineLeases']){
    assert.equal(requiredCapabilityForWrite({path:`${c}/x`,operation:'update',actorUid:'u'}),'write_operational',c);
  }
  for(const c of ['products','failureAnalyses','aiKnowledge']){
    assert.equal(requiredCapabilityForWrite({path:`${c}/x`,operation:'update',actorUid:'u'}),'write_technical',c);
  }
  for(const c of ['admissionAudit','workShifts','operationalScopes','workAllocations','routineTemplates']){
    assert.equal(requiredCapabilityForWrite({path:`${c}/x`,operation:'update',actorUid:'u'}),'administer',c);
  }
  assert.equal(requiredCapabilityForWrite({path:'routineExecutions/x',operation:'update',actorUid:'u'}),'write_operational');
  assert.equal(requiredCapabilityForWrite({path:'routineExecutions/x',operation:'delete',actorUid:'u'}),'administer');
});

test('viewer é read-only; operator não escreve técnico/admin; engineer escreve técnico+operacional',()=>{
  assert.throws(()=>assertFirestoreWriteAllowed({path:'reports/x',operation:'update',actorUid:'v',capabilities:caps('viewer')}),/write_operational/);
  assert.doesNotThrow(()=>assertFirestoreWriteAllowed({path:'reports/x',operation:'update',actorUid:'o',capabilities:caps('operator')}));
  assert.throws(()=>assertFirestoreWriteAllowed({path:'products/x',operation:'update',actorUid:'o',capabilities:caps('operator')}),/write_technical/);
  assert.doesNotThrow(()=>assertFirestoreWriteAllowed({path:'products/x',operation:'update',actorUid:'e',capabilities:caps('engineer')}));
  assert.throws(()=>assertFirestoreWriteAllowed({path:'workShifts/x',operation:'update',actorUid:'e',capabilities:caps('engineer')}),/administer/);
  assert.doesNotThrow(()=>assertFirestoreWriteAllowed({path:'workShifts/x',operation:'update',actorUid:'a',capabilities:caps('admin')}));
});

test('próprio perfil pode nascer antes de currentAccount; outro usuário exige admin',()=>{
  assert.equal(requiredCapabilityForWrite({path:'users/u1',operation:'set',actorUid:'u1'}),'self_profile');
  assert.doesNotThrow(()=>assertFirestoreWriteAllowed({path:'users/u1',operation:'set',actorUid:'u1',capabilities:null}));
  assert.throws(()=>assertFirestoreWriteAllowed({path:'users/u2',operation:'update',actorUid:'u1',capabilities:caps('operator')}),/administer/);
  assert.doesNotThrow(()=>assertFirestoreWriteAllowed({path:'users/u2',operation:'update',actorUid:'u1',capabilities:caps('admin')}));
  assert.throws(()=>assertFirestoreWriteAllowed({path:'users/u1',operation:'delete',actorUid:'u1',capabilities:caps('operator')}),/administer/);
});

test('coleção nova/desconhecida falha fechada em vez de herdar permissão',()=>{
  assert.throws(()=>requiredCapabilityForWrite({path:'futureCollection/x',operation:'set',actorUid:'u'}),/não registrada/);
  assert.throws(()=>assertFirestoreWriteAllowed({path:'futureCollection/x',operation:'set',actorUid:'u',capabilities:caps('admin')}),/não registrada/);
});
