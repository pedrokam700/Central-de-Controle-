import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defectLabel } from '../ames/defect-label.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operator failure labels are description-first with code only as technical reference', () => {
  assert.equal(defectLabel('GN03-DC02','Sensor: proximity sensing test failed'),'Sensor: proximity sensing test failed — GN03-DC02');
  assert.equal(defectLabel('GN03-DC02',''),'GN03-DC02');
  assert.equal(defectLabel('', 'Earpiece: receiver noise/intermittent'),'Earpiece: receiver noise/intermittent');
});

test('main failure operator views do not require memorizing Defect Code', async () => {
  const legacy = await read('ames/console-legacy-parity.mjs');
  assert.match(legacy,/Falhas agrupadas/);
  assert.match(legacy,/data-failure-sort/);
  assert.match(legacy,/<th>Falha<\/th><th>Código técnico<\/th>/);
  assert.doesNotMatch(legacy,/<label>Defect Code<select data-top3-defect>/);
  assert.doesNotMatch(legacy,/<th>Código<\/th><th>Falha<\/th>/);
  assert.match(legacy,/Descrição humana em destaque; o código fica apenas como referência técnica/);

  const process = await read('ames/console-failure-process.mjs');
  assert.match(process,/<th>PCBA<\/th><th>Falha<\/th><th>Código técnico<\/th>/);
});
