import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const boot=fs.readFileSync('offline-bootstrap.mjs','utf8');
const build=fs.readFileSync('scripts/build-static.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const outbox=fs.readFileSync('core/offline-outbox.mjs','utf8');

test('Auth e Firestore persistentes são preparados antes do app.js',()=>{
  assert.match(boot,/setPersistence\(getAuth\(app\),browserLocalPersistence\)/);
  assert.match(boot,/initializeFirestore/);
  assert.match(boot,/persistentLocalCache/);
  assert.match(boot,/persistentMultipleTabManager/);
  assert.match(boot,/await import\(`\.\/app\.js\?v=\$\{BUILD\}`\)/);
  assert.ok(boot.indexOf('setPersistence') < boot.indexOf('await import'));
  assert.ok(boot.indexOf('initializeFirestore') < boot.indexOf('await import'));
});

test('build publicado troca entrada direta pelo bootstrap offline',()=>{
  assert.match(build,/offline-bootstrap\.mjs/);
  assert.match(build,/source\.replace\(appTag,bootGuard\+'\\n'\+bootstrapTag\)/);
});

test('service worker guarda shell nativo, outbox H2 e SDK Firebase exato, sem wildcard CDN',()=>{
  for(const asset of ["BASE+'offline-bootstrap.mjs'","BASE+'app.js'","BASE+'core/offline-outbox.mjs'","BASE+'ames/console-view.mjs'","BASE+'ames/console-specialized-views.mjs'"]){
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

test('escritas operacionais offline usam outbox H2 por UID e replay idempotente',()=>{
  assert.match(app,/\.\/core\/offline-outbox\.mjs/);
  assert.match(app,/queueOfflineWrite\('reports'/);
  assert.match(app,/queueOfflineWrite\('operationalFailures'/);
  assert.match(app,/offlineOutbox\.replay\(\{uid,write,sessionIsCurrent\}\)/);
  assert.match(app,/setDoc\(doc\(db,item\.collection,item\.documentId\),item\.payload\)/);
  assert.match(app,/window\.addEventListener\('online'/);
  assert.match(outbox,/dbApi\.open\(DB_NAME,DB_VERSION\)/);
  assert.match(outbox,/const DB_VERSION=2/);
  assert.match(outbox,/LEGACY_STORE='queue'/);
  assert.match(outbox,/item\.uid!==uid/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,item\.collection\),item\.payload\)/);
});
