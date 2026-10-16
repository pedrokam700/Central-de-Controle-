import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function updaterFiles(){
  const source=fs.readFileSync('ames/agent/update_candidate.py','utf8');
  const match=source.match(/FILES=\((.*?)\)\nROOT_FILES=/s);
  assert.ok(match,'update_candidate.py sem contrato FILES');
  return new Set([...match[1].matchAll(/'([^']+\.py)'/g)].map(m=>m[1]));
}

test('candidate builder separa produção e preview, preserva 3028 e deriva o payload ativo do updater',()=>{
  const build=fs.readFileSync('scripts/build-agent-candidate.py','utf8');
  const readme=fs.readFileSync('ames/agent/README.md','utf8');
  const files=updaterFiles();
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
  assert.match(build,/Exact 3028 retained; R11\/R12 3022 contract required; hardening H1, workstation token, explicit operational calendar and single-Central bootstrap included/);
  assert.match(build,/_updater_files\(root\)/);
  assert.match(build,/update_candidate\.py/);
  assert.match(build,/candidate_files=_updater_files\(root\)/);
  for(const name of ['agent_entry.py','agent_hardened_entry.py','base_paging_backend.py','candidate_config.py','hardening.py','local_security.py','operational_calendar.py','performance_indexes.py','process_r11.py']){
    assert.ok(files.has(name),`contrato FILES do updater não inclui ${name}`);
  }
  assert.equal(files.has('ames_3028.py'),false,'3028 congelado não deve virar payload substituível do updater');
  assert.equal(files.has('ames_3028_live.py'),false,'3028 live congelado não deve virar payload substituível do updater');
  assert.match(build,/class Tela3022/);
  assert.match(build,/correlacionar_falha_3022/);
  assert.match(build,/extrair_passagens_processo/);
  assert.match(build,/INICIAR_POSTO_CENTRAL_V2\.bat/);
  assert.match(build,/if any\('local_agent_token' in name for name in files\):raise ValueError/);
  assert.ok(readme.includes('INICIAR_POSTO_CENTRAL_V2.bat'));
  assert.ok(readme.includes('R11_DERIVED_R12_FACTORY_GATE'));
  assert.ok(readme.includes('ZIP público `0.5.24-rc1` anterior foi bloqueado'));
  assert.ok(readme.includes('CI/preview verde não substituem validação física R12'));
  assert.doesNotMatch(build,/https:\/\/\*\.(?:vercel|netlify)\.app/);
  assert.doesNotMatch(build,/['"]\*['"]/);
});