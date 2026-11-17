import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8'),origin='https://synthetic.test',base='/Central-de-Controle-/';
function harness(shared=new Map()){
 const events={},clients=[{id:'old-tab',url:origin+base,postMessage(){}}];
 const cacheFor=name=>{
  if(!shared.has(name))shared.set(name,new Map());const entries=shared.get(name);
  return {async addAll(paths){for(const path of paths)entries.set(path,new Response('NEW '+path));},
   async match(key){return entries.get(typeof key==='string'?key:key.url)?.clone();},
   async put(key,value){entries.set(typeof key==='string'?key:key.url,value.clone());}};
 };
 const context=vm.createContext({URL,Request,Response,console,
  caches:{open:async name=>cacheFor(name),keys:async()=>[...shared.keys()],delete:async name=>shared.delete(name)},
  fetch:async()=>new Response('export const newRuntime=true',{headers:{'content-type':'text/javascript'}}),
  self:{location:{origin},addEventListener:(name,fn)=>events[name]=fn,clients:{claim(){},matchAll:async()=>clients},skipWaiting(){}}});
 vm.runInContext(source,context);
 return {shared,clients,async lifecycle(name){let work;events[name]({waitUntil(p){work=p;}});await work;},
  async request(name,clientId,mode='cors',resultingClientId=''){
   let response;events.fetch({clientId,resultingClientId,request:{url:origin+base+name,method:'GET',mode},respondWith(p){response=p;}});return response;
  }};
}
test('activating a new worker cannot serve new static modules into another old tab',async()=>{
 const h=harness();await h.lifecycle('install');await h.lifecycle('activate');
 const response=await h.request('ames/data/canonical.mjs','old-tab');
 assert.equal(response.status,409,'old tab must reload before consuming a different runtime');
 assert.doesNotMatch(await response.text(),/^NEW/);
});
test('old-client guard survives worker restart while a new navigation uses the new shell',async()=>{
 const first=harness();await first.lifecycle('install');await first.lifecycle('activate');
 const restarted=harness(first.shared);
 assert.equal((await restarted.request('ames/data/canonical.mjs','old-tab')).status,409);
 assert.equal((await restarted.request('','old-tab','navigate','new-document')).status,200);
 assert.equal((await restarted.request('ames/data/canonical.mjs','new-document')).status,200);
});
test('upgrade cannot delete unrelated cached data and does not intercept API writes',async()=>{
 const data=new Map([['unrelated-offline-data',new Map([['proof',new Response('keep')]])]]);
 const h=harness(data);await h.lifecycle('install');await h.lifecycle('activate');
 assert(data.has('unrelated-offline-data'));
 assert.equal(await h.request('api/v1/snapshots','old-tab'),undefined);
});
