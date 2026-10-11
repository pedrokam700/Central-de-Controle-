import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOfflineReadiness,OFFLINE_READINESS_SCHEMA} from '../core/offline-readiness.mjs';

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

test('offline readiness is true only when durable browser prerequisites are ready',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState(),build:'15.1.13.48'});
  assert.equal(result.schema,OFFLINE_READINESS_SCHEMA);
  assert.equal(result.offline_ready,true);
  assert.equal(result.auth_persistence,'local');
  assert.equal(result.firestore_cache,'persistent');
  assert.equal(result.service_worker.registered,true);
  assert.deepEqual(result.reasons,[]);
});

test('memory Firestore fallback keeps Central usable but not offline-ready',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState('local','memory-fallback'),navigatorRef:navigatorState()});
  assert.equal(result.offline_ready,false);
  assert.ok(result.reasons.includes('firestore_cache_not_persistent'));
});

test('missing service worker is explicit and fail-closed for readiness',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:navigatorState({registered:false})});
  assert.equal(result.offline_ready,false);
  assert.ok(result.reasons.includes('service_worker_not_registered'));
});

test('unsupported service worker is distinguished from merely unregistered',async()=>{
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef:{}});
  assert.equal(result.offline_ready,false);
  assert.equal(result.service_worker.supported,false);
  assert.ok(result.reasons.includes('service_worker_unsupported'));
});

test('service worker controller also satisfies runtime readiness while registration lookup is unavailable',async()=>{
  const navigatorRef={serviceWorker:{controller:{},async getRegistration(){throw new Error('policy')}}};
  const result=await evaluateOfflineReadiness({windowRef:windowState(),navigatorRef});
  assert.equal(result.offline_ready,true);
  assert.equal(result.service_worker.controlled,true);
});
