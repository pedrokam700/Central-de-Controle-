import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const consoleView=fs.readFileSync('ames/console-view.mjs','utf8');
const wave3=fs.readFileSync('ames/console-wave3-views.mjs','utf8');
const architecture=fs.readFileSync('docs/ames/ACTIVE_ARCHITECTURE_MAP.md','utf8');
const gated=fs.readFileSync('docs/ames/IDEIAS_GATED_USUARIO_2026-10-13.md','utf8');

test('Console keeps one canonical Base Local implementation and exactly nine routes',()=>{
  assert.match(consoleView,/import \{ createBaseConsoleView \} from '\.\/console-base-view\.mjs';/);
  assert.doesNotMatch(consoleView,/createBaseConsoleView[^\n]*from '\.\/console-wave3-views\.mjs'/);
  assert.doesNotMatch(wave3,/export function createBaseConsoleView\b/,'legacy wave3 module must not keep a second Base Local implementation');
  assert.doesNotMatch(wave3,/const BASE_ACTIONS\b/,'legacy wave3 module must not keep dead Base Local action registry');
  const ids=[...consoleView.matchAll(/\['(monitor|top3|failures|sn|trace|reuse|process|base|knowledge)'\s*,/g)].map(match=>match[1]);
  assert.deepEqual(ids.slice(0,9),['monitor','top3','failures','sn','trace','reuse','process','base','knowledge']);
  assert.equal(new Set(ids.slice(0,9)).size,9);
  assert.match(consoleView,/R12 · 9 views/);
});

test('user-gated ideas remain documented but do not become Console routes',()=>{
  for(const title of ['Hotspot de processo','Investigações','Genealogia visual de uma placa']){
    assert.match(gated,new RegExp(title));
  }
  assert.match(gated,/GATED_BY_USER_DESIGN/);
  for(const forbidden of ['hotspot','investigations','investigacoes','genealogy','genealogia']){
    assert.doesNotMatch(consoleView,new RegExp(`data-console-view=["']${forbidden}["']`,'i'));
  }
});

test('architecture map keeps single-agent single-store rules explicit',()=>{
  for(const contract of [
    'Uma Central, um `state.ames`, um agente local, um SQLite e um scheduler.',
    'Não criar iframe, loader, proxy ou segundo store para resolver feature nova.',
    '`production_day_start` é limite do dia de coleta; `work_shifts` classifica turno.',
    'Local primeiro:'
  ]) assert.ok(architecture.includes(contract),`missing architecture contract: ${contract}`);
});
