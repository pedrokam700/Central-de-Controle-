import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOfflineReadiness,OFFLINE_READINESS_SCHEMA} from '../core/offline-readiness.mjs';
import {FIREBASE_BROWSER_SDK_URLS} from '../core/firebase-sdk-preparation.mjs';

function windowState(auth='local',cache='persistent'){
  return {__centralAuthPersistence:auth,__centralFirestoreCache:cache};
}

function navigatorState({registered=true,controlled=false,state='activated'}={}){
  return {
    serviceWorker:{
      controller:controlled?{}:null,
      async getRegistration(){
        return registered?{active:{state}}:null;
      }
    }
  };
}

const jsResponse=()=>({ok:true,redirected:false,headers:{get:name=>name==='content-type'?'text/javascript':null}});
function cachesState({missing=[]}={}){
  const absent=new Set(missing);
  return {async match(url){return absent.has(url)?undefined:jsResponse();}};
}

test('offline readiness is true only when durable browser prerequisites and Firebase SDK cache are ready',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState(),cachesRef:cachesState(),build:'15.1.13.48'});
  assert.equal(result.schema,OFFLINE_READINESS_SCHEMA);
  assert.equal(result.offline_ready,true);
  assert.equal(result.auth_persistence,'local');
  assert.equal(result.firestore_cache,'persistent');
  assert.equal(result.service_worker.registered,true);
  assert.equal(result.firebase_sdk.prepared,true);
  assert.equal(result.firebase_sdk.cached,3);
  assert.deepEqual(result.reasons,[]);
});

test('memory Firestore fallback keeps Central usable but not offline-ready',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState('local','memory-fallback'),navigatorRef:navigatorState(),cachesRef:cachesState()});
  assert.equal(result.offline_ready,false);
  assert.ok(result.reasons.includes('firestore_cache_not_persistent'));
});

test('missing service worker is explicit and fail-closed for readiness',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState({registered:false}),cachesRef:cachesState()});
  assert.equal(result.offline_ready,false);
  assert.ok(result.reasons.includes('service_worker_not_registered'));
});

test('unsupported service worker is distinguished from merely unregistered',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:{},cachesRef:cachesState()});
  assert.equal(result.offline_ready,false);
  assert.equal(result.service_worker.supported,false);
  assert.ok(result.reasons.includes('service_worker_unsupported'));
});

test('service worker controller also satisfies runtime readiness while registration lookup is unavailable',async()=>{
  const navigatorRef={serviceWorker:{controller:{},async getRegistration(){throw new Error('policy')}}};
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef,cachesRef:cachesState()});
  assert.equal(result.offline_ready,true);
  assert.equal(result.service_worker.controlled,true);
});

test('registered service worker alone is not enough when current-origin Firebase SDK preparation is incomplete',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState(),cachesRef:cachesState({missing:[FIREBASE_BROWSER_SDK_URLS[1]]})});
  assert.equal(result.offline_ready,false);
  assert.equal(result.firebase_sdk.prepared,false);
  assert.equal(result.firebase_sdk.cached,2);
  assert.deepEqual(result.firebase_sdk.missing,[FIREBASE_BROWSER_SDK_URLS[1]]);
  assert.ok(result.reasons.includes('firebase_sdk_not_prepared_for_current_origin'));
});

test('unavailable CacheStorage fails readiness closed instead of assuming the SDK exists',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState(),cachesRef:null});
  assert.equal(result.offline_ready,false);
  assert.equal(result.firebase_sdk.supported,false);
  assert.ok(result.reasons.includes('firebase_sdk_cache_storage_unavailable'));
});
