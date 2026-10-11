import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let app=fs.readFileSync('app.js','utf8');

app=replaceExactly(
  app,
  "    import {createOfflineOutbox,createBrowserOutboxStorage} from './core/offline-outbox.mjs';",
  "    import {createOfflineOutbox,createBrowserOutboxStorage} from './core/offline-outbox.mjs';\n    import {offlineWritePlan,routineFailureLinkEffect} from './core/offline-domain-write.mjs';",
  'offline domain import'
);

app=replaceExactly(
  app,
  '      getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, setDoc, getDoc, getDocs, query, where, writeBatch, runTransaction',
  '      getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, setDoc, getDoc, getDocs, query, where, writeBatch, runTransaction, arrayUnion',
  'Firestore arrayUnion import'
);

app=replaceExactly(
  app,
  '    async function queueOfflineWrite(collectionName,payload){',
  '    async function queueOfflineWrite(collectionName,payload,{effects=[]}={}){',
  'offline enqueue signature'
);
app=replaceExactly(
  app,
  '      return offlineOutbox.enqueue({uid,collection:collectionName,payload});',
  '      return offlineOutbox.enqueue({uid,collection:collectionName,payload,effects});',
  'offline enqueue effects'
);

const oldWriter=`      const write=async item=>{\n        const request=setDoc(doc(db,item.collection,item.documentId),item.payload);\n        let timer;\n        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout ao confirmar escrita offline no Firestore')),15000);});\n        try{return await Promise.race([request,timeout]);}finally{clearTimeout(timer);}\n      };`;
const newWriter=`      const write=async item=>{\n        const plan=offlineWritePlan(item),batch=writeBatch(db);\n        for(const step of plan){\n          if(step.kind==='set_document'){\n            batch.set(doc(db,step.collection,step.documentId),step.payload);\n          }else if(step.kind==='routine_failure_link'){\n            batch.update(doc(db,step.collection,step.documentId),{[step.field]:arrayUnion(step.value),updatedAt:step.updatedAt});\n          }else{\n            throw new Error('Operacao offline nao suportada: '+String(step.kind||''));\n          }\n        }\n        const request=batch.commit();\n        let timer;\n        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout ao confirmar escrita offline no Firestore')),15000);});\n        try{return await Promise.race([request,timeout]);}finally{clearTimeout(timer);}\n      };`;
app=replaceExactly(app,oldWriter,newWriter,'atomic offline replay writer');

const oldRoutine=`      if(!navigator.onLine){const queued=await queueOfflineWrite('operationalFailures',item);item.docId=queued.documentId;state.operationalFailures=[...state.operationalFailures,item];showSaveToast('Sem conexão. Falha salva no dispositivo e aguardará sincronização.','success');}else{item.docId=(await addDoc(collection(db,'operationalFailures'),item)).id;}\n      const origin=pendingOriginContext;\n      if(origin?.type==='routineExecution'){const exec=dailyFindExecution(origin.executionKey),linked=[...new Set([...(exec?.linkedFailureIds||[]),item.id])];await setDoc(doc(db,'routineExecutions',origin.executionKey),{linkedFailureIds:linked,updatedAt:now()},{merge:true});}`;
const newRoutine=`      const origin=pendingOriginContext;\n      const routineEffect=origin?.type==='routineExecution'\n        ? routineFailureLinkEffect({executionKey:origin.executionKey,failureId:item.id,linkedAt:item.createdAt||now()})\n        : null;\n      if(!navigator.onLine){\n        const queued=await queueOfflineWrite('operationalFailures',item,{effects:routineEffect?[routineEffect]:[]});\n        item.docId=queued.documentId;state.operationalFailures=[...state.operationalFailures,item];showSaveToast('Sem conexão. Falha salva no dispositivo e aguardará sincronização.','success');\n      }else if(routineEffect){\n        const batch=writeBatch(db),failureRef=doc(collection(db,'operationalFailures'));\n        batch.set(failureRef,item);\n        batch.update(doc(db,'routineExecutions',routineEffect.executionKey),{linkedFailureIds:arrayUnion(routineEffect.failureId),updatedAt:routineEffect.linkedAt});\n        await withTimeout(batch.commit(),15000,'Registro da falha e vinculo da rotina');\n        item.docId=failureRef.id;\n      }else{\n        item.docId=(await addDoc(collection(db,'operationalFailures'),item)).id;\n      }`;
app=replaceExactly(app,oldRoutine,newRoutine,'routine failure atomic save');

for(const forbidden of [
  "linked=[...new Set([...(exec?.linkedFailureIds||[]),item.id])]",
  "setDoc(doc(db,'routineExecutions',origin.executionKey),{linkedFailureIds:linked"
]){
  if(app.includes(forbidden))throw new Error('legacy non-atomic routine link remains: '+forbidden);
}
for(const required of [
  "offlineWritePlan(item)",
  "routineFailureLinkEffect({executionKey:origin.executionKey",
  "batch.update(doc(db,step.collection,step.documentId),{[step.field]:arrayUnion(step.value)",
  "queueOfflineWrite('operationalFailures',item,{effects:routineEffect?[routineEffect]:[]})",
  "batch.update(doc(db,'routineExecutions',routineEffect.executionKey),{linkedFailureIds:arrayUnion(routineEffect.failureId)"
]){
  if(!app.includes(required))throw new Error('required compound integration missing: '+required);
}
fs.writeFileSync('app.js',app);

let testSource=fs.readFileSync('scripts/ames-offline-outbox.test.mjs','utf8');
testSource=replaceExactly(
  testSource,
  "  assert.match(app,/setDoc\\(doc\\(db,item\\.collection,item\\.documentId\\),item\\.payload\\)/);",
  "  assert.match(app,/\\.\\/core\\/offline-domain-write\\.mjs/);\n  assert.match(app,/offlineWritePlan\\(item\\)/);\n  assert.match(app,/writeBatch\\(db\\)/);\n  assert.match(app,/arrayUnion\\(step\\.value\\)/);\n  assert.match(app,/queueOfflineWrite\\('operationalFailures',item,\\{effects:routineEffect\\?\\[routineEffect\\]:\\[\\]\\}\\)/);\n  assert.match(app,/routineFailureLinkEffect\\(\\{executionKey:origin\\.executionKey/);\n  assert.match(app,/batch\\.update\\(doc\\(db,'routineExecutions',routineEffect\\.executionKey\\),\\{linkedFailureIds:arrayUnion\\(routineEffect\\.failureId\\)/);\n  assert.doesNotMatch(app,/linked=\\[\\.\\.\\.new Set/);",
  'offline source integration assertions'
);
testSource=replaceExactly(
  testSource,
  "  assert.match(sw,/core\\/offline-outbox\\.mjs/);",
  "  assert.match(sw,/core\\/offline-outbox\\.mjs/);\n  assert.match(sw,/core\\/offline-domain-write\\.mjs/);",
  'offline service worker dependency assertion'
);
fs.writeFileSync('scripts/ames-offline-outbox.test.mjs',testSource);

console.log('PASS deterministic compound-outbox app.js patch');
