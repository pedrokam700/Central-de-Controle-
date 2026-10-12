import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const boot=fs.readFileSync('offline-bootstrap.mjs','utf8');
const build=fs.readFileSync('scripts/build-static.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const outbox=fs.readFileSync('core/offline-outbox.mjs','utf8');
const domain=fs.readFileSync('core/offline-domain-write.mjs','utf8');

test('Auth e Firestore persistentes são preparados antes do app.js',()=>{
  assert.match(boot,/setPersistence\(getAuth\(app\),browserLocalPersistence\)/);
  assert.match(boot,/initializeFirestore/);
  assert.match(boot,/persistentLocalCache/);
  assert.match(boot,/persistentMultipleTabManager/);
  assert.match(boot,/await import\(`\.\/app\.js\?v=\$\{BUILD\}`\)/);
  assert.ok(boot.indexOf('setPersistence') < boot.indexOf('await import'));
  assert.ok(boot.indexOf('initializeFirestore') < boot.indexOf('await import'));
});

test('build publicado troca entrada direta pelo bootstrap offline com guard externo',()=>{
  assert.match(build,/offline-bootstrap\.mjs/);
  assert.match(build,/const bootGuardTag='<script id="central-runtime-boot-guard" src="\/Central-de-Controle-\/central-runtime-boot-guard\.js\?v=15\.1\.13\.48"><\/script>'/);
  assert.match(build,/source\.replace\(appTag,bootGuardTag\+'\\n'\+bootstrapTag\)/);
  assert.doesNotMatch(build,/const bootGuard=`<script/);
});

test('service worker guarda shell nativo, readiness completo, outbox H2 e SDK Firebase exato, sem wildcard CDN',()=>{
  for(const asset of ["BASE+'offline-bootstrap.mjs'","BASE+'app.js'","BASE+'cora-build-guard.js'","BASE+'central-runtime-boot-guard.js'","BASE+'root-entry.js'","BASE+'core/offline-readiness.mjs'","BASE+'core/firebase-sdk-preparation.mjs'","BASE+'core/offline-outbox.mjs'","BASE+'core/offline-domain-write.mjs'","BASE+'ames/console-view.mjs'","BASE+'ames/console-specialized-views.mjs'"]){
    assert.ok(sw.includes(asset),`asset offline ausente: ${asset}`);
  }
  for(const url of [
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js'
  ]) assert.ok(sw.includes(url),`Firebase offline ausente: ${url}`);
  assert.match(sw,/FIREBASE_SDK\.includes\(url\.href\)/);
  assert.doesNotMatch(sw,/gstatic\.com\/firebasejs\/10\.8\.0\/\*/);
  assert.match(sw,/credentials:'omit'/);
});

test('escritas operacionais offline usam outbox H2 por UID e replay composto atômico/idempotente',()=>{
  assert.match(app,/\.\/core\/offline-outbox\.mjs/);
  assert.match(app,/\.\/core\/offline-domain-write\.mjs/);
  assert.match(app,/queueOfflineWrite\('reports'/);
  assert.match(app,/queueOfflineWrite\('operationalFailures'/);
  assert.match(app,/offlineOutbox\.replay\(\{uid,write,sessionIsCurrent\}\)/);
  assert.match(app,/offlineWritePlan\(item\)/);
  assert.match(app,/const plan=offlineWritePlan\(item\),batch=writeBatch\(db\)/);
  assert.match(app,/batch\.set\(doc\(db,step\.collection,step\.documentId\),step\.payload\)/);
  assert.match(app,/batch\.update\(doc\(db,step\.collection,step\.documentId\),\{\[step\.field\]:arrayUnion\(step\.value\),updatedAt:step\.updatedAt\}\)/);
  assert.match(app,/routineFailureLinkEffect\(\{executionKey:origin\.executionKey,failureId:item\.id/);
  assert.match(app,/queueOfflineWrite\('operationalFailures',item,\{effects:routineEffect\?\[routineEffect\]:\[\]\}\)/);
  assert.match(app,/batch\.update\(doc\(db,'routineExecutions',routineEffect\.executionKey\),\{linkedFailureIds:arrayUnion\(routineEffect\.failureId\),updatedAt:routineEffect\.linkedAt\}\)/);
  assert.match(app,/window\.addEventListener\('online'/);
  assert.match(outbox,/dbApi\.open\(DB_NAME,DB_VERSION\)/);
  assert.match(outbox,/const DB_VERSION=2/);
  assert.match(outbox,/LEGACY_STORE='queue'/);
  assert.match(outbox,/item\.uid!==uid/);
  assert.match(outbox,/normalizeOfflineEffects\(effects,base\)/);
  assert.match(domain,/routine_failure_link/);
  assert.match(domain,/failureId do efeito não corresponde à falha offline/);
  assert.match(domain,/executionKey do efeito não corresponde à origem da falha/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,item\.collection\),item\.payload\)/);
  assert.equal(app.includes("const exec=dailyFindExecution(origin.executionKey),linked=[...new Set([...(exec?.linkedFailureIds||[]),item.id])]"),false);
});
