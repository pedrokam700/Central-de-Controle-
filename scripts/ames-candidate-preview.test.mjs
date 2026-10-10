import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('candidate builder separa produção e preview e preserva coletores 3028',()=>{
  const build=fs.readFileSync('scripts/build-agent-candidate.py','utf8');
  const readme=fs.readFileSync('ames/agent/README.md','utf8');
  assert.match(build,/central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477\.vercel\.app/);
  assert.match(build,/deploy-preview-23--productcontrolcenter\.netlify\.app/);
  assert.match(build,/ABRIR_PREVIEW_PR23\.bat/);
  assert.match(build,/ABRIR_CENTRAL_V2\.bat/);
  assert.match(build,/PR_PREVIEW_URL/);
  assert.match(build,/PRODUCTION_URL/);
  assert.match(build,/config\.example\.json/);
  assert.match(build,/PREPARAR_PREVIEW_CENTRAL_V2\.ps1/);
  assert.match(build,/ames-authorize-preview-origin\.ps1/);
  assert.match(build,/COLLECTORS=/);
  assert.match(build,/Original collectors\/engine\/helpers\/UI retained/);
  assert.ok(readme.includes('ABRIR_PREVIEW_PR23.bat'));
  assert.ok(readme.includes('ABRIR_CENTRAL_V2.bat'));
  assert.ok(readme.includes('não deve ser usado como evidência de validação do PR'));
  assert.doesNotMatch(build,/https:\/\/\*\.(?:vercel|netlify)\.app/);
  assert.doesNotMatch(build,/['"]\*['"]/);
});
