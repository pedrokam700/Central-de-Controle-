import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const boot=fs.readFileSync('offline-bootstrap.mjs','utf8');
const build=fs.readFileSync('scripts/build-static.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const app=fs.readFileSync('app.js','utf8');

test('Firestore persistente e iniciado antes do app.js',()=>{
  assert.match(boot,/initializeFirestore/);
  assert.match(boot,/persistentLocalCache/);
  assert.match(boot,/persistentMultipleTabManager/);
  assert.match(boot,/await import\(`\.\/app\.js\?v=\$\{BUILD\}`\)/);
  assert.ok(boot.indexOf('initializeFirestore') < boot.indexOf('await import'));
});

test('build publicado troca entrada direta pelo bootstrap offline',()=>{
  assert.match(build,/offline-bootstrap\.mjs/);
  assert.match(build,/source\.replace\(appTag,bootGuard\+'\\n'\+bootstrapTag\)/);
});

test('service worker guarda bootstrap, app e views nativas',()=>{
  for(const asset of ["BASE+'offline-bootstrap.mjs'","BASE+'app.js'","BASE+'ames/console-view.mjs'","BASE+'ames/console-specialized-views.mjs'"]){
    assert.ok(sw.includes(asset),`asset offline ausente: ${asset}`);
  }
});

test('escritas operacionais offline continuam enfileiradas localmente',()=>{
  assert.match(app,/queueOfflineWrite\('reports'/);
  assert.match(app,/queueOfflineWrite\('operationalFailures'/);
  assert.match(app,/indexedDB\.open\(OFFLINE_DB_NAME/);
  assert.match(app,/window\.addEventListener\('online'/);
});
