import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const readiness=fs.readFileSync('core/offline-readiness.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const server=fs.readFileSync('tools/ames-workstation/serve-staged-frontend.py','utf8');
const state=fs.readFileSync('tools/ames-workstation/frontend-local-state.py','utf8');

const CANONICAL_PATH='/Central-de-Controle-/';
const SW_PATH=CANONICAL_PATH+'sw.js';

test('app registration readiness lookup and Service Worker BASE share the exact canonical path',()=>{
  assert.ok(app.includes(`navigator.serviceWorker.register('${SW_PATH}',{updateViaCache:'none'})`));
  assert.ok(readiness.includes(`getRegistration?.('${CANONICAL_PATH}')`));
  assert.ok(sw.includes(`const BASE='${CANONICAL_PATH}';`));
  assert.doesNotMatch(app,/serviceWorker\.register\(['"]\/sw\.js/);
  assert.doesNotMatch(readiness,/getRegistration\?\.\(['"]\/(?!Central-de-Controle\/)/);
});

test('verified local server is loopback-only and advertises the same canonical path without becoming launcher default',()=>{
  assert.match(server,/HOST = "127\.0\.0\.1"/);
  assert.ok(server.includes(`"canonical_path": "${CANONICAL_PATH}"`));
  assert.ok(server.includes('"launcher_default": False'));
  assert.ok(server.includes('"stage_activated": False'));
  assert.ok(server.includes('CORA/API externa permanece desativada nesta origem local'));
  assert.ok(server.includes('".js": "text/javascript"'));
  assert.ok(server.includes('".mjs": "text/javascript"'));
});

test('local activation contract remains state-only and does not rewrite the canonical Service Worker path',()=>{
  assert.match(state,/127\.0\.0\.1/);
  assert.doesNotMatch(state,/serviceWorker\.register|sw\.js/);
  assert.doesNotMatch(state,/launcher_default\s*=\s*True/);
});

test('current Service Worker shell contains the readiness dependency chain needed after preparation',()=>{
  for(const asset of [
    "BASE+'offline-bootstrap.mjs'",
    "BASE+'core/offline-readiness.mjs'",
    "BASE+'core/firebase-sdk-preparation.mjs'"
  ])assert.ok(sw.includes(asset),`missing local-origin offline asset ${asset}`);
  assert.match(sw,/self\.clients\.claim\(\)/);
  assert.match(sw,/skipWaiting\(\)/);
});
