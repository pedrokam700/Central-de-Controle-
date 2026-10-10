const CACHE='central-cora-v15v-15-1-13-48';
const BASE='/Central-de-Controle-/';
const ASSETS=[BASE,BASE+'index.html',BASE+'app.js',BASE+'ames/data/store.mjs',BASE+'ames/data/canonical.mjs',BASE+'ames/data/process-timeline.mjs',BASE+'ames/sync.mjs',BASE+'ames/firebase-sync.mjs',BASE+'ames/advanced-view.mjs',BASE+'ames/data/agent-contract.mjs',BASE+'ames/agent-client.mjs',BASE+'ames/automation-view.mjs',BASE+'ames/agent-evidence-view.mjs',BASE+'ames/console-specialized-views.mjs',BASE+'ames/console-wave3-views.mjs',BASE+'ames/console-legacy-parity.mjs',BASE+'ames/console-legacy.css',BASE+'ames/console-wave2.css',BASE+'ames/console-wave3.css',BASE+'ames/central-mes-context.mjs',BASE+'ames/central-mes-context.css',BASE+'ames/data/dashboard.mjs',BASE+'ames/data/capabilities.mjs',BASE+'ames/capability-view.mjs',BASE+'ames/console-view.mjs',BASE+'ames/dashboard-view.mjs',BASE+'ames/dashboard.css',BASE+'ames/trace-view.mjs',BASE+'ames/data/trace.mjs',BASE+'ames/evidence-view.mjs',BASE+'ames/occurrence-view.mjs',BASE+'ames/onboarding-view.mjs',BASE+'ames/data/onboarding.mjs',BASE+'ames/releases/latest/release.json',BASE+'ames/cora-view.mjs',BASE+'ames/data/cora.mjs',BASE+'ames/daily-view.mjs',BASE+'ames/data/daily.mjs',BASE+'ames/data/failures.mjs',BASE+'ames/data/product.mjs',BASE+'ames/product-view.mjs',BASE+'ames/product.css',BASE+'ames/data/contract.mjs',BASE+'styles.css',BASE+'mobile.css',BASE+'manifest.webmanifest',BASE+'icons/cora-192.svg',BASE+'icons/cora-512.svg'];
// Install atomically: a missing native module must not replace the working shell.
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('central-cora-v15v-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-cache-updated',version:'15.1.13.48'}))));});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
  // Only the shell's own version token may use a canonical precached asset.
  // Never store URLs containing reset codes, credentials or unrelated parameters.
  if([...url.searchParams.keys()].some(key=>key!=='v')||
    (url.searchParams.has('v')&&url.searchParams.get('v')!=='15.1.13.48'))return;
  const key=url.pathname;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const res=await fetch(req),type=res.headers.get('content-type')||'';
      const validType=/\.(?:m?js)$/.test(key)?/(?:javascript|ecmascript)/i.test(type):
        key.endsWith('.css')?/text\/css/i.test(type):key.endsWith('.json')?/json/i.test(type):true;
      if(res.ok&&!res.redirected&&validType)await cache.put(key,res.clone()).catch(()=>{});
      return res;
    }catch{
      // Only this build's exact static asset. Never return HTML as JS/CSS/JSON.
      return await cache.match(key)||new Response('Static asset unavailable offline',{status:504,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
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
