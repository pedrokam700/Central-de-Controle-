import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rankDailyFailures} from '../ames/daily-failure-analytics.mjs';

const summary=fs.readFileSync(new URL('../ames/daily-failure-summary.mjs',import.meta.url),'utf8');
const consoleView=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
const analytics=fs.readFileSync(new URL('../ames/daily-failure-analytics.mjs',import.meta.url),'utf8');

test('existing top3 route is renamed without creating a tenth Console view',()=>{
  assert.match(consoleView,/\['top3','↗','Falhas do dia & FPY','Falhas do dia & FPY'/);
  const canonical=(consoleView.match(/^\s*\['(?:monitor|top3|failures|sn|trace|reuse|process|base|knowledge)'/gm)||[]);
  assert.equal(canonical.length,9);
});

test('Top 3 stays a quick summary while selected failure opens expanded locally',()=>{
  assert.match(summary,/Top 3 & FPY · resumo rápido/);
  assert.match(summary,/data-daily-top3-defect/);
  assert.match(summary,/\[data-top3-analytics\] \[data-dfa="defect"\]/);
  assert.match(summary,/\[data-top3-analytics\] \[data-dfa-mode="ranking"\]/);
  assert.match(summary,/\.ames-dfa-rank-item/);
  assert.match(summary,/detail\.open=true/);
  assert.match(summary,/data-daily-open-ranking/);
  const openFailure=summary.slice(summary.indexOf('function openAnalyticsFailure'),summary.indexOf('function openFullRanking'));
  assert.doesNotMatch(openFailure,/store\.updateContext\?\.\(\{defect:/);
  assert.match(openFailure,/dispatchAnalytics\(select,String\(code\|\|''\)\)/);
  assert.match(summary,/syncContextToAnalytics\(\)/);
  assert.match(summary,/queueMicrotask\(\(\)=>\{/);
});

test('quick summary exposes reuse at three granularities and missing evidence is not false zero',()=>{
  assert.match(summary,/PCBAs · reuso \+ falha histórica/);
  assert.match(summary,/Famílias\/conjuntos históricos/);
  assert.match(summary,/Vínculos Material SN históricos/);
  assert.match(summary,/Sem evidência de reuso carregada aparece como —, não como zero/);
});

test('full failure ranking remains unlimited by Top 3',()=>{
  const rows=Array.from({length:7},(_,i)=>({
    pcba:`P${i}`,
    defect_code:`D${i}`,
    defect_desc:`Failure ${i}`,
    line:'TAN10101',
    production_shift:i%2?'1st Shift':'2nd Shift',
    reuse_with_failure:false,
    component_history_links:[],
  }));
  assert.equal(rankDailyFailures(rows).length,7);
  assert.match(analytics,/Ranking de falhas/);
  assert.match(analytics,/Ocorrências detalhadas/);
  assert.match(analytics,/Linha × turno/);
});
