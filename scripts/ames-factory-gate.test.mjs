import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gate físico permanece auditável, identifica o SHA do frontend e nunca vira GREEN apenas por CI',()=>{
  const runtime=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');
  const css=fs.readFileSync('ames/console-monitor-runtime.css','utf8');
  const build=fs.readFileSync('scripts/build-static.mjs','utf8');
  for(const text of [
    'Gate físico · posto de fábrica',
    'PRONTO PARA VALIDAR 9/9',
    'Shift 2114 automático',
    '3022 múltiplas passagens / retrabalho',
    '9/9 desktop + mobile',
    'Reboot / bootstrap',
    'Origem desta Central',
    'Frontend SHA',
    'GREEN físico somente após evidência no posto e aprovação do usuário.'
  ]) assert.ok(runtime.includes(text));
  assert.ok(runtime.includes('release-build.json'));
  assert.ok(runtime.includes('core.slice(0,6)'));
  assert.match(runtime,/process_timeline===true/);
  assert.ok(runtime.includes("!processReady?'PARCIAL · 3022 EM LOTE PENDENTE':'PRONTO PARA VALIDAR 9/9'"));
  assert.doesNotMatch(runtime,/GREEN físico.*CI.*success/i);
  assert.ok(build.includes('VERCEL_GIT_COMMIT_SHA'));
  assert.ok(build.includes('process.env.COMMIT'));
  assert.ok(build.includes('process.env.GITHUB_SHA'));
  assert.ok(build.includes("process.env.NETLIFY?'netlify'"));
  for(const cls of ['ames-factory-gate','ames-gate-pill','ames-gate-checks','ames-gate-proof']) assert.ok(css.includes(cls));
});
