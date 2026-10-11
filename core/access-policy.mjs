export const ACCESS_POLICY_SCHEMA='central-access-policy-v2';
export const ACCESS_LEVELS=Object.freeze(['viewer','operator','engineer','supervisor','admin']);

const SETS=Object.freeze({
  operational:new Set(['operator','engineer','supervisor','admin']),
  engineer:new Set(['engineer','supervisor','admin']),
  admin:new Set(['admin'])
});

export function profileGeneration(profile){
  return Number(profile?.admission_version)===2?'v2':'legacy';
}

export function normalizeAccessLevel(profile){
  if(profileGeneration(profile)==='legacy')return profile?.role==='admin'?'admin':'legacy_user';
  return ACCESS_LEVELS.includes(profile?.access_level)?profile.access_level:'invalid';
}

export function admissionState(profile,{emailVerified=false}={}){
  if(profile?.disabled===true)return 'disabled';
  if(profileGeneration(profile)==='legacy')return 'legacy_active';
  if(profile?.approval_state==='denied')return 'denied';
  if(profile?.approval_state!=='approved')return 'pending_approval';
  if(emailVerified!==true)return 'email_unverified';
  if(normalizeAccessLevel(profile)==='invalid')return 'invalid_profile';
  return 'active';
}

export function capabilities(profile,{emailVerified=false}={}){
  const generation=profileGeneration(profile),state=admissionState(profile,{emailVerified}),level=normalizeAccessLevel(profile);
  const active=state==='legacy_active'||state==='active';
  const legacy=active&&generation==='legacy';
  const has=set=>active&&(legacy||set.has(level));
  return Object.freeze({
    schema:ACCESS_POLICY_SCHEMA,
    generation,
    admission_state:state,
    access_level:level,
    active,
    read_shared:active,
    write_operational:has(SETS.operational),
    write_technical:has(SETS.engineer),
    administer:active&&(legacy?profile?.role==='admin':SETS.admin.has(level)),
    publish_mes:has(SETS.operational)
  });
}

export function newV2Profile({uid,email,name=''}){
  const cleanUid=String(uid||'').trim(),cleanEmail=String(email||'').trim().toLowerCase();
  if(!cleanUid||!cleanEmail)throw new TypeError('uid/email required for v2 profile');
  return Object.freeze({
    uid:cleanUid,
    email:cleanEmail,
    name:String(name||'').trim(),
    role:'user',
    disabled:false,
    admission_version:2,
    access_level:'viewer',
    approval_state:'pending'
  });
}
