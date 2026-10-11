import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserProfileService,USER_PROFILE_SERVICE_SCHEMA} from '../core/user-profile-service.mjs';

function buildHarness({exists=false,data={},clock=['2026-10-11T12:00:00.000Z','2026-10-11T12:00:01.000Z']}={}){
  const calls=[];
  const times=[...clock];
  const ref={path:'users/u1'};
  const service=createUserProfileService({
    db:'db',
    doc:(db,collection,id)=>{calls.push(['doc',db,collection,id]);return ref;},
    getDoc:async value=>{calls.push(['getDoc',value]);return {exists:()=>exists,data:()=>data};},
    setDoc:async(...args)=>{calls.push(['setDoc',...args]);return 'saved';},
    withTimeout:async(promise,ms,label)=>{calls.push(['timeout',ms,label]);return promise;},
    buildSignupProfile:input=>{calls.push(['buildSignupProfile',input]);return {uid:input.uid,email:input.email,name:input.name,role:'user',access_level:'viewer',approval_state:'pending',admission_version:2};},
    now:()=>times.shift()||'2026-10-11T12:00:02.000Z'
  });
  return {service,calls,ref};
}

test('service has stable schema and existing profile preserves admission data with legacy-compatible defaults',async()=>{
  const h=buildHarness({exists:true,data:{uid:'',name:'',email:'',role:'engineer',disabled:1,access_level:'engineer',approval_state:'approved',admission_version:2}});
  assert.equal(h.service.schema,USER_PROFILE_SERVICE_SCHEMA);
  const profile=await h.service.ensure({uid:'u1',email:'User@Example.COM',displayName:'Display'},{name:'Legacy'});
  assert.equal(profile.docId,'u1');
  assert.equal(profile.uid,'u1');
  assert.equal(profile.name,'Legacy');
  assert.equal(profile.email,'user@example.com');
  assert.equal(profile.role,'user');
  assert.equal(profile.disabled,true);
  assert.equal(profile.access_level,'engineer');
  assert.equal(profile.approval_state,'approved');
  assert.equal(profile.admission_version,2);
  assert.equal(h.calls.filter(x=>x[0]==='setDoc').length,0);
});

test('existing legacy admin remains legacy admin authority during migration compatibility',async()=>{
  const h=buildHarness({exists:true,data:{role:'admin',name:'Admin',email:'admin@example.com'}});
  const profile=await h.service.ensure({uid:'u1',email:'admin@example.com'});
  assert.equal(profile.role,'admin');
});

test('missing profile is created as V2 viewer pending through injected signup contract',async()=>{
  const h=buildHarness({exists:false,clock:['2026-10-11T12:00:00.000Z']});
  const profile=await h.service.ensure({uid:'u1',email:'NEW@EXAMPLE.COM',displayName:'New User'});
  assert.equal(profile.docId,'u1');
  assert.equal(profile.role,'user');
  assert.equal(profile.access_level,'viewer');
  assert.equal(profile.approval_state,'pending');
  assert.equal(profile.admission_version,2);
  assert.equal(profile.createdAt,'2026-10-11T12:00:00.000Z');
  assert.equal(profile.updatedAt,profile.createdAt);
  const build=h.calls.find(x=>x[0]==='buildSignupProfile');
  assert.deepEqual(build[1],{uid:'u1',email:'new@example.com',name:'New User'});
  const write=h.calls.find(x=>x[0]==='setDoc');
  assert.equal(write[1],h.ref);
  assert.equal(write[2].access_level,'viewer');
});

test('legacy name wins over display name when missing profile is created',async()=>{
  const h=buildHarness({exists:false});
  const profile=await h.service.ensure({uid:'u1',email:'new@example.com',displayName:'Display'},{name:'Legacy Name'});
  assert.equal(profile.name,'Legacy Name');
});

test('profile validation and creation keep original 12 second timeout labels',async()=>{
  const existing=buildHarness({exists:true,data:{name:'User',email:'u@example.com'}});
  await existing.service.ensure({uid:'u1',email:'u@example.com'});
  assert.deepEqual(existing.calls.filter(x=>x[0]==='timeout').map(x=>x.slice(1)),[[12000,'Validação do perfil']]);

  const missing=buildHarness({exists:false});
  await missing.service.ensure({uid:'u1',email:'u@example.com'});
  assert.deepEqual(missing.calls.filter(x=>x[0]==='timeout').map(x=>x.slice(1)),[[12000,'Validação do perfil'],[12000,'Criação do perfil']]);
});

test('creation write is delegated to injected setDoc so app capability guard remains authoritative',async()=>{
  let writes=0;
  const service=createUserProfileService({
    db:'db',doc:()=>({path:'users/u1'}),getDoc:async()=>({exists:()=>false,data:()=>({})}),
    setDoc:async()=>{writes++;},withTimeout:async promise=>promise,
    buildSignupProfile:input=>({...input,role:'user',access_level:'viewer',approval_state:'pending',admission_version:2}),now:()=> 'now'
  });
  await service.ensure({uid:'u1',email:'u@example.com'});
  assert.equal(writes,1);
});
