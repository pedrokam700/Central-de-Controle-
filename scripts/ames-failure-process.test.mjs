import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Falhas exibe contexto 3022 sem promover passagem a causa',()=>{
  const addon=fs.readFileSync('ames/console-failure-process.mjs','utf8');
  const shell=fs.readFileSync('ames/console-view.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  for(const text of [
    'Contexto 3022 das falhas',
    'Registro da falha no MES não define quando ela foi gerada.',
    'ocorrência → posto de referência 3022 → última passagem válida ≤ registro da falha.',
    'Registro da falha (MES)',
    'Posto de referência (3022)',
    'Horário de geração (3022)',
    'Turno comprovado (3022)',
    'Dia de produção (3022)',
    'Última passagem antes do registro',
    'Posto de retorno',
    'Horário do retorno',
    'Manual/Automatic descreve como a falha foi registrada após reteste/caracterização; não é o tipo de reparo.'
  ]) assert.ok(addon.includes(text),`missing current 3022 semantic contract: ${text}`);
  assert.match(addon,/snapshot\?\.process_timeline\?\.contexts/);
  assert.match(addon,/trustedProductionEvidence/);
  assert.match(addon,/genericReturnEvidence/);
  assert.match(addon,/reference_station_code/);
  assert.match(addon,/production_event_time/);
  assert.match(addon,/return_station_code/);
  assert.match(addon,/return_event_time/);
  assert.doesNotMatch(addon,/Retorno A5201|Horário real|Posto relevante/);
  assert.doesNotMatch(addon,/causa confirmada/i);
  assert.match(shell,/createFailureProcessAddon/);
  assert.match(shell,/data-failures-process/);
  assert.match(sw,/console-failure-process\.mjs/);
});
