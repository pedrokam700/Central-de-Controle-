import {admissionState,capabilities,newV2Profile,normalizeAccessLevel,profileGeneration} from './access-policy.mjs';

export const SESSION_ADMISSION_SCHEMA='central-session-admission-v1';

const ERROR_MESSAGES=Object.freeze({
  disabled:'Esta conta está desativada. Procure um administrador.',
  denied:'O acesso desta conta foi negado por um administrador.',
  pending_approval:'Sua conta foi criada e está aguardando aprovação de um administrador.',
  email_unverified:'Confirme seu e-mail corporativo antes de acessar a Central.',
  invalid_profile:'O perfil de acesso está inválido. Procure um administrador.'
});

export function admissionError(state){
  const message=ERROR_MESSAGES[state];
  if(!message)return null;
  const error=new Error(message);
  error.code=`app/admission-${state.replaceAll('_','-')}`;
  error.admission_state=state;
  return error;
}

export function buildSignupProfile({uid,email,name=''}){
  return newV2Profile({uid,email,name});
}

export function evaluateSessionAdmission({firebaseUser,profile}={}){
  if(!firebaseUser?.uid)throw new TypeError('Firebase user obrigatório para admissão');
  if(!profile||typeof profile!=='object')throw new TypeError('Perfil Firestore obrigatório para admissão');
  const state=admissionState(profile,{emailVerified:firebaseUser.emailVerified===true});
  const error=admissionError(state);
  if(error)throw error;
  const caps=capabilities(profile,{emailVerified:firebaseUser.emailVerified===true});
  if(!caps.active)throw new Error(`Estado de admissão não ativo: ${state}`);
  return Object.freeze({
    schema:SESSION_ADMISSION_SCHEMA,
    uid:String(firebaseUser.uid),
    name:String(profile.name||firebaseUser.displayName||'').trim(),
    email:String(profile.email||firebaseUser.email||'').trim().toLowerCase(),
    role:profile.role==='admin'?'admin':'user',
    generation:profileGeneration(profile),
    admission_state:state,
    access_level:normalizeAccessLevel(profile),
    capabilities:caps
  });
}

export function sessionAdmissionStatus({firebaseUser,profile}={}){
  if(!firebaseUser?.uid||!profile||typeof profile!=='object')return Object.freeze({active:false,state:'missing_profile'});
  const state=admissionState(profile,{emailVerified:firebaseUser.emailVerified===true});
  const caps=capabilities(profile,{emailVerified:firebaseUser.emailVerified===true});
  return Object.freeze({active:caps.active,state,generation:caps.generation,access_level:caps.access_level,capabilities:caps});
}
