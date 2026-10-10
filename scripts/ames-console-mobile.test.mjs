import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console mobile keeps one native shell with a closable drawer',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const css=fs.readFileSync('ames/console-mobile-polish.css','utf8');
  assert.match(view,/console-mobile-polish\.css/);
  assert.match(view,/data-console-menu-close/);
  assert.match(view,/aria-expanded="false"/);
  assert.match(view,/setMenu\(/);
  assert.match(css,/100dvh/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/overscroll-behavior-x:contain/);
  assert.match(css,/@media\(max-width:420px\)/);
});

test('3022 capability is visible at shell level and mobile asset is offline',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(view,/data-console-process/);
  assert.match(view,/process_timeline===true/);
  assert.match(view,/3022 em lote disponível/);
  assert.match(view,/3022 em lote indisponível/);
  assert.match(sw,/ames\/console-mobile-polish\.css/);
});
