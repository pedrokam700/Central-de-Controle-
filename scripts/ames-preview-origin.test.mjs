import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('helper de preview altera somente allowed_origins e preserva backup/config sem credenciais',()=>{
  const ps=fs.readFileSync('scripts/ames-authorize-preview-origin.ps1','utf8');
  assert.match(ps,/central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477\.vercel\.app/);
  assert.match(ps,/\^https:\/\/central-cora-v2\[a-z0-9-\]\*\\\.vercel\\\.app\$/);
  assert.match(ps,/allowed_origins/);
  assert.match(ps,/Copy-Item/);
  assert.match(ps,/UTF8Encoding\(\$false\)/);
  assert.match(ps,/Select-Object -Unique/);
  assert.doesNotMatch(ps,/password|cookie|wifi|ssid|credential/i);
});
