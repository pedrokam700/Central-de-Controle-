import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('views com refresh exibem proveniência sem aproximar CPH nem converter ausência em zero',()=>{
  const code=fs.readFileSync('ames/console-refresh-decorator.mjs','utf8');
  const css=fs.readFileSync('ames/console-r12-fidelity.css','utf8');
  for(const text of ['snapshot ','origem ','cobertura ','CPH não informado','sem snapshot · ausência não equivale a zero']) assert.ok(code.includes(text));
  assert.match(code,/snapshot\.product_model\|\|snapshot\.cph\|\|snapshot\.product/);
  assert.match(code,/snapshot\.coverage\?\.status/);
  assert.match(code,/LINE_IDS\.includes/);
  assert.match(css,/ames-native-provenance/);
});
