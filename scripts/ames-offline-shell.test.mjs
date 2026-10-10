import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve('.');

test('build publicado inicializa persistência antes do app e mantém base path',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-offline-'));
  try{
    const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{
      cwd:root,encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,COMMIT:'offline-test-sha',BRANCH:'offline-test'}
    });
    assert.equal(run.status,0,run.stderr||run.stdout);
    const base=path.join(out,'Central-de-Controle-');
    const index=fs.readFileSync(path.join(base,'index.html'),'utf8');
    const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
    const bootstrap=fs.readFileSync(path.join(base,'offline-bootstrap.mjs'),'utf8');
    const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');
    assert.match(index,/offline-bootstrap\.mjs\?v=15\.1\.13\.48/);
    assert.doesNotMatch(index,/src="\/Central-de-Controle-\/app\.js\?v=15\.1\.13\.48"/);
    assert.match(app,/getApps\(\)\.length\s*\?\s*getApp\(\)\s*:\s*initializeApp\(firebaseConfig\)/);
    assert.match(bootstrap,/browserLocalPersistence/);
    assert.match(bootstrap,/persistentLocalCache/);
    assert.match(bootstrap,/\.\/app\.js\?v=/);
    assert.match(sw,/offline-bootstrap\.mjs/);
    assert.match(sw,/firebase-auth\.js/);
    assert.match(sw,/firebase-firestore\.js/);
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
});

test('rules permitem bootstrap do próprio perfil sem abrir listagem pública',()=>{
  const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
  assert.match(rules,/allow get:\s*if \(signedIn\(\) && request\.auth\.uid == userId\) \|\| activeUser\(\);/);
  assert.match(rules,/allow list:\s*if activeUser\(\);/);
  assert.match(rules,/allow create:\s*if signedIn\(\)[\s\S]*request\.auth\.uid == userId/);
});
