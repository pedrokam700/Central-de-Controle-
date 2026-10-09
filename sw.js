const CACHE='central-cora-v15v-15-1-13-44';
const BASE='/Central-de-Controle-/';
const ASSETS=[BASE,BASE+'index.html',BASE+'app.js',BASE+'ames/data/store.mjs',BASE+'ames/data/dashboard.mjs',BASE+'ames/dashboard-view.mjs',BASE+'ames/dashboard.css',BASE+'ames/trace-view.mjs',BASE+'ames/data/trace.mjs',BASE+'ames/evidence-view.mjs',BASE+'ames/occurrence-view.mjs',BASE+'ames/onboarding-view.mjs',BASE+'ames/data/onboarding.mjs',BASE+'ames/releases/latest/release.json',BASE+'ames/cora-view.mjs',BASE+'ames/data/cora.mjs',BASE+'ames/daily-view.mjs',BASE+'ames/data/daily.mjs',BASE+'ames/data/failures.mjs',BASE+'ames/data/product.mjs',BASE+'ames/product-view.mjs',BASE+'ames/product.css',BASE+'ames/data/contract.mjs',BASE+'styles.css',BASE+'mobile.css',BASE+'manifest.webmanifest',BASE+'icons/cora-192.svg',BASE+'icons/cora-512.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-cache-updated',version:'15.1.13.44'}))));});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy).catch(()=>{}));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match(BASE+'index.html'))));});
self.addEventListener('sync',event=>{if(event.tag==='cora-sync')event.waitUntil(self.clients.matchAll({includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-sync'}))));});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{};
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const client=clients[0];
    if(client){
      await client.focus();
      client.postMessage({type:'central-notification-click',data});
      return;
    }
    const opened=await self.clients.openWindow(BASE);
    if(opened)setTimeout(()=>opened.postMessage({type:'central-notification-click',data}),350);
  }));
});
