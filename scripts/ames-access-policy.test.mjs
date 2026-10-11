import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACCESS_LEVELS,ACCESS_POLICY_SCHEMA,admissionState,capabilities,newV2Profile} from '../core/access-policy.mjs';

const rules=fs.readFileSync('firestore.rules','utf8');

test('new v2 profiles always start pending and viewer',()=>{
  const profile=newV2Profile({uid:'U1',email:'USER@EXAMPLE.TEST',name:' User '});
  assert.deepEqual(profile,{uid:'U1',email:'user@example.test',name:'User',role:'user',disabled:false,admission_version:2,access_level:'viewer',approval_state:'pending'});
  assert.equal(admissionState(profile,{emailVerified:true}),'pending_approval');
  assert.equal(capabilities(profile,{emailVerified:true}).active,false);
});

test('v2 admission requires approval plus verified email',()=>{
  const base={role:'user',disabled:false,admission_version:2,access_level:'viewer',approval_state:'approved'};
  assert.equal(admissionState(base,{emailVerified:false}),'email_unverified');
  assert.equal(admissionState(base,{emailVerified:true}),'active');
  assert.equal(admissionState({...base,approval_state:'denied'},{emailVerified:true}),'denied');
  assert.equal(admissionState({...base,disabled:true},{emailVerified:true}),'disabled');
});

test('capability matrix is read-only viewer, operational operator and technical engineer+',()=>{
  const make=level=>({role:level==='admin'?'admin':'user',disabled:false,admission_version:2,access_level:level,approval_state:'approved'});
  const viewer=capabilities(make('viewer'),{emailVerified:true});
  assert.equal(viewer.schema,ACCESS_POLICY_SCHEMA);assert.equal(viewer.read_shared,true);assert.equal(viewer.write_operational,false);assert.equal(viewer.write_technical,false);assert.equal(viewer.publish_mes,false);assert.equal(viewer.administer,false);
  const operator=capabilities(make('operator'),{emailVerified:true});
  assert.equal(operator.write_operational,true);assert.equal(operator.publish_mes,true);assert.equal(operator.write_technical,false);assert.equal(operator.administer,false);
  for(const level of ['engineer','supervisor']){
    const value=capabilities(make(level),{emailVerified:true});assert.equal(value.write_operational,true);assert.equal(value.write_technical,true);assert.equal(value.administer,false);
  }
  const admin=capabilities(make('admin'),{emailVerified:true});assert.equal(admin.write_technical,true);assert.equal(admin.administer,true);
});

test('legacy profiles remain compatible until account-by-account migration',()=>{
  const user=capabilities({role:'user',disabled:false},{emailVerified:false});
  assert.equal(user.generation,'legacy');assert.equal(user.active,true);assert.equal(user.write_operational,true);assert.equal(user.write_technical,true);assert.equal(user.administer,false);
  const admin=capabilities({role:'admin',disabled:false},{emailVerified:false});
  assert.equal(admin.administer,true);
});

test('JS access contract remains visibly aligned with Firestore Rules vocabulary',()=>{
  assert.deepEqual([...ACCESS_LEVELS],['viewer','operator','engineer','supervisor','admin']);
  for(const level of ACCESS_LEVELS)assert.match(rules,new RegExp(`['\"]${level}['\"]`),`Rules missing ${level}`);
  assert.match(rules,/admission_version == 2/);
  assert.match(rules,/approval_state == 'approved'/);
  assert.match(rules,/email_verified == true/);
  assert.match(rules,/canOperationalWrite/);
  assert.match(rules,/canEngineerWrite/);
});
