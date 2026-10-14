import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('ames/daily-failure-analytics.mjs','utf8');

test('failure ranking preview never truncates occurrences silently',()=>{
  assert.match(source,/const limit=250,visible=rows\.slice\(0,limit\),limited=rows\.length>limit/);
  assert.match(source,/Prévia: \$\{limit\} de \$\{rows\.length\} ocorrências/);
  assert.match(source,/Preview: \$\{limit\} of \$\{rows\.length\} occurrences/);
  assert.match(source,/Use “Ocorrências detalhadas” e os filtros para investigar o conjunto completo/);
  assert.match(source,/Use “Detailed occurrences” and filters to investigate the full set/);
});

test('detailed occurrence mode keeps its own explicit high-volume warning',()=>{
  assert.match(source,/rows\.slice\(0,800\)/);
  assert.match(source,/rows\.length>800/);
  assert.match(source,/Exibição limitada a 800 ocorrências neste modo/);
});
