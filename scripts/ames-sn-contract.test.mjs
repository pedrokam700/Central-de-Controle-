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
  assert.match(view,/Shift 2114.*seleção automática é validada no gate físico/);
  const snBlock=view.slice(view.indexOf('export function createSnConsoleView'),view.indexOf('export function createTraceConsoleView'));
  assert.doesNotMatch(snBlock,/name="line"/);
  assert.doesNotMatch(snBlock,/name="performance"/);
  assert.doesNotMatch(snBlock,/scope\(/);
  assert.match(client,/const scope=type==='sn'\?null:collectionScope\(value\)/);
  assert.match(client,/body=\{sn:String\(value\.sn\|\|''\)\.trim\(\),include_3022:true\}/);
});

test('Consulta SN distingue dimensão indisponível de zero realmente retornado',()=>{
  const view=fs.readFileSync('ames/console-specialized-views.mjs','utf8');
  for(const text of ['3074 ausente na resposta','2114 ausente na resposta','3022 ausente na resposta','indisponível','ausência não equivale a zero','não converter ausência de fonte em zero de reuso','não mostrar zero como se a tela tivesse sido consultada com sucesso']) assert.ok(view.includes(text),text);
  assert.match(view,/has3074\?reused\.length:'indisponível'/);
  assert.match(view,/has2114\?previous\.length:'indisponível'/);
  assert.match(view,/const processCount=has3022\?/);
});
