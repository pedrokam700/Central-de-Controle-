import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const switcher = read('tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1');
const installer = read('tools/ames-workstation/01_INSTALAR_UMA_VEZ.bat');
const builder = read('scripts/build-integrated-candidate.py');
const alias = read('tools/ames-workstation/01_TROCAR.bat');

test('01_TROCAR no pacote usa o mesmo coordenador protegido e nunca executa 00_INICIAR', () => {
  assert.match(builder, /'01_TROCAR\.bat'/);
  assert.match(alias, /call "%~dp001_TROCAR_PARA_PR69_NOVA\.bat"/);
  assert.doesNotMatch(alias, /00_INICIAR_AQUI/);
  assert.match(switcher, /CANDIDATE_MANIFEST.json/);
  assert.match(switcher, /Global\\CentralAMES.UpdateTransaction.8765/);
});

test('preparacao instala dependencias sem inicializar/configurar SQLite antes de migrar', () => {
  assert.match(installer, /if \/I "%~1"=="\/prepare"/);
  assert.match(installer, /if "%PREPARE_MODE%"=="1" \(\s*echo\s+\[OK\] Estado operacional nao tocado no preparo/);
  assert.match(installer, /if "%PREPARE_MODE%"=="1" \([\s\S]*?Selftest do agente reservado/);
  assert.ok(switcher.indexOf("'01_INSTALAR_UMA_VEZ.bat') /prepare") < switcher.indexOf('StopKnown $process'));
  assert.ok(switcher.indexOf("Invoke-StateTransfer 'preflight'") < switcher.indexOf('StopKnown $process'));
});

test('estado completo e ensaio de restauracao antes de iniciar novo agente', () => {
  assert.match(switcher, /SAFE_STATE_TRANSFER.py/);
  assert.match(switcher, /issue57_update_preflight.py/);
  assert.ok(switcher.indexOf("Invoke-StateTransfer 'stage'") > switcher.indexOf("StopKnown $process"));
  assert.ok(switcher.indexOf("Invoke-StateTransfer 'stage'") < switcher.lastIndexOf("'START_LOCAL_CANDIDATE.ps1'"));
  for (const needle of ['backup_verified','restore_rehearsed','source_unchanged','staged_identity_verified'])
    assert.ok(switcher.includes(needle), needle);
  assert.match(switcher, /ROLLBACK_ANTIGO=SUCCESS/);
  assert.match(switcher, /ROLLBACK_ANTIGO=MANUAL/);
  assert.ok(switcher.indexOf('$mutex.ReleaseMutex()') < switcher.indexOf('if($rollbackNeeded){'));
  assert.match(switcher, /-File \(Join-Path \$oldRoot 'suporte\\ames-workstation\\START_AGENT_CANONICAL.ps1'\)/);
});
