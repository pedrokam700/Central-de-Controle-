const CACHE_REVISION='integration-20261019-pr38';
const CACHE='central-cora-v15v-15-1-13-49-'+CACHE_REVISION;
const BASE='/Central-de-Controle-/';
const ASSETS=[BASE,BASE+'core/ames-session.mjs',BASE+'core/central-roundtrip.mjs',BASE+'ames/operational-context-bridge.mjs',BASE+'ames/ui-scheduler.mjs',BASE+'ames/data/source-provenance.mjs',BASE+'ames/data/sn-forensics.mjs',BASE+'ames/console-process-provenance.mjs',BASE+'ames/console-sn-consistency.mjs',BASE+'ames/console-reuse-provenance.mjs',BASE+'ames/integration-session.mjs',BASE+'ames/history-source.mjs',BASE+'core/login-navigation.mjs',BASE+'core/login-accessibility.css',BASE+'ames/console-i18n.mjs',BASE+'ames/console-i18n-extra.mjs',BASE+'ames/console-preparation.mjs',BASE+'ames/console-theme.css',BASE+'ames/console-history.mjs',BASE+'ames/data/history.mjs',BASE+'ames/data/operational-period.mjs',BASE+'ames/data/reading-period.mjs',BASE+'ames/reading-period-controller.mjs',BASE+'ames/console-reading-period.mjs',BASE+'ames/data/time-display.mjs',BASE+'ames/data/production-evidence.mjs',BASE+'ames/console-r12-polish.css',BASE+'ames/console-fastlane.css',BASE+'ames/console-daily-analytics.css',BASE+'ames/console-improvements.css',BASE+'ames/console-operator-parity.css',BASE+'index.html',BASE+'offline-bootstrap.mjs',BASE+'app.js',BASE+'core/daily-admin-insights.mjs',BASE+'core/offline-outbox.mjs',BASE+'core/auth-hardening.mjs',BASE+'ames/data/store.mjs',BASE+'ames/data/canonical.mjs',BASE+'ames/data/process-timeline.mjs',BASE+'ames/data/reuse-analysis.mjs',BASE+'ames/data/dashboard.mjs',BASE+'ames/sync.mjs',BASE+'ames/firebase-sync.mjs',BASE+'ames/advanced-view.mjs',BASE+'ames/advanced-table.mjs',BASE+'ames/base-paging.mjs',BASE+'ames/data/agent-contract.mjs',BASE+'ames/agent-client.mjs',BASE+'ames/automation-view.mjs',BASE+'ames/agent-evidence-view.mjs',BASE+'ames/agent-diagnostics.mjs',BASE+'ames/agent-3012-health.mjs',BASE+'ames/console-specialized-views.mjs',BASE+'ames/console-wave3-views.mjs',BASE+'ames/reuse-table-view.mjs',BASE+'ames/console-base-view.mjs',BASE+'ames/console-base-catalog.mjs',BASE+'ames/console-fastlane-sn-reuse.mjs',BASE+'ames/console-sn-offline-fastlane.mjs',BASE+'ames/console-sn-offline-navigation.mjs',BASE+'ames/console-network-fastlane.mjs',BASE+'ames/console-3012-fastlane.mjs',BASE+'ames/console-process-operator.mjs',BASE+'ames/console-capability-guard.mjs',BASE+'ames/console-monitor-runtime.mjs',BASE+'ames/console-failure-process.mjs',BASE+'ames/console-knowledge-architecture.mjs',BASE+'ames/console-refresh-decorator.mjs',BASE+'ames/console-trace-scope.mjs',BASE+'ames/console-data-health.mjs',BASE+'ames/console-shift-summary.mjs',BASE+'ames/console-evidence-drawer.mjs',BASE+'ames/daily-failure-summary.mjs',BASE+'ames/daily-failure-analytics.mjs',BASE+'ames/defect-label.mjs',BASE+'ames/collection-status.mjs',BASE+'ames/console-legacy-parity.mjs',BASE+'ames/console-legacy.css',BASE+'ames/console-wave2.css',BASE+'ames/console-wave3.css',BASE+'ames/console-r12-fidelity.css',BASE+'ames/console-monitor-runtime.css',BASE+'ames/console-knowledge-architecture.css',BASE+'ames/console-mobile-polish.css',BASE+'ames/central-mes-context.mjs',BASE+'ames/central-mes-context.css',BASE+'ames/data/capabilities.mjs',BASE+'ames/capability-view.mjs',BASE+'ames/console-view.mjs',BASE+'ames/dashboard-view.mjs',BASE+'ames/dashboard.css',BASE+'ames/trace-view.mjs',BASE+'ames/data/trace.mjs',BASE+'ames/evidence-view.mjs',BASE+'ames/occurrence-view.mjs',BASE+'ames/onboarding-view.mjs',BASE+'ames/migration-download.mjs',BASE+'ames/data/onboarding.mjs',BASE+'ames/releases/latest/release.json',BASE+'ames/cora-view.mjs',BASE+'ames/data/cora.mjs',BASE+'ames/daily-view.mjs',BASE+'ames/data/daily.mjs',BASE+'ames/data/failures.mjs',BASE+'ames/data/product.mjs',BASE+'ames/product-view.mjs',BASE+'ames/product.css',BASE+'ames/data/contract.mjs',BASE+'styles.css',BASE+'mobile.css',BASE+'manifest.webmanifest',BASE+'icons/cora-192.svg',BASE+'icons/cora-512.svg'];
const FIREBASE_SDK=Object.freeze([
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
]);

