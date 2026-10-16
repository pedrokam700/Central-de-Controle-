import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Rastreabilidade preserves direct 2114 and 3074 evidence shortcuts',()=>{
  const source=fs.readFileSync('ames/agent-evidence-view.mjs','utf8');
  for(const text of ['Histórico PCBA · 2114','Materiais / reuso · 3074','Contextos históricos','Matriz de componentes']) assert.match(source,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/data-agent-dataset/);
  assert.match(source,/dataset=shortcut\.dataset\.agentDataset/);
  assert.match(source,/Batch Count não é reuso/);
});
