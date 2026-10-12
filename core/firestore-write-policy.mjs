export const FIRESTORE_WRITE_POLICY_SCHEMA='central-firestore-write-policy-v1';

const OPERATIONAL=new Set(['reports','operationalFailures','activities','flows','aiConversations','amesUsers','amesTeamLines','amesLineLeases']);
const TECHNICAL=new Set(['products','failureAnalyses','aiKnowledge']);
const ADMIN=new Set(['admissionAudit','workShifts','operationalScopes','workAllocations','routineTemplates']);
const VALID_OPERATIONS=new Set(['create','set','update','delete']);

export function topCollectionFromPath(path=''){
  const clean=String(path||'').replace(/^\/+|\/+$/g,'');
  return clean.split('/')[0]||'';
}

function targetUserFromPath(path=''){
  const parts=String(path||'').replace(/^\/+|\/+$/g,'').split('/');
  return parts[0]==='users'?(parts[1]||''):'';
}

export function requiredCapabilityForWrite({path,operation='set',actorUid=''}={}){
  if(!VALID_OPERATIONS.has(operation))throw new Error(`Operação Firestore desconhecida: ${operation}`);
  const collection=topCollectionFromPath(path);
  if(!collection)throw new Error('Referência Firestore sem coleção');
  if(collection==='users'){
    const targetUid=targetUserFromPath(path),actor=String(actorUid||'').trim();
    if(operation!=='delete'&&targetUid&&actor&&targetUid===actor)return 'self_profile';
    return 'administer';
  }
  if(collection==='routineExecutions')return operation==='delete'?'administer':'write_operational';
  if(OPERATIONAL.has(collection))return 'write_operational';
  if(TECHNICAL.has(collection))return 'write_technical';
  if(ADMIN.has(collection))return 'administer';
  throw new Error(`Coleção Firestore não registrada na política cliente: ${collection}`);
}

export function assertFirestoreWriteAllowed({path,operation='set',actorUid='',capabilities=null}={}){
  const required=requiredCapabilityForWrite({path,operation,actorUid});
  if(required==='self_profile')return Object.freeze({allowed:true,required,collection:topCollectionFromPath(path)});
  if(capabilities?.active!==true||capabilities?.[required]!==true){
    const error=new Error(`Seu nível de acesso não permite esta gravação (${required}).`);
    error.code='app/capability-required';
    error.required_capability=required;
    error.collection=topCollectionFromPath(path);
    throw error;
  }
  return Object.freeze({allowed:true,required,collection:topCollectionFromPath(path)});
}
