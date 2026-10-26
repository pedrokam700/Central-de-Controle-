import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('o launcher da candidata recusa porta 8765 ocupada antes de instalar ou iniciar agente',()=>{
  const launcher=readFileSync('tools/ames-workstation/START_LOCAL_CANDIDATE.ps1','utf8');
  const preflight=launcher.indexOf('Get-NetTCPConnection -LocalPort 8765 -State Listen');
  const install=launcher.indexOf('01_INSTALAR_UMA_VEZ.bat');
  const agent=launcher.indexOf('START_AGENT_CANONICAL.ps1" -Root $Root');
  assert.ok(preflight>=0,'deve inspecionar o listener da porta 8765');
  assert.ok(install>preflight,'deve inspecionar antes de qualquer instalacao');
  assert.ok(agent>preflight,'deve inspecionar antes de iniciar o agente');
  assert.match(launcher,/if\(\$listeners\.Count -gt 0\)[\s\S]*?throw/);
  assert.match(launcher,/Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue/);
});

test('o pacote exige migracao supervisionada quando existe guardian anterior',()=>{
  const builder=readFileSync('scripts/build-integrated-candidate.py','utf8');
  assert.match(builder,/PC COM 0\.5\.39 OU OUTRO GUARDIAN/);
  assert.match(builder,/NAO EXECUTE 00_INICIAR_AQUI\.bat/);
  assert.match(builder,/ESTE PACOTE NAO E UM UPDATER NEM UMA MIGRACAO AUTOMATICA/);
  assert.doesNotMatch(builder,/volte a usar a CLEAN V3 intacta/);
  assert.match(builder,/instalacao oficial anterior comprovada \(0\.5\.39/);
  assert.match(builder,/nao copie nem substitua SQLite, WAL, token, configuracao, source_id ou filas/);
});
