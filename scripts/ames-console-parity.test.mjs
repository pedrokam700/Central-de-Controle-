import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console MES opens as a dedicated full-screen local-style shell',()=>{
  const source=fs.readFileSync('ames/console-view.mjs','utf8');
  const css=fs.readFileSync('ames/console-legacy.css','utf8');
  assert.match(source,/console-legacy\.css/);
  assert.match(source,/createLineOverview/);
  assert.match(source,/createTrendAddon/);
  assert.match(source,/createFailuresParityView/);
  assert.match(css,/\.ames-legacy-shell\{[^}]*position:fixed;inset:0;z-index:1200/);
  assert.match(css,/grid-template-columns:238px minmax\(0,1fr\)/);
  assert.doesNotMatch(source,/<iframe|createElement\(['"]iframe/i);
});

test('V0.5.22/V0.5.23 operational parity controls remain present',()=>{
  const parity=fs.readFileSync('ames/console-legacy-parity.mjs','utf8');
  const automation=fs.readFileSync('ames/automation-view.mjs','utf8');
  const advanced=fs.readFileSync('ames/advanced-view.mjs','utf8');
  for(const text of ['Central das Linhas','Atualizar todas as linhas','Atualizar esta linha','Evolução por snapshots','Atualizar evolução','SN, código ou descrição','Repair N','Repair Y','Removida do export']) assert.match(parity,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Atualizar dia anterior','Atualizar agora','Iniciar monitoramento','Rastrear 3074 + 2114 + 3022','Atualizar N/Y','Baixar Excel']) assert.match(automation,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Catálogo','Tendências da linha','Backup local','Abrir Chrome/CDP','Histórico de jobs','Importações existentes','Configuração do posto']) assert.match(advanced,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('offline cache includes the dedicated Console parity modules',()=>{
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(sw,/ames\/console-legacy-parity\.mjs/);
  assert.match(sw,/ames\/console-legacy\.css/);
  assert.match(sw,/ames\/console-specialized-views\.mjs/);
});
