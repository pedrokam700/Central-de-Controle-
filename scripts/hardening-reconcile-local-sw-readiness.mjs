import fs from 'node:fs';
const path='hardening/production-readiness.json';
const doc=JSON.parse(fs.readFileSync(path,'utf8'));
const immutable=doc?.gates?.immutable_frontend_distribution;
const offline=doc?.gates?.offline_readiness;
if(!immutable||!offline)throw new Error('local/offline readiness gates missing');
if(immutable.status!=='green_tooling_not_launcher_default')throw new Error(`unexpected immutable status ${immutable.status}`);
if(offline.status!=='green_contract_partial_distribution')throw new Error(`unexpected offline status ${offline.status}`);
const add=(list,value)=>{list=list||[];if(!list.includes(value))list.push(value);return list;};
const remove=(list,value)=>(list||[]).filter(x=>x!==value);

for(const item of [
  'app Service Worker registration, readiness lookup and worker BASE share the exact /Central-de-Controle-/ scope contract',
  'verified loopback proof server serves /Central-de-Controle-/sw.js from the immutable stage with JavaScript MIME and nosniff',
  'local proof server remains loopback-only, launcher_default false and CORA /api blocked while Service Worker assets are served'
])immutable.green=add(immutable.green,item);
for(const item of [
  'scripts/ames-local-origin-service-worker.test.mjs',
  'scripts/agent-local-frontend-server.test.py',
  'hardening/local-origin-service-worker-evidence.json'
])immutable.evidence=add(immutable.evidence,item);
immutable.full_ci_runs=add(immutable.full_ci_runs||[],38188976132);
immutable.full_ci_runs=add(immutable.full_ci_runs||[],38189143551);
immutable.remaining=remove(immutable.remaining,'validate Service Worker/local-origin lifecycle');
immutable.remaining=add(immutable.remaining,'validate real Chrome/Edge Service Worker registration, activation, control and update lifecycle on the Windows loopback origin');

offline.green=offline.green||[];
for(const item of [
  'canonical Service Worker path/scope is aligned across app registration, readiness lookup and worker BASE',
  'verified loopback HTTP proof serves the staged Service Worker with JavaScript MIME and nosniff without changing launcher defaults'
])offline.green=add(offline.green,item);
for(const item of [
  'scripts/ames-local-origin-service-worker.test.mjs',
  'scripts/agent-local-frontend-server.test.py',
  'hardening/local-origin-service-worker-evidence.json'
])offline.evidence=add(offline.evidence,item);
offline.full_ci_runs=add(offline.full_ci_runs||[],38188976132);
offline.full_ci_runs=add(offline.full_ci_runs||[],38189143551);

const allRemaining=[...(immutable.remaining||[]),...(offline.remaining||[])].join('\n');
for(const required of ['launcher','CORA','Windows','never-prepared local origin']){
  if(!allRemaining.includes(required))throw new Error(`required blocker disappeared: ${required}`);
}
if(!allRemaining.includes('Firebase Auth'))throw new Error('Firebase Auth local-origin blocker disappeared');
if(doc.promotion?.stable_allowed!==false||doc.promotion?.main_merge_allowed!==false||doc.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion guard changed');
fs.writeFileSync(path,JSON.stringify(doc,null,2)+'\n');
console.log('PASS: local Service Worker readiness reconciled; browser/Windows and first-preparation blockers preserved');
