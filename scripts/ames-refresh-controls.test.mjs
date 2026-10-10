import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('operational views preserve explicit refresh without starting new MES collection',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const decorator=fs.readFileSync('ames/console-refresh-decorator.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/withAgentRefresh/);
  assert.match(view,/label:'Atualizar'/);
  assert.match(view,/label:'Atualizar tela'/);
  assert.match(decorator,/client\.refresh\(\)/);
  assert.doesNotMatch(decorator,/client\.collect\(/);
  assert.match(decorator,/Atualizando snapshot local/);
  assert.match(decorator,/Leitura atualizada/);
  assert.match(sw,/ames\/console-refresh-decorator\.mjs/);
});
