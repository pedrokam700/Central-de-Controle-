import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Console MES loads the R12 polish layer without restoring a parallel legacy runtime', () => {
  const source = fs.readFileSync('ames/console-view.mjs', 'utf8');
  assert.match(source, /console-r12-polish\.css/);
  assert.match(source, /class=\"ames-console-home\"/);
  assert.match(source, /ames-console-back-mobile/);
  assert.match(source, /querySelectorAll\('\[data-console-back\]'\)/);
  assert.doesNotMatch(source, /mountV0523|new Function\(|<iframe/i);
});

test('R12 polish restores readable desktop hierarchy and keeps a dedicated mobile return control', () => {
  const css = fs.readFileSync('ames/console-r12-polish.css', 'utf8');
  assert.match(css, /grid-template-columns:228px minmax\(0,1fr\)/);
  assert.match(css, /\.ames-legacy-topbar\{[\s\S]*?min-height:76px/);
  assert.match(css, /\.ames-legacy-title\{[\s\S]*?font-size:20px/);
  assert.match(css, /\.ames-legacy-shell \.button\{[\s\S]*?min-height:38px/);
  assert.match(css, /\.ames-console-home\{[\s\S]*?display:flex/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.ames-console-back-mobile\{display:inline-flex!important/);
});
