import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gate físico permanece auditável e nunca vira GREEN apenas por CI ou capacidade técnica',()=>{
  const runtime=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');
  const css=fs.readFileSync('ames/console-monitor-runtime.css','utf8');
  for(const text of [
    'Gate físico · posto de fábrica',
    'PRONTO PARA VALIDAR 9/9',
    'Shift 2114 automático',
    '3022 múltiplas passagens / retrabalho',
    '9/9 desktop + mobile',
    'Reboot / bootstrap',
    'Origem desta Central',
    'GREEN físico somente após evidência no posto e aprovação do usuário.'
  ]) assert.match(runtime,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(runtime,/process_timeline===true/);
  assert.match(runtime,/!processReady\?'PARCIAL · 3022 EM LOTE PENDENTE':'PRONTO PARA VALIDAR 9\/9'/);
  assert.doesNotMatch(runtime,/GREEN físico.*CI.*success/i);
  for(const cls of ['ames-factory-gate','ames-gate-pill','ames-gate-checks','ames-gate-proof']) assert.match(css,new RegExp(cls));
});
