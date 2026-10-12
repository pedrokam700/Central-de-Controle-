import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Falhas exibe contexto 3022 sem promover passagem a causa',()=>{
  const addon=fs.readFileSync('ames/console-failure-process.mjs','utf8');
  const shell=fs.readFileSync('ames/console-view.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  for(const text of ['Contexto 3022 das falhas','Defect Time é detecção/registro','última passagem válida ≤ Defect Time','Posto relevante','Horário real','Retorno A5201']) assert.ok(addon.includes(text));
  assert.match(addon,/snapshot\?\.process_timeline\?\.contexts/);
  assert.match(addon,/reference_station_code/);
  assert.match(addon,/reference_event_time/);
  assert.doesNotMatch(addon,/causa confirmada/i);
  assert.match(shell,/createFailureProcessAddon/);
  assert.match(shell,/data-failures-process/);
  assert.match(sw,/console-failure-process\.mjs/);
});
