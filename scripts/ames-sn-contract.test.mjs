import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Consulta por SN envia somente SN e deixa linha CPH e Shift virem da fonte',()=>{
  const view=fs.readFileSync('ames/console-specialized-views.mjs','utf8');
  const client=fs.readFileSync('ames/agent-client.mjs','utf8');
  assert.match(view,/client\.collect\('sn',\{sn\}\)/);
  assert.match(view,/A consulta individual aceita somente a SN/);
  assert.match(view,/Linha.*detectada pela fonte/);
  assert.match(view,/CPH \/ modelo.*CPH exato retornado/);
  assert.match(view,/Shift 2114.*retorno automático/);
  const snBlock=view.slice(view.indexOf('export function createSnConsoleView'),view.indexOf('export function createTraceConsoleView'));
  assert.doesNotMatch(snBlock,/name="line"/);
  assert.doesNotMatch(snBlock,/name="performance"/);
  assert.doesNotMatch(snBlock,/scope\(/);
  assert.match(client,/const scope=type==='sn'\?null:collectionScope\(value\)/);
  assert.match(client,/body=\{sn:String\(value\.sn\|\|''\)\.trim\(\),include_3022:true\}/);
});
