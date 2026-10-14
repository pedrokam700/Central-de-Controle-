import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rastreabilidade mantém código interno e mostra descrição humana como leitura principal',async()=>{
  const source=fs.readFileSync('ames/console-trace-scope.mjs','utf8');
  const mod=await import('../ames/console-trace-scope.mjs');
  const rows={A:[{defect_code:'GN01-TX01',defect_desc:'Antenna: ANT0 test failed'},{defect_code:'GN01-TX01',defect_desc:'Antenna: ANT0 test failed'}]};
  const failures=mod.loadedFailures({read:line=>({snapshot:{occurrences:rows[line]}})},['A']);
  assert.deepEqual(failures,[{code:'GN01-TX01',description:'Antenna: ANT0 test failed',count:2}]);
  assert.match(source,/value="\$\{esc\(item\.code\)\}" data-trace-code/);
  assert.match(source,/<strong>\$\{esc\(defectDescription\(item\.description\)\)\}<\/strong>/);
  assert.doesNotMatch(source,/\$\{esc\(item\.code\)\} — \$\{esc\(defectDescription/);
  assert.match(source,/Detalhes técnicos/);
  assert.match(source,/2114 aguardando confirmação de turno/);
});

test('consulta por SN preserva evidência nova em navegação por abas e resumo operacional',async()=>{
  const source=fs.readFileSync('ames/console-fastlane-sn-reuse.mjs','utf8');
  await import('../ames/console-fastlane-sn-reuse.mjs');
  for(const token of ['data-sn-operator-shell','data-sn-tab="summary"','data-sn-tab="failure"','data-sn-tab="materials"','data-sn-tab="history"','data-sn-tab="process"','data-sn-tab="repair"','data-sn-tab="technical"'])assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/Ausência de fonte aparece como —, não como zero/);
  assert.match(source,/trace_3012/);
  assert.match(source,/trace_2114/);
  assert.match(source,/trace_3074/);
  assert.match(source,/trace_3022/);
});

test('polimento mantém dashboard rápido antes da granularidade e CORA com arquitetura sob demanda',()=>{
  const css=fs.readFileSync('ames/console-improvements.css','utf8');
  const knowledge=fs.readFileSync('ames/console-knowledge-architecture.mjs','utf8');
  assert.match(css,/ames-reuse-group\{order:2/);
  assert.match(css,/ames-reuse-granularity\{order:4/);
  assert.match(css,/ames-sn-kpi-row/);
  assert.match(css,/ames-trace-failure-option/);
  assert.match(knowledge,/createElement\('details'\)/);
  assert.match(knowledge,/Como a CORA usa os dados/);
});

test('processo e base local mostram leitura operacional sem descartar campos técnicos',()=>{
  const process=fs.readFileSync('ames/console-process-operator.mjs','utf8');
  const base=fs.readFileSync('ames/console-base-view.mjs','utf8');
  const shell=fs.readFileSync('ames/console-view.mjs','utf8');
  const css=fs.readFileSync('ames/console-operator-parity.css','utf8');
  assert.match(process,/PRIMARY_HEADERS/);
  assert.match(process,/Colunas técnicas/);
  assert.match(process,/Why this rule exists/);
  assert.match(base,/OPERATIONAL_COLUMNS/);
  assert.match(base,/technicalColumns/);
  assert.match(base,/Nenhum dado foi removido/);
  assert.match(shell,/withProcessOperatorLayout/);
  assert.match(shell,/console-operator-parity\.css/);
  assert.match(css,/ames-reuse-line-tabs/);
  assert.match(css,/ames-process-operator-note/);
  assert.match(css,/ames-base-operational-note/);
});
