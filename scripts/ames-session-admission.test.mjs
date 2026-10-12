import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignupProfile,evaluateSessionAdmission,sessionAdmissionStatus,SESSION_ADMISSION_SCHEMA} from '../core/session-admission.mjs';

const user=(overrides={})=>({uid:'uid-1',email:'user@empresa.com',emailVerified:true,displayName:'User',...overrides});
const approved=(level='viewer',overrides={})=>({uid:'uid-1',email:'user@empresa.com',name:'User',role:'user',disabled:false,admission_version:2,access_level:level,approval_state:'approved',...overrides});


test('novo cadastro nasce viewer pendente sem auto-admin por e-mail',()=>{
  const profile=buildSignupProfile({uid:'uid-1',email:'pedro.henrique@grupomultilaser.com.br',name:'Pedro'});
  assert.equal(profile.admission_version,2);
  assert.equal(profile.access_level,'viewer');
  assert.equal(profile.approval_state,'pending');
  assert.equal(profile.role,'user');
  assert.equal(profile.disabled,false);
});

test('perfil v2 pendente não cria sessão ativa',()=>{
  const profile=buildSignupProfile({uid:'uid-1',email:'user@empresa.com',name:'User'});
  assert.throws(()=>evaluateSessionAdmission({firebaseUser:user(),profile}),error=>error.code==='app/admission-pending-approval');
  assert.equal(sessionAdmissionStatus({firebaseUser:user(),profile}).active,false);
});

test('perfil v2 aprovado exige e-mail verificado',()=>{
  const profile=approved('operator');
  assert.throws(()=>evaluateSessionAdmission({firebaseUser:user({emailVerified:false}),profile}),error=>error.code==='app/admission-email-unverified');
  const session=evaluateSessionAdmission({firebaseUser:user(),profile});
  assert.equal(session.schema,SESSION_ADMISSION_SCHEMA);
  assert.equal(session.admission_state,'active');
  assert.equal(session.access_level,'operator');
  assert.equal(session.capabilities.write_operational,true);
  assert.equal(session.capabilities.write_technical,false);
});

test('viewer é read-only e engineer recebe capacidade técnica',()=>{
  const viewer=evaluateSessionAdmission({firebaseUser:user(),profile:approved('viewer')});
  assert.equal(viewer.capabilities.read_shared,true);
  assert.equal(viewer.capabilities.write_operational,false);
  assert.equal(viewer.capabilities.write_technical,false);
  const engineer=evaluateSessionAdmission({firebaseUser:user(),profile:approved('engineer')});
  assert.equal(engineer.capabilities.write_operational,true);
  assert.equal(engineer.capabilities.write_technical,true);
  assert.equal(engineer.capabilities.administer,false);
});

test('denied e disabled falham fechados',()=>{
  assert.throws(()=>evaluateSessionAdmission({firebaseUser:user(),profile:approved('viewer',{approval_state:'denied'})}),error=>error.code==='app/admission-denied');
  assert.throws(()=>evaluateSessionAdmission({firebaseUser:user(),profile:approved('viewer',{disabled:true})}),error=>error.code==='app/admission-disabled');
});

test('perfil legado ativo continua compatível durante migração',()=>{
  const legacy={uid:'uid-1',email:'legacy@empresa.com',name:'Legacy',role:'user',disabled:false};
  const session=evaluateSessionAdmission({firebaseUser:user({email:'legacy@empresa.com',emailVerified:false}),profile:legacy});
  assert.equal(session.generation,'legacy');
  assert.equal(session.admission_state,'legacy_active');
  assert.equal(session.access_level,'legacy_user');
  assert.equal(session.capabilities.write_operational,true);
});

test('perfil v2 inválido não é promovido implicitamente',()=>{
  const profile=approved('owner');
  assert.throws(()=>evaluateSessionAdmission({firebaseUser:user(),profile}),error=>error.code==='app/admission-invalid-profile');
});
