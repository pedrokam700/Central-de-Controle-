import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console MES is one native full-screen shell over state.ames',()=>{
  const source=fs.readFileSync('ames/console-view.mjs','utf8');
  const css=fs.readFileSync('ames/console-legacy.css','utf8');
  assert.match(source,/console-legacy\.css/);
  assert.match(source,/console-wave2\.css/);
  assert.match(source,/console-wave3\.css/);
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
  assert.match(source,/console-wave3-views\.mjs/);
});

test('Wave 1 preserves R12 operational structure without simplifying it',()=>{
  const parity=fs.readFileSync('ames/console-legacy-parity.mjs','utf8');
  const automation=fs.readFileSync('ames/automation-view.mjs','utf8');
  const advanced=fs.readFileSync('ames/advanced-view.mjs','utf8');
  for(const text of ['Central das Linhas','Atualizar todas','Atualizar esta linha','Top 3 defeitos','Ocorrências da leitura','Evolução do dia','SN, código ou descrição','Repair N','Repair Y','Removida do export']) assert.match(parity,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Atualizar dia anterior','Atualizar agora','Iniciar monitoramento','Rastrear 3074 + 2114 + 3022','Atualizar N/Y','Baixar Excel']) assert.match(automation,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Catálogo','Tendências da linha','Backup local','Abrir Chrome/CDP','Histórico de jobs','Importações existentes','Configuração do posto']) assert.match(advanced,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('Wave 2 keeps SN trace and 3022 as one native investigation flow',()=>{
  const specialized=fs.readFileSync('ames/console-specialized-views.mjs','utf8');
  const css=fs.readFileSync('ames/console-wave2.css','utf8');
  for(const text of ['Consulta individual por SN','3074','2114','3022','Falha atual da PCBA','Falhas antigas da PCBA','Materiais em 2º uso ou mais','PCBAs anteriores/desvinculadas']) assert.match(specialized,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['full','process_only','reuse_only','Escopo desta coleta','Progresso da rastreabilidade','Evidência carregada']) assert.match(specialized,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Defect Time','última passagem concluída válida ≤ Defect Time','A5700','A5162','A5201','Manual/Automatic','Múltiplas passagens']) assert.match(specialized,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(css,/\.ames-sn-grid/);
  assert.match(css,/\.ames-trace-layout/);
  assert.match(css,/\.ames-process-kpis/);
});

test('Wave 3 keeps reuso Base local and CORA native and evidence-first',()=>{
  const views=fs.readFileSync('ames/console-wave3-views.mjs','utf8');
  const css=fs.readFileSync('ames/console-wave3.css','utf8');
  for(const text of ['Segundo uso da própria PCBA','segundo uso de Material SN','Abrir SNs exatos','ITEM EXATO EM EVIDÊNCIA','Drill-down não carregado']) assert.match(views,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['3028 · falhas','2114 · histórico PCBA','3074 · material/reuso','3022 · process_events','process_defect_contexts','Histórico operacional do agente','Backup']) assert.match(views,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['Fato / evidência','Correlação','Hipótese','Causa confirmada','não transforma correlação em causa']) assert.match(views,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(css,/\.ames-reuse-summary/);
  assert.match(css,/\.ames-base-actions/);
  assert.match(css,/\.ames-knowledge-list/);
});

test('offline package contains native parity modules and no parallel V0.5.23 runtime',()=>{
  const sw=fs.readFileSync('sw.js','utf8');
  const build=fs.readFileSync('scripts/build-static.mjs','utf8');
  assert.match(sw,/ames\/console-legacy-parity\.mjs/);
  assert.match(sw,/ames\/console-legacy\.css/);
  assert.match(sw,/ames\/console-wave2\.css/);
  assert.match(sw,/ames\/console-wave3\.css/);
  assert.match(sw,/ames\/console-specialized-views\.mjs/);
  assert.match(sw,/ames\/console-wave3-views\.mjs/);
  assert.doesNotMatch(sw,/v0523-loader|ames\/v0523/);
  assert.match(build,/name==='ames\/v0523'/);
});
