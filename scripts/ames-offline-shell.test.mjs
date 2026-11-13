import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

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
    assert.match(index,/offline-bootstrap\.mjs\?v=15\.1\.13\.54/);
    assert.doesNotMatch(index,/src="\/Central-de-Controle-\/app\.js\?v=15\.1\.13\.54"/);
    assert.match(app,/getApps\(\)\.length\s*\?\s*getApp\(\)\s*:\s*initializeApp\(firebaseConfig\)/);
    assert.match(bootstrap,/browserLocalPersistence/);
    assert.match(bootstrap,/persistentLocalCache/);
    assert.match(bootstrap,/\.\/app\.js\?v=/);
    assert.match(sw,/offline-bootstrap\.mjs/);
    assert.match(sw,/firebase-auth\.js/);
    assert.match(sw,/firebase-firestore\.js/);
    assert.ok(fs.existsSync(path.join(base,'ames','at-viewer','index.html')),
      'isolated AT viewer HTML must be included in the integrated static package');
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
});

test('rules permitem bootstrap do próprio perfil sem abrir listagem pública',()=>{
  const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
  assert.match(rules,/allow get:\s*if \(signedIn\(\) && request\.auth\.uid == userId\) \|\| activeUser\(\);/);
  assert.match(rules,/allow list:\s*if activeUser\(\);/);
  assert.match(rules,/allow create:\s*if signedIn\(\)[\s\S]*request\.auth\.uid == userId/);
});

test('a new waiting PWA update cannot be hidden by a previous pending marker',()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const begin=app.indexOf('function offerCentralWebUpdate(');
  const finish=app.indexOf('function registerOfflineSupport(',begin);
  assert.ok(begin>=0&&finish>begin,'update UI function must exist');
  const shown=[];
  const node=()=>({dataset:{},style:{},setAttribute(){},addEventListener(){},append(){}});
  const sandbox={
    document:{querySelector(){return null;},createElement:node,body:{append(item){shown.push(item);}}},
    localStorage:{getItem(){return 'pending';},setItem(){}},
    navigator:{serviceWorker:{controller:true}},
    location:{reload(){}},
  };
  vm.runInNewContext(app.slice(begin,finish)+
    '\nofferCentralWebUpdate("pending",{waiting:{postMessage(){}}});',sandbox);
  assert.equal(shown.length,1,'a new waiting worker must show its update prompt despite old localStorage pending');
  assert.equal(shown[0].dataset.centralUpdateReady,'');
});
