import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const history=fs.readFileSync(new URL('../ames/console-history.mjs',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../ames/sync.mjs',import.meta.url),'utf8');
const firebase=fs.readFileSync(new URL('../ames/firebase-sync.mjs',import.meta.url),'utf8');

test('history UI allows refreshing an already collected period without replacing prior versions',()=>{
  assert.match(history,/Atualizar este período \(preservar histórico\)/);
  assert.match(history,/Abrir sem substituir atual/);
  assert.match(history,/Cada linha é uma versão preservada/);
  assert.match(history,/Hoje/);
  assert.match(history,/Último dia de produção/);
  assert.match(history,/não substitui o snapshot atual/);
});

test('history UI exposes exact snapshot revision and source metadata',()=>{
  assert.match(history,/snapshot_revision/);
  assert.match(history,/snapshot_id/);
  assert.match(history,/source_id/);
  assert.match(history,/process_contexts/);
});

test('sync history identity preserves distinct content revisions',()=>{
  assert.match(sync,/\[safe\.source_id,safe\.snapshot_id,safe\.snapshot_revision,hash\]/);
  assert.match(sync,/history:historyMetadata\(safe\)/);
  assert.match(firebase,/history',uid\+'_'\+head\.key/);
  assert.match(sync,/snapshot_revision!==h\.snapshot_revision/);
});

test('history refresh remains a custom period collection and does not mutate current snapshot directly',()=>{
  assert.match(history,/client\.collect\('custom'/);
  assert.doesNotMatch(history,/replaceSyncedSnapshots|replaceSnapshot|setSnapshot/);
});

test('calendar filters use factory timezone and avoid calendar-yesterday shortcut',()=>{
  assert.match(history,/America\/Sao_Paulo/);
  assert.match(history,/production_day_start/);
  assert.match(history,/non_production_dates/);
  assert.match(history,/extra_production_dates/);
  assert.match(history,/data-history-quick="-1"/);
  assert.match(history,/<details open/);
});
