import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nav=fs.readFileSync(new URL('../ames/console-sn-offline-navigation.mjs',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
const offline=fs.readFileSync(new URL('../ames/console-sn-offline-fastlane.mjs',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('offline SN KPIs navigate to existing local evidence without creating a new view',()=>{
  assert.match(nav,/data-sn-local-open/);
  assert.match(nav,/\['story','history','process','repair'\]/);
  assert.match(nav,/coverage/);
  assert.match(nav,/\['Enter',' '\]/);
  assert.match(nav,/scrollIntoView/);
  assert.match(view,/withOfflineSnNavigation\(withOfflineSnLookup/);
});

test('offline navigation reuses existing story, coverage and technical evidence',()=>{
  assert.match(nav,/\.ames-sn-local-story/);
  assert.match(nav,/\.ames-sn-own-history/);
  assert.match(nav,/\.ames-sn-process-story/);
  assert.match(nav,/\.ames-sn-repair-story/);
  assert.match(nav,/\.ames-sn-local-coverage-detail/);
  assert.match(nav,/\.ames-sn-local-raw/);
});

test('local lookup keeps correlation alerts and sanitized export',()=>{
  assert.match(offline,/renderSnCorrelationAlerts\(model,locale\(\)\)/);
  assert.match(offline,/cleanExport/);
  assert.match(offline,/password\|cookie\|credential\|token/);
  assert.match(offline,/ausência nesta base não prova ausência no A-MES atual/);
});

test('new offline navigation module is precached for workstation offline use',()=>{
  assert.match(sw,/ames\/console-sn-offline-navigation\.mjs/);
});
