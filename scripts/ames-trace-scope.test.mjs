import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Rastreabilidade oferece seleção visual usando somente Defect Codes carregados',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const helper=fs.readFileSync('ames/console-trace-scope.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/withTraceSelectionHelper/);
  assert.match(helper,/\[name=lines\]:checked/);
  assert.match(helper,/snapshot\?\.occurrences/);
  assert.match(helper,/row\.defect_code/);
  assert.match(helper,/Todas/);
  assert.match(helper,/Selecionadas/);
  assert.match(helper,/\[name=codes\]/);
  assert.match(helper,/join\(', '\)/);
  assert.doesNotMatch(helper,/client\.|collect\(|fetch\(|auxiliary\(/);
  assert.match(sw,/ames\/console-trace-scope\.mjs/);
});
