import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Base local pode carregar datasets declarados pelo agente sem inventar nomes',()=>{
  const code=fs.readFileSync('ames/console-base-catalog.mjs','utf8');
  const shell=fs.readFileSync('ames/console-view.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(code,/client\.auxiliary\('catalog'/);
  assert.match(code,/result\?\.datasets/);
  assert.match(code,/row\?\.dataset\|\|row\?\.name/);
  assert.match(code,/Nenhum dataset foi inventado/);
  assert.match(code,/LINE_IDS\.includes/);
  assert.match(shell,/withBaseCatalog\(createBaseConsoleView/);
  assert.match(sw,/ames\/console-base-catalog\.mjs/);
});

test('atalho Configurar posto restaura acesso direto da automação local sem segunda app',()=>{
  const shell=fs.readFileSync('ames/console-view.mjs','utf8');
  assert.match(shell,/data-console-setup>Configurar posto/);
  assert.match(shell,/openWorkstationSetup/);
  assert.match(shell,/switchView\('monitor'\)/);
  assert.match(shell,/Configuração do posto/);
  assert.match(shell,/data-monitor-tools/);
  assert.doesNotMatch(shell,/iframe|new Function|attachShadow/);
});
