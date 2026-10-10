import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('candidate builder inclui previews seguros e helper sem alterar coletores 3028',()=>{
  const build=fs.readFileSync('scripts/build-agent-candidate.py','utf8');
  assert.match(build,/central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477\.vercel\.app/);
  assert.match(build,/deploy-preview-23--productcontrolcenter\.netlify\.app/);
  assert.match(build,/config\.example\.json/);
  assert.match(build,/PREPARAR_PREVIEW_CENTRAL_V2\.ps1/);
  assert.match(build,/ames-authorize-preview-origin\.ps1/);
  assert.match(build,/COLLECTORS=/);
  assert.match(build,/Original collectors\/engine\/helpers\/UI retained/);
  assert.doesNotMatch(build,/https:\/\/\*\.(?:vercel|netlify)\.app/);
  assert.doesNotMatch(build,/['"]\*['"]/);
});
