const CACHE='central-cora-v15v-15-1-13-23';
const BASE='/Central-de-Controle-/';
const ASSETS=[BASE,BASE+'index.html',BASE+'app.js',BASE+'styles.css',BASE+'manifest.webmanifest',BASE+'icons/cora-192.svg',BASE+'icons/cora-512.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-cache-updated',version:'15.1.13.23'}))));});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy).catch(()=>{}));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match(BASE+'index.html'))));});
self.addEventListener('sync',event=>{if(event.tag==='cora-sync')event.waitUntil(self.clients.matchAll({includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-sync'}))));});
