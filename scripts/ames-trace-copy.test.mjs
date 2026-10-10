import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rastreabilidade só declara ausência 3022 quando não há evento válido e não inventa reuso',()=>{
  const code=fs.readFileSync('ames/trace-view.mjs','utf8');
  assert.match(code,/model\.process\.event\s*\?/);
  assert.match(code,/último evento válido anterior\/igual ao Defect Time/);
  assert.match(code,/nenhum evento válido carregado para esta ocorrência/);
  assert.match(code,/Batch Count não é contagem de uso\/reuso/);
  assert.match(code,/Reuso da PCBA e reuso de componente só podem ser afirmados quando a evidência correspondente estiver carregada/);
  assert.doesNotMatch(code,/Nenhum reuso é confirmado neste recorte/);
  assert.doesNotMatch(code,/Sem evento disponível para esta ocorrência/);
});
