import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher=fs.readFileSync('tools/ames-workstation/INICIAR_POSTO_CENTRAL_V2.bat','utf8');
const route=fs.readFileSync('tools/ames-workstation/ROTA_AMES_APLICAR.bat','utf8');
const diag=fs.readFileSync('tools/ames-workstation/DIAGNOSTICO_POSTO.ps1','utf8');
const starter=fs.readFileSync('tools/ames-workstation/START_AGENT_CANONICAL.ps1','utf8');
const builder=fs.readFileSync('scripts/build-agent-candidate.py','utf8');

test('launcher usa uma Central e um agente local',()=>{
  assert.match(launcher,/127\.0\.0\.1:8765\/api\/v1\/health/);
  assert.match(launcher,/api\/v1\/chrome\/start/);
  assert.match(launcher,/central-cora-v2-git-v2-console-parity-r12/);
  assert.doesNotMatch(launcher,/start\s+""\s+"http:\/\/127\.0\.0\.1:8765\/?"/i);
});

test('launcher recupera auto-repair R11 quando .venv existe mas esta incompleto',()=>{
  assert.match(launcher,/:depscheck/);
  for(const dep of ['pandas','openpyxl','playwright','pyautogui','pyperclip'])assert.ok(launcher.includes(dep),`depscheck sem ${dep}`);
  assert.match(launcher,/09_REPARAR_DEPENDENCIAS\.bat" \/auto/);
  assert.match(launcher,/01_INSTALAR_UMA_VEZ\.bat" \/auto/);
});

test('rota A-MES e temporaria e nao troca gateway padrao',()=>{
  assert.match(route,/172\.29\.185\.215\/32/);
  assert.match(route,/PolicyStore ActiveStore/);
  assert.match(route,/New-NetRoute/);
  assert.doesNotMatch(route,/Set-NetIPInterface|Set-DnsClientServerAddress|route\s+delete\s+0\.0\.0\.0/i);
});

test('bootstrap nao armazena segredos e falha fechado em agente antigo',()=>{
  assert.match(starter,/candidate_version/);
  assert.match(starter,/0\.5\.24/);
  assert.doesNotMatch(starter,/password|senha\s*=|cookie|wifi.*key/i);
  assert.match(diag,/nao le nem imprime senha A-MES/i);
});

test('candidate builder inclui ferramentas de posto',()=>{
  for(const name of ['INICIAR_POSTO_CENTRAL_V2.bat','ROTA_AMES_APLICAR.bat','ROTA_AMES_REMOVER.bat','START_AGENT_CANONICAL.ps1','DIAGNOSTICO_POSTO.ps1']){
    assert.ok(builder.includes(name),`builder nao inclui ${name}`);
  }
});
