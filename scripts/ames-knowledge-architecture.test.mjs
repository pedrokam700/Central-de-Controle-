import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CORA knowledge keeps R11 architecture panel while using the native base',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const arch=fs.readFileSync('ames/console-knowledge-architecture.mjs','utf8');
  const css=fs.readFileSync('ames/console-knowledge-architecture.css','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/withKnowledgeArchitecture/);
  for(const text of ['Arquitetura de dados','Fonte de verdade local','Índice CORA','Por linha','Contexto sob demanda','mesma base operacional']) assert.match(arch,new RegExp(text));
  assert.match(css,/\.ames-knowledge-architecture-grid/);
  assert.match(sw,/ames\/console-knowledge-architecture\.mjs/);
  assert.match(sw,/ames\/console-knowledge-architecture\.css/);
  assert.doesNotMatch(arch,/iframe|ShadowRoot|new Function/);
});
