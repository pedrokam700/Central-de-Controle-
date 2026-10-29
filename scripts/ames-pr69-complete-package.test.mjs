import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const build = readFileSync('scripts/build-integrated-candidate.py','utf8');
const start = readFileSync('tools/ames-workstation/START_LOCAL_CANDIDATE.ps1','utf8');
const install = readFileSync('tools/ames-workstation/01_INSTALAR_UMA_VEZ.bat','utf8');
const route = readFileSync('tools/ames-workstation/ensure_ames_route.ps1','utf8');
const networkBat = readFileSync('tools/ames-workstation/08_PREPARAR_REDE_AMES.bat','utf8');
const switcher = readFileSync('tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1','utf8');

test('PR69 CLEAN inclui utilitario de troca, rede inicial e os 5 documentos perdidos',()=>{
  for(const name of [
    '01_TROCAR_PARA_PR69_NOVA.bat','TROCAR_PARA_PR69_NOVA.ps1',
    '08_PREPARAR_REDE_AMES.bat','INSTRUCOES_INSTALACAO_LIMPA.txt',
    'MANUAL_LOGICA_CAPTURA_E_CRUZAMENTO.md','NOTAS_ALERTAS_SN_PR69.md',
    'NOTAS_CORRECOES_28OUT_RESTAURACAO.md','NOTAS_VALIDACAO_FPY_TOP3_RASTREABILIDADE.md'
  ])assert.ok(build.includes(name),`Arquivo exigido nao empacotado: ${name}`);
  assert.match(build,/data\.count\(b'__BUNDLE_SHA__'\)!=1/);
  assert.match(build,/payload\['CANDIDATE_MANIFEST\.json'\]/);
  assert.match(build,/verification=verify_zip\(destination\)/);
});

test('PC virgem deve comprovar rede antes de instalar/iniciar o agente',()=>{
  const guard=start.indexOf('Get-NetTCPConnection -LocalPort 8765 -State Listen');
  const network=start.indexOf("Join-Path $Root '08_PREPARAR_REDE_AMES.bat'");
  const installAt=start.indexOf('01_INSTALAR_UMA_VEZ.bat');
  const agent=start.indexOf('START_AGENT_CANONICAL.ps1" -Root $Root');
  assert.ok(guard>=0 && network>guard && installAt>network && agent>installAt);
  assert.match(start,/Rede A-MES nao validada/);
  assert.match(start,/& \$NetworkSetup \/auto/);
  assert.match(networkBat,/if \/I "%~1"=="\/auto" set "AUTO_MODE=1"/);
  assert.match(networkBat,/if "%AUTO_MODE%"=="0" pause/);
  assert.match(install,/if "%AUTO_MODE%"=="0"[\s\S]*?08_PREPARAR_REDE_AMES\.bat/);
  assert.match(install,/:network_error[\s\S]*?goto :fail/);
  assert.match(route,/TAXXX_5G nao conectado/);
  assert.match(route,/Start-Process.*-Verb RunAs -Wait -PassThru/);
  assert.match(route,/\$TargetIp='172\.29\.185\.215'/);
  assert.match(route,/\$Prefix="\$TargetIp\/32"/);
  assert.match(route,/Get-NetConnectionProfile[\s\S]*?\.Name -eq \$Profile/);
  assert.match(route,/Get-NetIPConfiguration -InterfaceIndex \$wifiIndex/);
  assert.doesNotMatch(route,/route\.exe\s+(?:add|change)\s+0\.0\.0\.0/);
});

test('Troca supervisionada exige versao assinada, confirmacao e protecao de guardian/porta',()=>{
  for(const needle of ['__BUNDLE_SHA__','CANDIDATE_MANIFEST.json','Get-FileHash',
    "New-Object -ComObject WScript.Shell",'CentralAMES.UpdateTransaction.8765',
    'Get-NetTCPConnection -LocalPort 8765','Get-ScheduledTask','Win32_Service',
    'StopKnown','TROCA_PR69=BLOCKED','TROCA_PR69=SUCCESS', 'WriteRun $oldRun']){
    assert.ok(switcher.includes(needle),`Protecao da troca ausente: ${needle}`);
  }
  assert.doesNotMatch(switcher,/Read-Host 'Para continuar, digite TROCAR'/);
  assert.ok(switcher.indexOf('if($answer -ne 6)')>switcher.indexOf('Nenhum agente/guardian antigo identificado'));
  assert.ok(switcher.indexOf('if($answer -ne 6)')<switcher.indexOf('if($oldRun){WriteRun $null}'));
});
