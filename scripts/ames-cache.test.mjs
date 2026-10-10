import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8'),base='/Central-de-Controle-/',origin='https://example.test';
const firebasePrefix='https://www.gstatic.com/firebasejs/10.8.0/';
function harness({offline=false,installFails=false,status=200,type='text/javascript',redirected=false,firebaseInstallFails=false}={}) {
  const events={},entries=new Map(),deleted=[],puts=[];let activated=false;
  class TestRequest {
    constructor(input,init={}){
      this.url=typeof input==='string'?input:input?.url;
      this.method=String(init.method||input?.method||'GET').toUpperCase();
      this.mode=init.mode||input?.mode;
      this.credentials=init.credentials||input?.credentials;
      this.cache=init.cache||input?.cache;
    }
  }
  const keyOf=key=>typeof key==='string'?key:key?.url;
  const cache={
    async addAll(assets){if(installFails)throw Error('missing module');for(const p of assets)entries.set(p,new Response('cached '+p));},
    async match(key){return entries.get(keyOf(key))?.clone();},
    async put(key,res){const cacheKey=keyOf(key);if(!String(cacheKey).startsWith(firebasePrefix))puts.push(cacheKey);entries.set(cacheKey,res);}
  };
  vm.runInNewContext(source,{URL,Response,Request:TestRequest,console,
    self:{location:{origin},addEventListener(name,fn){events[name]=fn;},skipWaiting(){activated=true;},clients:{claim(){},matchAll:async()=>[]}},
    caches:{open:async()=>cache,keys:async()=>['other-app','central-cora-v15v-15-1-13-45','central-cora-v15v-15-1-13-48'],delete:async key=>deleted.push(key)},
    fetch:async req=>{
      const url=keyOf(req)||'';
      if(String(url).startsWith(firebasePrefix)){
        if(firebaseInstallFails)throw Error('firebase offline on first install');
        return new Response('export const cachedFirebase=true',{status:200,headers:{'content-type':'text/javascript'}});
      }
      if(offline)throw Error('offline');
      const res=new Response('network',{status,headers:{'content-type':type}});Object.defineProperty(res,'redirected',{value:redirected});return res;
    }
  });
  return {entries,puts,deleted,activated:()=>activated,async lifecycle(name){let work;events[name]({waitUntil(p){work=p;}});return work;},async request(path,method='GET'){let result;events.fetch({request:{url:new URL(path,origin).href,method},respondWith(p){result=p;}});return result;}};
}
test('offline native imports and versioned CSS resolve canonical static precache',async()=>{
  // Primeiro install válido é online para permitir o cache dos SDKs Firebase exatos;
  // a opção offline abaixo representa a perda de internet depois desse bootstrap.
  const h=harness({offline:true});await h.lifecycle('install');assert(h.activated());
  for(const path of ['', 'app.js?v=15.1.13.48','ames/console-view.mjs','ames/data/capabilities.mjs','mobile.css?v=15.1.13.48','ames/releases/latest/release.json']){
    const res=await h.request(base+path);assert.equal(res.status,200);assert.match(await res.text(),/^cached/);
  }
  h.entries.delete(base+'ames/console-view.mjs');const missing=await h.request(base+'ames/console-view.mjs');assert.equal(missing.status,504);assert.doesNotMatch(await missing.text(),/index.html/);
});
test('primeiro install sem Firebase SDK não substitui worker anterior',async()=>{
  const bad=harness({firebaseInstallFails:true});await assert.rejects(bad.lifecycle('install'));assert.equal(bad.activated(),false);
});
test('install failure retains previous worker; activation deletes only own old builds',async()=>{
  const bad=harness({installFails:true});await assert.rejects(bad.lifecycle('install'));assert.equal(bad.activated(),false);
  const h=harness();await h.lifecycle('activate');assert.deepEqual(h.deleted,['central-cora-v15v-15-1-13-45']);
});
test('cache excludes user URLs, unknown versions, API requests, other origins and writes',async()=>{
  const h=harness();for(const path of [base+'index.html?oobCode=secret',base+'app.js?v=OLD',base+'api/user',base+'private.json','https://firebase.example/app.js'])assert.equal(await h.request(path),undefined);
  assert.equal(await h.request(base+'app.js','POST'),undefined);assert.deepEqual(h.puts,[]);
});
test('HTTP errors, redirected login and HTML masquerading as JS never poison cached modules',async()=>{
  for(const options of [{status:404},{type:'text/html'},{redirected:true}]){
    const h=harness(options);await h.lifecycle('install');await h.request(base+'app.js?v=15.1.13.48');assert.deepEqual(h.puts,[]);assert.match(await h.entries.get(base+'app.js').text(),/^cached/);
  }
  const good=harness();await good.request(base+'app.js?v=15.1.13.48');assert.deepEqual(good.puts,[base+'app.js']);
});
