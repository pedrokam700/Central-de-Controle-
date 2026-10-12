const EFFECT_TYPES=Object.freeze(['routine_failure_link']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'?value.trim():'';
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));

function validateRoutineFailureLink(effect,item){
  const executionKey=text(effect?.executionKey),failureId=text(effect?.failureId),linkedAt=text(effect?.linkedAt);
  if(!executionKey||!failureId||!linkedAt)throw new TypeError('Efeito de rotina offline incompleto');
  if(item?.collection!=='operationalFailures')throw new TypeError('Vínculo de rotina só é permitido para falha operacional');
  if(text(item?.payload?.id)!==failureId)throw new TypeError('failureId do efeito não corresponde à falha offline');
  if(text(item?.payload?.originRoutineExecutionId)!==executionKey)throw new TypeError('executionKey do efeito não corresponde à origem da falha');
  return Object.freeze({type:'routine_failure_link',executionKey,failureId,linkedAt});
}

export function normalizeOfflineEffects(effects,item){
  if(effects===undefined||effects===null)return Object.freeze([]);
  if(!Array.isArray(effects))throw new TypeError('Efeitos offline devem ser uma lista');
  if(effects.length>4)throw new TypeError('Muitos efeitos offline para uma única operação');
  const normalized=effects.map(effect=>{
    if(!plain(effect)||!EFFECT_TYPES.includes(effect.type))throw new TypeError('Efeito offline não autorizado');
    if(effect.type==='routine_failure_link')return validateRoutineFailureLink(effect,item);
    throw new TypeError('Efeito offline não suportado');
  });
  const identities=new Set();
  for(const effect of normalized){
    const identity=`${effect.type}:${effect.executionKey}:${effect.failureId}`;
    if(identities.has(identity))throw new TypeError('Efeito offline duplicado');
    identities.add(identity);
  }
  return Object.freeze(normalized.map(effect=>Object.freeze(clone(effect))));
}

export function routineFailureLinkEffect({executionKey,failureId,linkedAt}={}){
  return Object.freeze({type:'routine_failure_link',executionKey:text(executionKey),failureId:text(failureId),linkedAt:text(linkedAt)});
}

export function offlineWritePlan(item){
  if(!plain(item)||!text(item.collection)||!text(item.documentId)||!plain(item.payload))throw new TypeError('Item offline inválido para plano de escrita');
  const effects=normalizeOfflineEffects(item.effects,item);
  const steps=[Object.freeze({
    kind:'set_document',
    collection:item.collection,
    documentId:item.documentId,
    payload:Object.freeze(clone(item.payload)),
    merge:false
  })];
  for(const effect of effects){
    if(effect.type==='routine_failure_link'){
      steps.push(Object.freeze({
        kind:'routine_failure_link',
        collection:'routineExecutions',
        documentId:effect.executionKey,
        field:'linkedFailureIds',
        value:effect.failureId,
        updatedAt:effect.linkedAt,
        merge:true
      }));
    }
  }
  return Object.freeze(steps);
}

export const OFFLINE_EFFECT_TYPES=EFFECT_TYPES;
