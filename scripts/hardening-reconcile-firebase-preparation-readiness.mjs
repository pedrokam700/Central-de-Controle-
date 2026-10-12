import fs from 'node:fs';
const path='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(path,'utf8'));
const immutable=doc?.gates?.immutable_frontend_distribution;
const offline=doc?.gates?.offline_readiness;
if(!immutable||!offline)throw new Error('offline readiness gates missing');
if(immutable.status!=='green_tooling_not_launcher_default')throw new Error(`unexpected immutable status ${immutable.status}`);
if(offline.status!=='green_contract_partial_distribution')throw new Error(`unexpected offline status ${offline.status}`);
const add=(list,value)=>{list=list||[];if(!list.includes(value))list.push(value);return list;};
const remove=(list,value)=>(list||[]).filter(x=>x!==value);

immutable.green=immutable.green||[];
for(const item of [
  'current-origin offline readiness verifies all three exact Firebase 10.8.0 browser SDK modules are already present and valid in CacheStorage',
  'Service Worker precache now closes the offline-bootstrap -> offline-readiness -> firebase-sdk-preparation dependency chain',
  'Firebase SDK preparation is origin-scoped and fail-closed; a registered Service Worker alone no longer proves the workstation can bootstrap offline'
])immutable.green=add(immutable.green,item);
immutable.evidence=immutable.evidence||[];
for(const item of ['core/firebase-sdk-preparation.mjs','scripts/ames-firebase-sdk-preparation.test.mjs','scripts/ames-offline-readiness.test.mjs','hardening/firebase-sdk-preparation-evidence.json'])immutable.evidence=add(immutable.evidence,item);
immutable.remaining=remove(immutable.remaining,'validate Firebase Auth localhost/domain behavior and first-install SDK preparation');
immutable.remaining=remove(immutable.remaining,'decide whether Firebase SDK should be vendored for never-prepared-PC offline bootstrap');
for(const item of [
  'validate live Firebase Auth authorized-domain behavior for localhost/127.0.0.1 before local origin can become a launcher candidate',
  'choose and prove an explicit first-preparation strategy for a never-prepared local origin: online exact-SDK bootstrap or vendored exact Firebase SDK; no strategy is approved yet'
])immutable.remaining=add(immutable.remaining,item);
immutable.full_ci_runs=add(immutable.full_ci_runs||[],38188754058);

offline.green=offline.green||[];
for(const item of [
  'offline_ready requires exact Firebase SDK preparation in CacheStorage for the current origin',
  'missing/invalid Firebase SDK cache is reported explicitly instead of being inferred from Service Worker registration',
  'offline readiness dependency modules are part of the static Service Worker shell'
])offline.green=add(offline.green,item);
offline.evidence=offline.evidence||[];
for(const item of ['core/offline-readiness.mjs','core/firebase-sdk-preparation.mjs','scripts/ames-offline-readiness.test.mjs','scripts/ames-firebase-sdk-preparation.test.mjs','hardening/firebase-sdk-preparation-evidence.json'])offline.evidence=add(offline.evidence,item);
offline.remaining=remove(offline.remaining,'first local-origin preparation still depends on Firebase SDK availability from gstatic');
offline.remaining=add(offline.remaining,'never-prepared local origin remains intentionally not offline-ready until an approved first-preparation strategy makes the exact Firebase SDK available for that origin');
offline.full_ci_runs=add(offline.full_ci_runs||[],38188754058);

if(doc.promotion?.stable_allowed!==false||doc.promotion?.main_merge_allowed!==false||doc.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion guard changed');
if(!immutable.remaining.some(x=>x.includes('never-prepared local origin')))throw new Error('first-preparation blocker must remain');
if(!offline.remaining.some(x=>x.includes('never-prepared local origin')))throw new Error('offline first-preparation blocker must remain');
if(!immutable.remaining.some(x=>x.includes('launcher')))throw new Error('launcher validation blocker must remain');
fs.writeFileSync(path,JSON.stringify(doc,null,2)+'\n');
console.log('PASS: Firebase preparation readiness reconciled without claiming first-install or launcher completion');