async function precache(){
  const cache=await caches.open(CACHE);
  // Local shell is atomic: missing native module must not replace the working shell.
  await cache.addAll(ASSETS);
  // The Firebase browser modules are exact-version allowlisted dependencies of the
  // shell. First install requires internet; after this cache is complete, a later
  // external outage/reboot does not need gstatic merely to bootstrap the Central.
  for(const url of FIREBASE_SDK){
    const req=new Request(url,{mode:'cors',credentials:'omit',cache:'no-store'});
    const res=await fetch(req);
    const type=res.headers.get('content-type')||'';
    if(!res.ok||res.redirected||!/(?:javascript|ecmascript)/i.test(type))throw new Error('Firebase SDK cache refused: '+url);
    await cache.put(url,res.clone());
  }
}

self.addEventListener('install',event=>{event.waitUntil(precache().then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('central-cora-v15v-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({includeUncontrolled:true})).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-cache-updated',version:'15.1.13.49',cache_revision:CACHE_REVISION}))));});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  const firebase=FIREBASE_SDK.includes(url.href);
  const local=url.origin===self.location.origin&&ASSETS.includes(url.pathname);
  if(!firebase&&!local)return;
  if(local&&([...url.searchParams.keys()].some(key=>key!=='v')||(url.searchParams.has('v')&&url.searchParams.get('v')!=='15.1.13.49')))return;
  const key=firebase?url.href:url.pathname;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Each installed shell is immutable. Fetching some modules from the next
    // deployment while others remain cached can mix incompatible builds.
    const installed=await cache.match(key);if(installed)return installed;
    try{
      const res=await fetch(req),type=res.headers.get('content-type')||'';
      const validType=firebase||/\.(?:m?js)$/.test(key)?/(?:javascript|ecmascript)/i.test(type):key.endsWith('.css')?/text\/css/i.test(type):key.endsWith('.json')?/json/i.test(type):true;
      if(res.ok&&!res.redirected&&validType)await cache.put(key,res.clone()).catch(()=>{});
      return res;
    }catch{return await cache.match(key)||new Response('Static dependency unavailable offline',{status:504,headers:{'Content-Type':'text/plain'}});}
  })());
});
self.addEventListener('sync',event=>{if(event.tag==='cora-sync')event.waitUntil(self.clients.matchAll({includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:'cora-sync'}))));});
self.addEventListener('notificationclick',event=>{event.notification.close();const data=event.notification.data||{};event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients[0];if(client){await client.focus();client.postMessage({type:'central-notification-click',data});return;}const opened=await self.clients.openWindow(BASE);if(opened)setTimeout(()=>opened.postMessage({type:'central-notification-click',data}),350);}));});