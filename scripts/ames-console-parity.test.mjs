import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console MES is one native full-screen shell over state.ames',()=>{
  const source=fs.readFileSync('ames/console-view.mjs','utf8');
  const css=fs.readFileSync('ames/console-legacy.css','utf8');
  assert.match(source,/console-legacy\.css/);
  assert.match(source,/createAgentClient/);
  assert.match(source,/createAutomationView/);
  assert.match(source,/createAdvancedView/);
  assert.match(source,/createLineOverview/);
  assert.match(source,/createTop3ParityView/);
  assert.match(source,/createTrendAddon/);
  assert.match(source,/createFailuresParityView/);
  for(const fn of ['createSnConsoleView','createTraceConsoleView','createReuseConsoleView','createProcessConsoleView','createBaseConsoleView','createKnowledgeConsoleView']) assert.match(source,new RegExp(fn));
  assert.match(css,/\.ames-legacy-shell\{[^}]*position:fixed;inset:0;z-index:1200/);
  assert.match(css,/grid-template-columns:176px minmax\(0,1fr\)/);
  assert.doesNotMatch(source,/mountV0523|v0523-loader|new Function|<iframe|createElement\(['"]iframe|127\.0\.0\.1:8765/i);
});

test('all nine canonical views are mounted natively through one client',()=>{
  const source=fs.readFileSync('ames/console-view.mjs','utf8');
  for(const text of ['Monitoramento','Top 3 & FPY','Falhas','Consulta por SN','Rastreabilidade','Dashboards de reuso','Processo / 3022 & AT','Base local','CORA conhecimento']) assert.match(source,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal((source.match(/createAgentClient\(/g)||[]).length,1);
  assert.match(source,/const client=createAgentClient\(store/);
});

test('Wave 1 preserves R12 operational structure without simplifying it',()=>{
  const parity=fs.readFileSync('ames/console-legacy-parity.mjs','utf8');
  const automation=fs.readFileSync('ames/automation-view.mjs','utf8');
  const advanced=fs.readFileSync('ames/advanced-view.mjs','utf8');
  for(const text of ['Central das Linhas','Atualizar todas','Atualizar esta linha','Top 3 defeitos','Ocorrências da leitura','Evolução do dia','SN, código ou descrição','Repair N','Repair Y','Removida do export']) assert.match(parity,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Atualizar dia anterior','Atualizar agora','Iniciar monitoramento','Rastrear 3074 + 2114 + 3022','Atualizar N/Y','Baixar Excel']) assert.match(automation,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Catálogo','Tendências da linha','Backup local','Abrir Chrome/CDP','Histórico de jobs','Importações existentes','Configuração do posto']) assert.match(advanced,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('offline package contains native parity modules and no parallel V0.5.23 runtime',()=>{
  const sw=fs.readFileSync('sw.js','utf8');
  const build=fs.readFileSync('scripts/build-static.mjs','utf8');
  assert.match(sw,/ames\/console-legacy-parity\.mjs/);
  assert.match(sw,/ames\/console-legacy\.css/);
  assert.match(sw,/ames\/console-specialized-views\.mjs/);
  assert.doesNotMatch(sw,/v0523-loader|ames\/v0523/);
  assert.match(build,/name==='ames\/v0523'/);
});
