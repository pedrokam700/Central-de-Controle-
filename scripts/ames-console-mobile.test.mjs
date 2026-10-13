import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console native shell restores R12 desktop proportions and keeps mobile drawer',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const mobile=fs.readFileSync('ames/console-mobile-polish.css','utf8');
  const fidelity=fs.readFileSync('ames/console-r12-fidelity.css','utf8');
  assert.match(view,/console-mobile-polish\.css/);
  assert.match(mobile,/console-r12-fidelity\.css/);
  assert.match(fidelity,/grid-template-columns:238px minmax\(0,1fr\)/);
  assert.match(fidelity,/min-height:76px/);
  assert.match(fidelity,/max-width:1620px/);
  assert.match(fidelity,/table\{min-width:1100px/);
  assert.match(view,/data-console-menu-close/);
  assert.match(view,/aria-expanded="false"/);
  assert.match(view,/setMenu\(/);
  assert.match(mobile,/100dvh/);
  assert.match(mobile,/safe-area-inset-bottom/);
  assert.match(mobile,/overscroll-behavior-x:contain/);
  assert.match(mobile,/@media\(max-width:420px\)/);
});

test('3022 capability and visual assets are available offline',()=>{
  const view=fs.readFileSync('ames/console-view.mjs','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  const guard=fs.readFileSync('ames/console-capability-guard.mjs','utf8');
  assert.match(view,/withProcessCapability/);
  assert.match(guard,/radio\.disabled=!ready/);
  assert.match(guard,/3022 indisponível/);
  assert.match(sw,/ames\/console-capability-guard\.mjs/);
  assert.match(sw,/ames\/console-mobile-polish\.css/);
  assert.match(sw,/ames\/console-r12-fidelity\.css/);
});
