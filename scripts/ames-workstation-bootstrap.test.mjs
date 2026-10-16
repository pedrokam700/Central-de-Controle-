import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher=fs.readFileSync('tools/ames-workstation/INICIAR_POSTO_CENTRAL_V2.bat','utf8');
const localStarter=fs.readFileSync('tools/ames-workstation/START_LOCAL_CANDIDATE.ps1','utf8');
const route=fs.readFileSync('tools/ames-workstation/ROTA_AMES_APLICAR.bat','utf8');
const diag=fs.readFileSync('tools/ames-workstation/DIAGNOSTICO_POSTO.ps1','utf8');
const starter=fs.readFileSync('tools/ames-workstation/START_AGENT_CANONICAL.ps1','utf8');
const entry=fs.readFileSync('ames/agent/agent_entry.py','utf8');
const hardenedEntry=fs.readFileSync('ames/agent/agent_hardened_entry.py','utf8');
const localSecurity=fs.readFileSync('ames/agent/local_security.py','utf8');
const builder=fs.readFileSync('scripts/build-agent-candidate.py','utf8');
const updater=fs.readFileSync('ames/agent/update_candidate.py','utf8');
const updaterMatch=updater.match(/FILES=\((.*?)\)\r?\nROOT_FILES=/s);
assert.ok(updaterMatch,'update_candidate.py sem contrato FILES');
const updaterFiles=new Set([...updaterMatch[1].matchAll(/'([^']+\.py)'/g)].map(m=>m[1]));

test('launcher usa uma Central e um agente local pareado',()=>{
  assert.match(launcher,/127\.0\.0\.1:8765\/api\/v1\/health/);
  assert.match(launcher,/api\/v1\/chrome\/start/);
  assert.match(launcher,/central-cora-v2-git-v2-console-parity-r12/);
  assert.match(launcher,/local_agent_token/);
  assert.match(launcher,/X-Central-Agent-Token/);
  assert.match(launcher,/#ames_agent_token=%AGENT_TOKEN%/);
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

test('agente ativo precisa ser da mesma pasta, build canonico, H1 autenticado e seguranca local',()=>{
  assert.match(entry,/"package_root":str\(a\.BASE_DIR\.parent\.resolve\(\)\)/);
  assert.match(starter,/package_root/);
  assert.match(starter,/\$actual -ieq \$expected/);
  assert.match(starter,/Stop-AgentOn8765/);
  assert.match(starter,/agent_build -like 'CANONICAL-\*'/);
  assert.match(starter,/agent_hardened_entry\.py/);
  assert.match(starter,/Get-AgentToken/);
  assert.match(starter,/X-Central-Agent-Token/);
  assert.match(starter,/api\/v1\/v2\/capabilities' -Headers \$headers/);
  assert.match(starter,/api\/v1\/hardening\/health' -Headers \$headers/);
  assert.match(starter,/schema_version/);
  assert.match(starter,/SQLite=\$\(\$hard\.integrity\)/);
  assert.match(hardenedEntry,/hardening\.install/);
  assert.match(hardenedEntry,/local_security\.ensure_token/);
  assert.match(hardenedEntry,/HardenedHandler/);
  assert.match(localSecurity,/TOKEN_HEADER = "X-Central-Agent-Token"/);
  assert.match(localSecurity,/secrets\.token_urlsafe\(32\)/);
});

test('startup real e idempotente: processo e capturado, limpo, logado e independe de health operacional',()=>{
  assert.match(starter,/Start-Process[\s\S]*-PassThru/);
  assert.match(starter,/Stop-ProcessAndWait/);
  assert.match(starter,/Stop-ResidualSamePackageAgents/);
  assert.match(starter,/startup nao validado/);
  assert.match(starter,/agent_startup_state\.json/);
  assert.match(starter,/agent_stdout_\$stamp\.log|agent_stdout_/);
  assert.match(starter,/@\('-u'/);
  assert.match(starter,/api\/v1\/ready/);
  assert.match(starter,/api\/v1\/v2\/capabilities/);
  assert.doesNotMatch(starter,/Invoke-RestMethod\s+'http:\/\/127\.0\.0\.1:8765\/api\/v1\/health'/);
  assert.match(starter,/Start-Process -FilePath \$runtime\.base/);
  assert.match(starter,/__PYVENV_LAUNCHER__/);
  assert.match(starter,/\[int\]\$Ready\.pid -ne \$ExpectedPid/);
  assert.match(starter,/Assert-PortOwner/);
  assert.match(starter,/Global\\CentralAMES\.CanonicalBootstrap/);
  assert.match(starter,/\$script:attempt -le \$MaxAttempts/);
  assert.match(starter,/UNKNOWN_OWNER/);
  assert.match(starter,/agent_bootstrap\.pyw/);
  assert.doesNotMatch(starter,/0\.5\.24\*|0\.5\.25\*/);
});

test('health local e limitado; diagnostico completo de rede fica fora do caminho critico',()=>{
  assert.match(entry,/def _health_network_snapshot\(\):/);
  assert.match(entry,/network_watch\.tcp_probe\(host,port,timeout=\.8\)/);
  assert.match(entry,/detail_source.*guardian_cache/);
  assert.match(entry,/detail_source.*pending_guardian/);
  assert.match(entry,/if u\.path=="\/api\/v1\/health"[\s\S]*_health_network_snapshot\(\)/);
  assert.match(entry,/if u\.path=="\/api\/v1\/network\/status"[\s\S]*_network_snapshot\(\)/);
});

test('todos os consumidores do H1 protegido usam token local sem enfraquecer o endpoint',()=>{
  assert.match(launcher,/hardening\/health' -Headers \$headers/);
  assert.match(diag,/hardening\/health' -Headers \$headers/);
  assert.match(diag,/X-Central-Agent-Token/);
  assert.match(hardenedEntry,/_PUBLIC_API = \{"\/api\/v1\/ready", "\/api\/v1\/health"\}/);
  assert.doesNotMatch(hardenedEntry,/_PUBLIC_API[^\n]*hardening\/health/);
});

test('falha do 00_INICIAR produz diagnostico automatico e evidencias persistentes',()=>{
  assert.match(localStarter,/DIAGNOSTICO_POSTO\.ps1/);
  assert.match(localStarter,/Invoke-StartupDiagnostic/);
  assert.match(localStarter,/local_agent_token/);
  assert.match(localStarter,/token\.Length -lt 32/);
  assert.match(diag,/agent_startup_state\.json/);
  assert.match(diag,/Listener\/processo do agente 8765/);
  assert.match(diag,/stdout do ultimo startup/);
  assert.match(diag,/stderr do ultimo startup/);
});

test('rota A-MES persiste, e auto-reparada e nao troca gateway padrao',()=>{
  assert.match(route,/172\.29\.185\.215\/32/);
  assert.match(route,/PolicyStore PersistentStore/);
  assert.match(route,/PolicyStore ActiveStore/);
  assert.match(route,/New-NetRoute -DestinationPrefix \$target -InterfaceIndex \$ifIndex -NextHop \$gw -RouteMetric 1/);
  assert.doesNotMatch(route,/New-NetRoute[^\r\n]*-PolicyStore\s+ActiveStore/i);
  assert.match(route,/Start-Process[^\r\n]*-Wait -PassThru/i);
  assert.match(launcher,/garantindo rota persistente A-MES/i);
  assert.match(launcher,/ROTA_AMES_APLICAR\.bat/);
  assert.doesNotMatch(route,/Set-NetIPInterface|Set-DnsClientServerAddress|route\s+delete\s+0\.0\.0\.0/i);
});

test('bootstrap nao armazena segredos A-MES e falha fechado em servico desconhecido',()=>{
  assert.match(starter,/candidate_version/);
  assert.match(starter,/nao se identificou como agente A-MES/i);
  assert.doesNotMatch(starter,/password|senha\s*=|cookie|wifi.*key/i);
  assert.match(diag,/nao imprime senha A-MES/i);
  assert.match(diag,/valor nunca exibido/i);
});

test('candidate builder inclui ferramentas de posto e deriva hardening do contrato ativo do updater',()=>{
  for(const name of ['INICIAR_POSTO_CENTRAL_V2.bat','ROTA_AMES_APLICAR.bat','ROTA_AMES_REMOVER.bat','START_AGENT_CANONICAL.ps1','DIAGNOSTICO_POSTO.ps1']){
    assert.ok(builder.includes(name),`builder nao inclui ${name}`);
  }
  assert.match(builder,/_updater_files\(root\)/);
  assert.match(builder,/update_candidate\.py/);
  for(const name of ['agent_entry.py','agent_hardened_entry.py','base_paging_backend.py','candidate_config.py','hardening.py','local_security.py','operational_calendar.py','performance_indexes.py']){
    assert.ok(updaterFiles.has(name),`contrato ativo do updater nao inclui ${name}`);
  }
  assert.match(builder,/if any\('local_agent_token' in name for name in files\):raise ValueError/);
});

// Real behavior is exercised by ames-root-path.windows.mjs in Windows CI.
test('native PowerShell boundary never receives a quoted trailing backslash',()=>{
  for(const line of launcher.split(/\r?\n/).filter(line=>line.includes('-Root '))){
    assert.ok(line.includes('-Root "%ROOT%\\."'),line);
  }
  assert.match(launcher,/DisableDelayedExpansion/);
  assert.match(diag,/ROOT_INVALID/);
  assert.match(diag,/STATE_UNREADABLE/);
  assert.match(diag,/LOG_UNREADABLE/);
});
