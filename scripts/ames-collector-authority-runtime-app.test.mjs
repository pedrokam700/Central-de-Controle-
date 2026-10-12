import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const monitor=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');
const runtime=fs.readFileSync('ames/collector-authority-runtime.mjs','utf8');

test('Central keeps collector authority orchestration inside the dedicated runtime',()=>{
  assert.match(app,/import \{createCollectorAuthorityRuntime\} from ['"]\.\/ames\/collector-authority-runtime\.mjs['"]/);
  assert.match(app,/runTransaction, serverTimestamp, arrayUnion/);
  assert.match(app,/createCollectorAuthorityRuntime\(state\.ames,\{/);
  assert.match(app,/collectorAuthorityRuntime\.refresh\(\{force:true\}\)/);
  assert.match(app,/collectorAuthorityRuntime\.refresh\(\)/);
  assert.ok((app.match(/collectorAuthorityRuntime\.clear\(\)/g)||[]).length>=2);
  assert.doesNotMatch(app,/collectorAuthorityRuntime\.(?:claim|confirmOwned|takeover|renew)\(/);
});

test('app.js contains no direct lease client, observer, confirmation, claim or takeover logic',()=>{
  assert.doesNotMatch(app,/createCollectorLeaseClient\(/);
  assert.doesNotMatch(app,/createCollectorLeaseObserver\(/);
  assert.doesNotMatch(app,/createCollectorFenceConfirmation\(/);
  assert.doesNotMatch(app,/\.confirmOwned\(/);
  assert.doesNotMatch(app,/\.claim\(/);
  assert.doesNotMatch(app,/\.takeover\(/);
});

test('runtime confirms same-workstation lease internally but exposes no fence API to app',()=>{
  assert.match(runtime,/createCollectorFenceConfirmation/);
  assert.match(runtime,/confirmation\.confirm\(observation\)/);
  assert.match(runtime,/confirmedFences\.set\(line,confirmationResult\.publication_fence\)/);
  assert.doesNotMatch(runtime,/collectorFenceForLine/);
  assert.match(runtime,/no_sync_binding_no_enforcement/);
});

test('offline shell contains complete collector confirmation runtime dependency chain',()=>{
  for(const asset of ['ames/collector-lease-client.mjs','ames/collector-lease-observer.mjs','ames/collector-fence-confirmation.mjs','ames/collector-authority-runtime.mjs'])assert.ok(sw.includes(asset),asset+' missing');
});

test('monitor distinguishes server confirmation while stating no enforcement',()=>{
  assert.match(monitor,/Autoridade multi-PC/);
  assert.match(monitor,/Observa \+ confirma o próprio lease · sem enforcement/);
  assert.match(monitor,/lease: este posto · confirmado no servidor/);
  assert.match(monitor,/lease: este posto · não confirmado/);
  assert.match(monitor,/lease: outro coletor/);
  assert.doesNotMatch(monitor,/owner_uid|workstation_id|candidate_fence|publication_fence/);
});
