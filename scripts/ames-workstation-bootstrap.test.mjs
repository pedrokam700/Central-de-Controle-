import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher=fs.readFileSync('tools/ames-workstation/INICIAR_POSTO_CENTRAL_V2.bat','utf8');
const route=fs.readFileSync('tools/ames-workstation/ROTA_AMES_APLICAR.bat','utf8');
const diag=fs.readFileSync('tools/ames-workstation/DIAGNOSTICO_POSTO.ps1','utf8');
const starter=fs.readFileSync('tools/ames-workstation/START_AGENT_CANONICAL.ps1','utf8');
const entry=fs.readFileSync('ames/agent/agent_entry.py','utf8');
const builder=fs.readFileSync('scripts/build-agent-candidate.py','utf8');

test('launcher usa uma Central e um agente local',()=>{
  assert.match(launcher,/127\.0\.0\.1:8765\/api\/v1\/health/);
  assert.match(launcher,/api\/v1\/chrome\/start/);
  assert.match(launcher,/central-cora-v2-git-v2-console-parity-r12/);
  assert.doesNotMatch(launcher,/start\s+""\s+"http:\/\/127\.0\.0\.1:8765\/?"/i);
});

test('bundle R12 abre somente preview do SHA exato e conserva fallback offline validado',()=>{
  assert.match(launcher,/FRONTEND_GATE\.json/);
  assert.match(launcher,/release-build\.json\?gate=/);
  assert.match(launcher,/expected_sha/);
  assert.match(launcher,/deploy-preview-23|preview_urls/);
  assert.match(launcher,/FRONTEND_GATE_STATE\.json/);
  assert.match(launcher,/Nenhum preview com o SHA exato/i);
});

test('launcher recupera auto-repair R11 quando .venv existe mas esta incompleto',()=>{
  assert.match(launcher,/:depscheck/);
  for(const dep of ['pandas','openpyxl','playwright','pyautogui','pyperclip'])assert.ok(launcher.includes(dep),`depscheck sem ${dep}`);
  assert.match(launcher,/09_REPARAR_DEPENDENCIAS\.bat" \/auto/);
  assert.match(launcher,/01_INSTALAR_UMA_VEZ\.bat" \/auto/);
});

test('agente ativo precisa ser da mesma pasta do pacote',()=>{
  assert.match(entry,/"package_root":str\(a\.BASE_DIR\.parent\.resolve\(\)\)/);
  assert.match(starter,/package_root/);
  assert.match(starter,/\$actual -ieq \$expected/);
  assert.match(starter,/Stop-AgentOn8765/);
  assert.match(starter,/agent_build -like 'CANONICAL-\*'/);
});

test('rota A-MES e temporaria e nao troca gateway padrao',()=>{
  assert.match(route,/172\.29\.185\.215\/32/);
  assert.match(route,/PolicyStore ActiveStore/);
  assert.match(route,/New-NetRoute/);
  assert.doesNotMatch(route,/Set-NetIPInterface|Set-DnsClientServerAddress|route\s+delete\s+0\.0\.0\.0/i);
});

test('bootstrap nao armazena segredos e falha fechado em servico desconhecido',()=>{
  assert.match(starter,/candidate_version/);
  assert.match(starter,/0\.5\.24|0\.5\.25/);
  assert.match(starter,/nao se identificou como agente A-MES/i);
  assert.doesNotMatch(starter,/password|senha\s*=|cookie|wifi.*key/i);
  assert.match(diag,/nao le nem imprime senha A-MES/i);
});

test('candidate builder inclui ferramentas de posto',()=>{
  for(const name of ['INICIAR_POSTO_CENTRAL_V2.bat','ROTA_AMES_APLICAR.bat','ROTA_AMES_REMOVER.bat','START_AGENT_CANONICAL.ps1','DIAGNOSTICO_POSTO.ps1']){
    assert.ok(builder.includes(name),`builder nao inclui ${name}`);
  }
});
