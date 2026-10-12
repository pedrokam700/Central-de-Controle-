import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIREBASE_BROWSER_SDK_URLS,
  FIREBASE_BROWSER_SDK_VERSION,
  FIREBASE_SDK_PREPARATION_SCHEMA,
  evaluateFirebaseSdkPreparation
} from '../core/firebase-sdk-preparation.mjs';

const jsResponse=({ok=true,redirected=false,type='text/javascript'}={})=>({ok,redirected,headers:{get:name=>name==='content-type'?type:null}});
const cacheHarness=entries=>({async match(url){return entries.get(url);}});

test('exact Firebase browser SDK set is fixed to the reviewed 10.8.0 modules',()=>{
  assert.equal(FIREBASE_BROWSER_SDK_VERSION,'10.8.0');
  assert.deepEqual(FIREBASE_BROWSER_SDK_URLS,[
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
  ]);
});

test('current-origin CacheStorage is prepared only when every exact SDK module is a valid JavaScript response',async()=>{
  const entries=new Map(FIREBASE_BROWSER_SDK_URLS.map(url=>[url,jsResponse()]));
  const state=await evaluateFirebaseSdkPreparation({cachesRef:cacheHarness(entries)});
  assert.equal(state.schema,FIREBASE_SDK_PREPARATION_SCHEMA);
  assert.equal(state.source,'cache_storage_current_origin');
  assert.equal(state.supported,true);
  assert.equal(state.prepared,true);
  assert.equal(state.cached,3);
  assert.equal(state.required,3);
  assert.deepEqual(state.missing,[]);
  assert.deepEqual(state.invalid,[]);
});

test('missing redirected HTTP-error or non-JavaScript SDK response fails preparation closed',async()=>{
  for(const bad of [undefined,jsResponse({redirected:true}),jsResponse({ok:false}),jsResponse({type:'text/html'})]){
    const entries=new Map(FIREBASE_BROWSER_SDK_URLS.map(url=>[url,jsResponse()]));
    if(bad===undefined)entries.delete(FIREBASE_BROWSER_SDK_URLS[1]);else entries.set(FIREBASE_BROWSER_SDK_URLS[1],bad);
    const state=await evaluateFirebaseSdkPreparation({cachesRef:cacheHarness(entries)});
    assert.equal(state.prepared,false);
    assert.equal(state.cached,2);
    if(bad===undefined)assert.deepEqual(state.missing,[FIREBASE_BROWSER_SDK_URLS[1]]);
    else assert.deepEqual(state.invalid,[FIREBASE_BROWSER_SDK_URLS[1]]);
  }
});

test('unavailable CacheStorage is explicit and never treated as a prepared workstation',async()=>{
  const state=await evaluateFirebaseSdkPreparation({cachesRef:null});
  assert.equal(state.supported,false);
  assert.equal(state.prepared,false);
  assert.equal(state.cached,0);
  assert.deepEqual(state.missing,FIREBASE_BROWSER_SDK_URLS);
});

test('bootstrap Service Worker and readiness contract pin the same Firebase SDK and offline dependency chain',()=>{
  const boot=fs.readFileSync('offline-bootstrap.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  const readiness=fs.readFileSync('core/offline-readiness.mjs','utf8');
  for(const url of FIREBASE_BROWSER_SDK_URLS){
    assert.ok(boot.includes(url),`bootstrap Firebase URL drift: ${url}`);
    assert.ok(sw.includes(url),`service worker Firebase URL drift: ${url}`);
  }
  assert.ok(sw.includes("BASE+'core/offline-readiness.mjs'"));
  assert.ok(sw.includes("BASE+'core/firebase-sdk-preparation.mjs'"));
  assert.match(readiness,/evaluateFirebaseSdkPreparation/);
  assert.match(readiness,/firebase_sdk_not_prepared_for_current_origin/);
});

test('preparation evaluator is cache-only and never downloads or probes the network itself',()=>{
  const source=fs.readFileSync('core/firebase-sdk-preparation.mjs','utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/XMLHttpRequest|WebSocket/);
  assert.match(source,/cachesRef\.match\(url\)/);
});
