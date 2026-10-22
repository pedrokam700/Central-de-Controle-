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
  assert.match(legacy,/<th>Falha<\/th><th>PCBA<\/th>/);
  assert.doesNotMatch(legacy,/<label>Defect Code<select data-top3-defect>/);
  assert.doesNotMatch(legacy,/<th>Código<\/th><th>Falha<\/th>/);
  assert.match(legacy,/Descrição humana em destaque/);

  const process = await read('ames/console-failure-process.mjs');
  const pcbaHeader=process.indexOf('<th>PCBA</th>');
  const failureHeader=process.indexOf("${t('Falha','Failure')}");
  const codeHeader=process.indexOf("${t('Código técnico','Technical code')}");
  assert(pcbaHeader>=0,'PCBA must remain the first technical identity column');
  assert(failureHeader>pcbaHeader,'human failure description must appear before the technical code');
  assert(codeHeader>failureHeader,'technical code must remain secondary to the human description');
  assert.match(process,/knownDescription\(row\.defect_desc\)\|\|row\.defect_code/);
});
