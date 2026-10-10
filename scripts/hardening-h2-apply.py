from pathlib import Path
import re

path=Path('app.js')
text=path.read_text(encoding='utf-8')

import_anchor="    import { createOnboardingView, savedIntegrationMode } from './ames/onboarding-view.mjs';\n"
import_line="    import {createOfflineOutbox,createBrowserOutboxStorage} from './core/offline-outbox.mjs';\n"
if import_line not in text:
    if text.count(import_anchor)!=1:raise SystemExit('H2 import anchor mismatch')
    text=text.replace(import_anchor,import_anchor+import_line,1)

pattern=re.compile(
    r"    // ==================== V15V — OFFLINE / AUDIT / LLMOPS / EXPORT ====================\n"
    r"    const OFFLINE_DB_NAME='central-trabalho-offline';.*?"
    r"    let offlineSupportRegistered=false;",
    re.S,
)
replacement="""    // ==================== V15V — OFFLINE / AUDIT / LLMOPS / EXPORT ====================
    // H2: outbox isolada por UID. A fila V1 sem dono permanece em quarentena e
    // nunca e atribuida automaticamente ao usuario que estiver logado depois.
    const offlineOutbox=createOfflineOutbox({storage:createBrowserOutboxStorage()});
    let offlineSyncPromise=null;
    async function queueOfflineWrite(collectionName,payload){
      const uid=currentAuthUser?.uid;
      if(!uid)throw new Error('Sessao autenticada obrigatoria para salvar offline.');
      return offlineOutbox.enqueue({uid,collection:collectionName,payload});
    }
    async function listOfflineQueue(){return currentAuthUser?.uid?offlineOutbox.pending(currentAuthUser.uid):[];}
    async function removeOfflineQueue(id){return currentAuthUser?.uid?offlineOutbox.ack(currentAuthUser.uid,id):false;}
    async function syncOfflineQueue(){
      if(!navigator.onLine||!currentAccount||!currentAuthUser)return {synced:0,failed:0,remaining:0,stopped:false,legacy_quarantined:0};
      if(offlineSyncPromise)return offlineSyncPromise;
      const uid=currentAuthUser.uid;
      const sessionIsCurrent=()=>currentAuthUser?.uid===uid;
      const write=async item=>{
        const request=setDoc(doc(db,item.collection,item.documentId),item.payload);
        let timer;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout ao confirmar escrita offline no Firestore')),15000);});
        try{return await Promise.race([request,timeout]);}finally{clearTimeout(timer);}
      };
      offlineSyncPromise=offlineOutbox.replay({uid,write,sessionIsCurrent}).then(result=>{
        window.__centralOfflineLegacyPending=result.legacy_quarantined;
        if(result.legacy_quarantined)console.warn(`[Central] ${result.legacy_quarantined} item(ns) da fila offline V1 permanecem em quarentena sem UID; nenhum foi reenviado automaticamente.`);
        if(result.synced)showSaveToast(`${result.synced} registro(s) offline sincronizado(s) com seguranca.`,'success');
        return result;
      }).finally(()=>{offlineSyncPromise=null;});
      return offlineSyncPromise;
    }
    offlineOutbox.legacyPendingCount().then(count=>{window.__centralOfflineLegacyPending=count;if(count)console.warn(`[Central] ${count} item(ns) offline V1 em quarentena aguardam recuperacao explicita.`);}).catch(error=>console.warn('Diagnostico da fila offline legada indisponivel:',error.message));
    let offlineSupportRegistered=false;"""
text,count=pattern.subn(replacement,text,count=1)
if count!=1:raise SystemExit(f'H2 queue block mismatch: {count}')

old_report="if(!navigator.onLine){const localId=`offline-${Date.now()}`;report.docId=localId;await queueOfflineWrite('reports',report);state.reports=[...state.reports,report];showSaveToast('Sem conexão. Report salvo no dispositivo e aguardará sincronização.','success');} else { await addDoc(collection(db, \"reports\"), report); }"
new_report="if(!navigator.onLine){const queued=await queueOfflineWrite('reports',report);report.docId=queued.documentId;state.reports=[...state.reports,report];showSaveToast('Sem conexão. Report salvo no dispositivo e aguardará sincronização.','success');} else { await addDoc(collection(db, \"reports\"), report); }"
if text.count(old_report)!=1:raise SystemExit(f'H2 report callsite mismatch: {text.count(old_report)}')
text=text.replace(old_report,new_report,1)

old_failure="if(!navigator.onLine){item.docId=`offline-${Date.now()}`;await queueOfflineWrite('operationalFailures',item);state.operationalFailures=[...state.operationalFailures,item];showSaveToast('Sem conexão. Falha salva no dispositivo e aguardará sincronização.','success');}else{item.docId=(await addDoc(collection(db,'operationalFailures'),item)).id;}"
new_failure="if(!navigator.onLine){const queued=await queueOfflineWrite('operationalFailures',item);item.docId=queued.documentId;state.operationalFailures=[...state.operationalFailures,item];showSaveToast('Sem conexão. Falha salva no dispositivo e aguardará sincronização.','success');}else{item.docId=(await addDoc(collection(db,'operationalFailures'),item)).id;}"
if text.count(old_failure)!=1:raise SystemExit(f'H2 operational failure callsite mismatch: {text.count(old_failure)}')
text=text.replace(old_failure,new_failure,1)

for forbidden in ("const OFFLINE_DB_NAME='central-trabalho-offline'","addDoc(collection(db,item.collection),item.payload)","arr.slice(-50)"):
    if forbidden in text:raise SystemExit('H2 forbidden legacy behavior remains: '+forbidden)
for required in (import_line.strip(),'offlineOutbox.replay','item.documentId','legacyPendingCount','queued.documentId'):
    if required not in text:raise SystemExit('H2 required behavior missing: '+required)

path.write_text(text,encoding='utf-8')
print('H2 app.js migration applied exactly once')
