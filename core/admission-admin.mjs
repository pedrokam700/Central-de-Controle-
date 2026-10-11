import {ACCESS_LEVELS,capabilities,profileGeneration} from './access-policy.mjs';

export const ADMISSION_AUDIT_SCHEMA='central-admission-audit-v1';

const clean=value=>String(value??'').trim();

function requireAdmin(actorProfile,{emailVerified=true}={}){
  const actor=capabilities(actorProfile,{emailVerified});
  if(!actor.administer)throw new Error('Apenas administrador ativo pode alterar admissão/RBAC');
  return actor;
}

function requireTarget(targetProfile){
  if(!targetProfile||typeof targetProfile!=='object')throw new TypeError('Perfil alvo obrigatório');
  const uid=clean(targetProfile.uid||targetProfile.docId);
  if(!uid)throw new TypeError('UID alvo obrigatório');
  return uid;
}

function audit({action,targetUid,actorUid,before,after,reason='',at=Date.now()}){
  return Object.freeze({
    schema:ADMISSION_AUDIT_SCHEMA,
    action,
    target_uid:targetUid,
    actor_uid:clean(actorUid),
    at:Number(at),
    reason:clean(reason).slice(0,500),
    before:Object.freeze({...before}),
    after:Object.freeze({...after})
  });
}

export function approveV2Profile({actorProfile,actorUid,targetProfile,accessLevel,reason='',at=Date.now(),actorEmailVerified=true}={}){
  requireAdmin(actorProfile,{emailVerified:actorEmailVerified});
  const targetUid=requireTarget(targetProfile);
  const actor=clean(actorUid);
  if(!actor)throw new TypeError('UID do administrador obrigatório');
  if(actor===targetUid)throw new Error('Autoaprovação/autoescalonamento não permitido');
  if(profileGeneration(targetProfile)!=='v2')throw new Error('Perfil legado deve ser migrado explicitamente antes da aprovação V2');
  if(!ACCESS_LEVELS.includes(accessLevel))throw new Error('Nível de acesso inválido');
  const before={approval_state:targetProfile.approval_state,access_level:targetProfile.access_level,disabled:Boolean(targetProfile.disabled)};
  const patch=Object.freeze({approval_state:'approved',access_level:accessLevel,disabled:false,approved_by:actor,approved_at:Number(at),updatedAt:Number(at)});
  return Object.freeze({patch,audit:audit({action:'approve',targetUid,actorUid:actor,before,after:{...before,...patch},reason,at})});
}

export function denyV2Profile({actorProfile,actorUid,targetProfile,reason='',at=Date.now(),actorEmailVerified=true}={}){
  requireAdmin(actorProfile,{emailVerified:actorEmailVerified});
  const targetUid=requireTarget(targetProfile),actor=clean(actorUid);
  if(!actor)throw new TypeError('UID do administrador obrigatório');
  if(actor===targetUid)throw new Error('Administrador não pode negar a própria conta por este fluxo');
  if(profileGeneration(targetProfile)!=='v2')throw new Error('Perfil legado deve ser migrado explicitamente antes da negação V2');
  const before={approval_state:targetProfile.approval_state,access_level:targetProfile.access_level,disabled:Boolean(targetProfile.disabled)};
  const patch=Object.freeze({approval_state:'denied',disabled:true,denied_by:actor,denied_at:Number(at),updatedAt:Number(at)});
  return Object.freeze({patch,audit:audit({action:'deny',targetUid,actorUid:actor,before,after:{...before,...patch},reason,at})});
}

export function changeV2AccessLevel({actorProfile,actorUid,targetProfile,accessLevel,reason='',at=Date.now(),actorEmailVerified=true}={}){
  requireAdmin(actorProfile,{emailVerified:actorEmailVerified});
  const targetUid=requireTarget(targetProfile),actor=clean(actorUid);
  if(!actor)throw new TypeError('UID do administrador obrigatório');
  if(actor===targetUid)throw new Error('Autoescalonamento não permitido');
  if(profileGeneration(targetProfile)!=='v2'||targetProfile.approval_state!=='approved')throw new Error('Somente perfil V2 aprovado pode trocar de nível');
  if(!ACCESS_LEVELS.includes(accessLevel))throw new Error('Nível de acesso inválido');
  const before={approval_state:targetProfile.approval_state,access_level:targetProfile.access_level,disabled:Boolean(targetProfile.disabled)};
  const patch=Object.freeze({access_level:accessLevel,updatedAt:Number(at)});
  return Object.freeze({patch,audit:audit({action:'change_access_level',targetUid,actorUid:actor,before,after:{...before,...patch},reason,at})});
}
