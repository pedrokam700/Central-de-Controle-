import {evaluateFirebaseSdkPreparation} from './firebase-sdk-preparation.mjs';

export const OFFLINE_READINESS_SCHEMA='central-offline-readiness-v1';

async function serviceWorkerState(navigatorRef){
  const sw=navigatorRef?.serviceWorker;
  if(!sw)return {supported:false,registered:false,controlled:false,state:'unsupported'};
  let registration=null;
  try{
    registration=await sw.getRegistration?.('/Central-de-Controle-/')||await sw.getRegistration?.()||null;
  }catch{}
  const controlled=Boolean(sw.controller);
  const registered=Boolean(registration);
  const state=registration?.active?.state||registration?.waiting?.state||registration?.installing?.state||(controlled?'controlled':registered?'registered':'missing');
  return {supported:true,registered,controlled,state};
}

export async function evaluateOfflineReadiness({windowRef=globalThis.window,navigatorRef=globalThis.navigator,cachesRef=globalThis.caches,build=''}={}){
  const authPersistence=String(windowRef?.__centralAuthPersistence||'unknown');
  const firestoreCache=String(windowRef?.__centralFirestoreCache||'unknown');
  const [serviceWorker,firebaseSdk]=await Promise.all([
    serviceWorkerState(navigatorRef),
    evaluateFirebaseSdkPreparation({cachesRef})
  ]);
  const authReady=authPersistence==='local';
  const firestoreReady=firestoreCache==='persistent';
  const serviceWorkerReady=serviceWorker.registered||serviceWorker.controlled;
  const firebaseSdkReady=firebaseSdk.prepared===true;
  const reasons=[];
  if(!authReady)reasons.push('auth_persistence_not_local');
  if(!firestoreReady)reasons.push('firestore_cache_not_persistent');
  if(!serviceWorker.supported)reasons.push('service_worker_unsupported');
  else if(!serviceWorkerReady)reasons.push('service_worker_not_registered');
  if(!firebaseSdk.supported)reasons.push('firebase_sdk_cache_storage_unavailable');
  else if(!firebaseSdkReady)reasons.push('firebase_sdk_not_prepared_for_current_origin');
  return Object.freeze({
    schema:OFFLINE_READINESS_SCHEMA,
    build:String(build||''),
    auth_persistence:authPersistence,
    firestore_cache:firestoreCache,
    service_worker:serviceWorker,
    firebase_sdk:firebaseSdk,
    offline_ready:authReady&&firestoreReady&&serviceWorkerReady&&firebaseSdkReady,
    reasons:Object.freeze(reasons)
  });
}

export async function publishOfflineReadiness(options={}){
  const target=options.windowRef||globalThis.window;
  const readiness=await evaluateOfflineReadiness(options);
  if(target)target.__centralOfflineReadiness=readiness;
  try{target?.dispatchEvent?.(new CustomEvent('central:offline-readiness',{detail:readiness}));}catch{}
  return readiness;
}
