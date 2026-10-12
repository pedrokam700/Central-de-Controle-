import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const monitor=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');

test('Central wires collector authority runtime as observe-only diagnostics',()=>{
  assert.match(app,/import \{createCollectorAuthorityRuntime\} from ['"]\.\/ames\/collector-authority-runtime\.mjs['"]/);
  assert.match(app,/runTransaction, serverTimestamp, arrayUnion/);
  assert.match(app,/createCollectorAuthorityRuntime\(state\.ames,\{/);
  assert.match(app,/collectorAuthorityRuntime\.refresh\(\{force:true\}\)/);
  assert.match(app,/collectorAuthorityRuntime\.refresh\(\)/);
  assert.ok((app.match(/collectorAuthorityRuntime\.clear\(\)/g)||[]).length>=2);
  assert.doesNotMatch(app,/collectorAuthorityRuntime\.(?:claim|confirmOwned|takeover|renew)\(/);
});

test('runtime wiring keeps claim and confirm capability out of app.js',()=>{
  assert.doesNotMatch(app,/createCollectorLeaseClient\(/);
  assert.doesNotMatch(app,/createCollectorLeaseObserver\(/);
  assert.doesNotMatch(app,/\.confirmOwned\(/);
  assert.doesNotMatch(app,/\.claim\(/);
});

test('offline shell contains complete collector runtime dependency chain',()=>{
  for(const asset of ['ames/collector-lease-client.mjs','ames/collector-lease-observer.mjs','ames/collector-authority-runtime.mjs'])assert.ok(sw.includes(asset),asset+' missing');
});

test('monitor labels collector authority explicitly as observation without enforcement',()=>{
  assert.match(monitor,/Autoridade multi-PC/);
  assert.match(monitor,/Somente observação · sem enforcement/);
  assert.match(monitor,/lease: este posto · não confirmado/);
  assert.match(monitor,/lease: outro coletor/);
  assert.doesNotMatch(monitor,/owner_uid|workstation_id|candidate_fence/);
});
