import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Monitoramento keeps R12 pipeline and motor status without a second app',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const runtime=fs.readFileSync('ames/console-monitor-runtime.mjs','utf8');
  const css=fs.readFileSync('ames/console-monitor-runtime.css','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/createMonitorRuntimeView/);
  for(const stage of ['3028','3074','2114','3022']) assert.match(runtime,new RegExp(stage));
  for(const label of ['Pipeline da execução','Estado do motor','Chrome CDP','Rede A-MES','3022 em lote']) assert.match(runtime,new RegExp(label));
  assert.match(runtime,/LINE_IDS\.map/);
  assert.match(runtime,/process_timeline===true/);
  assert.match(css,/\.ames-runtime-pipeline/);
  assert.match(sw,/ames\/console-monitor-runtime\.mjs/);
  assert.match(sw,/ames\/console-monitor-runtime\.css/);
  assert.doesNotMatch(runtime,/iframe|ShadowRoot|new Function/);
});
