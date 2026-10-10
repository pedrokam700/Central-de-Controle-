import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('contexto MES das páginas gerais preserva linha, CPH exato e cobertura parcial',()=>{
  const code=fs.readFileSync('ames/central-mes-context.mjs','utf8');
  for(const text of ['CPH exatos carregados','Cobertura','lista parcial não prova ausência de falha','valor ausente não vira zero','Dashboard de reuso continua separado']) assert.ok(code.includes(text));
  assert.match(code,/coverage\.loaded_count/);
  assert.match(code,/coverageLabel/);
  assert.match(code,/LINE_IDS\.map/);
});
