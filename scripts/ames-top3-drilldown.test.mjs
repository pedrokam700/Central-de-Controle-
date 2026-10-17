import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('ames/daily-failure-summary.mjs','utf8');

function functionBody(name,nextName){
  const start=source.indexOf(`function ${name}`);
  assert.notEqual(start,-1,`${name} not found`);
  const end=nextName?source.indexOf(`function ${nextName}`,start):source.length;
  assert.notEqual(end,-1,`${nextName} not found`);
  return source.slice(start,end);
}

test('Top 3 drill-down does not collapse the shared Top 3 context',()=>{
  const body=functionBody('openAnalyticsFailure','openFullRanking');
  assert.doesNotMatch(body,/store\.updateContext\?\.\(\{defect:/);
  assert.match(body,/dispatchAnalytics\(select,String\(code\|\|''\)\)/);
  assert.match(body,/data-dfa-mode=\\"ranking\\"/);
});

test('Top 3 drill-down opens the selected failure detail immediately',()=>{
  const body=functionBody('openAnalyticsFailure','openFullRanking');
  assert.match(body,/\.ames-dfa-rank-item/);
  assert.match(body,/detail\.open=true/);
  assert.match(body,/scrollIntoView/);
});

test('return to full ranking clears only the local analytics defect filter',()=>{
  const body=functionBody('openFullRanking','render');
  assert.doesNotMatch(body,/store\.updateContext\?\.\(\{defect:/);
  assert.match(body,/dispatchAnalytics\(defect,''\)/);
  assert.match(body,/data-dfa-mode=\\"ranking\\"/);
});
