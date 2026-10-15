import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../ames/console-specialized-views.mjs',import.meta.url),'utf8');

test('process specialized view sanitizes production fields through canonical trust helper',()=>{
  assert.match(src,/trustedProductionEvidence/);
  assert.match(src,/safeProcessContext/);
  assert.match(src,/production_evidence_proven/);
  assert.match(src,/Posto de referência \(3022\)/);
  assert.match(src,/Horário de geração \(3022\)/);
  assert.match(src,/Turno comprovado \(3022\)/);
  assert.match(src,/Dia de produção \(3022\)/);
});

test('return is generic and legacy A5201 is not used as operational return field',()=>{
  assert.match(src,/genericReturnEvidence/);
  assert.match(src,/Posto de retorno/);
  assert.match(src,/Horário do retorno/);
  assert.doesNotMatch(src,/\['return_a5201_event_time','Retorno A5201'\]/);
  assert.match(src,/A5201 é apenas um possível posto, nunca uma regra fixa/);
});

test('raw 3022 timeline remains passage evidence, not failure generation',()=>{
  assert.match(src,/Horário da passagem 3022/);
  assert.match(src,/Turno da passagem 3022/);
  assert.match(src,/não são automaticamente o ponto de geração da falha/);
});

test('unknown shift cannot manufacture an empty process slice',()=>{
  assert.match(src,/shiftEvidence=scope\.contexts\.some\(r=>r\.production_evidence_proven&&r\.production_shift\)/);
  assert.match(src,/!shift\|\|!shiftEvidence\|\|r\.production_shift===shift/);
});
