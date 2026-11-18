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
  const instructions=readFileSync('docs/ames/packaging/CANDIDATA_INSTALACAO_FUTURA_20261118.md','utf8');
  assert.match(instructions,/NÃO AUTORIZADO PARA INSTALAÇÃO OPERACIONAL/);
  assert.match(instructions,/EEDACC65/);
  assert.match(instructions,/nem escolher 0\.5\.39 como retorno padrão/);
  assert.match(instructions,/01_TROCAR\.bat/);
  assert.match(instructions,/SQLite\/WAL/);
  assert.match(instructions,/R2 com dados novos\/estado desconhecido/);
  assert.match(builder,/payload\['LEIA_PRIMEIRO\.txt'\]=instructions/);
  for(const name of ['VERIFIER_FILES','SAFE_STATE_TRANSFER.py','issue57_update_preflight.py','AT_SETUP_FILES']){
    assert.ok(builder.includes(name),`required previous-package support must survive repackaging: ${name}`);
  }
});
