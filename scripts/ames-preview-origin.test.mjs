import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('helper de preview altera somente allowed_origins e preserva backup/config sem credenciais',()=>{
  const ps=fs.readFileSync('scripts/ames-authorize-preview-origin.ps1','utf8');
  assert.ok(ps.includes('https://central-cora-v2.vercel.app'));
  assert.ok(ps.includes('https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app'));
  assert.ok(ps.includes('https://deploy-preview-23--productcontrolcenter.netlify.app'));
  assert.ok(ps.includes('$ApprovedOrigins -notcontains $Origin'));
  assert.ok(ps.includes('no wildcard'));
  assert.ok(ps.includes('allowed_origins'));
  assert.ok(ps.includes('Copy-Item'));
  assert.ok(ps.includes('UTF8Encoding($false)'));
  assert.ok(ps.includes('Select-Object -Unique'));
  assert.doesNotMatch(ps,/password|cookie|wifi|ssid|credential/i);
});
