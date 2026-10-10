import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withProcessCapability } from '../ames/console-capability-guard.mjs';

test('process_only is fail-closed when agent has no batch 3022 capability',()=>{
  const client=fs.readFileSync('ames/agent-client.mjs','utf8');
  assert.equal(typeof withProcessCapability,'function');
  assert.match(client,/value\.trace_mode==='process_only'/);
  assert.match(client,/capabilities\?\.process_timeline!==true/);
  assert.match(client,/process_only exige coleta 3022 em lote/);
  assert.doesNotMatch(client,/request\('\/preflight'\)/);
});

test('UI explains partial 3022 instead of advertising unsupported collection',()=>{
  const guard=fs.readFileSync('ames/console-capability-guard.mjs','utf8');
  const css=fs.readFileSync('ames/console-wave2.css','utf8');
  assert.match(guard,/3022 será marcado como indisponível/);
  assert.match(guard,/consulta individual ainda pode tentar a tela 3022/i);
  assert.match(guard,/radio\.disabled=!ready/);
  assert.match(css,/ames-capability-disabled/);
});

test('parallel V0.5.23 runtime is physically absent from the active branch',()=>{
  const build=fs.readFileSync('scripts/build-static.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.equal(fs.existsSync('ames/v0523-loader.mjs'),false);
  assert.equal(fs.existsSync('ames/v0523'),false);
  assert.doesNotMatch(build,/ames\/v0523|v0523-loader/);
  assert.doesNotMatch(sw,/ames\/v0523|v0523-loader/);
});
