import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('inventory is scoped, read-only and never emits secrets or full argv',()=>{
  const code=readFileSync('tools/ames-workstation/INVENTARIAR_INSTALACOES_READONLY.ps1','utf8');
  assert.match(code,/Get-CimInstance Win32_Process/);
  assert.match(code,/Get-NetTCPConnection/);
  assert.match(code,/AMES_Central_CLEAN_\*/);
  assert.match(code,/sqlite_exists=/);
  assert.match(code,/config_exists=/);
  assert.match(code,/token_exists=/);
  assert.match(code,/updater_eligible=\$false/);
  assert.doesNotMatch(code,/\b(?:Stop-Process|Remove-Item|Copy-Item|Move-Item|Set-Content|Add-Content|Start-Process|Invoke-WebRequest|Invoke-RestMethod)\b/);
  assert.doesNotMatch(code,/read_text|Get-Content|ReadAllBytes|\.CommandLine\s*[;}\r\n]/);
  assert.doesNotMatch(code,/\bsource_id\s*=/);
});

test('guardian inventory checks external relaunch sources without claiming an idle lease',()=>{
  const code=readFileSync('tools/ames-workstation/INVENTARIAR_GUARDIANS_READONLY.ps1','utf8');
  const classifier=readFileSync('tools/ames-workstation/ISSUE57_GUARDIAN_SIGNALS.ps1','utf8');
  assert.match(code,/Get-CimInstance Win32_Process/);
  assert.match(code,/Get-CimInstance Win32_Service/);
  assert.match(code,/Get-ScheduledTask/);
  assert.match(code,/HKEY_CURRENT_USER.*CurrentVersion\\Run/);
  assert.match(code,/HKEY_LOCAL_MACHINE.*CurrentVersion\\Run/);
  assert.match(code,/GetFolderPath\('Startup'\)/);
  assert.match(code,/Get-Issue57StartupSignal -ShortcutPath/);
  assert.match(code,/unreadable_supervisor_processes=/);
  assert.match(code,/coordination_blockers=/);
  assert.match(code,/direct_launcher_fenced=\$false/);
  for(const requirement of [/read_only=\$true/,/updater_eligible=\$false/,/installed_guardian_cooperation_attested=\$false/,/all_sessions_attested=\$false/,/exclusive_maintenance_lease_held=\$false/]){
    assert.match(code,requirement);
  }
  for(const blocked of [/\bStop-Process\b/,/\bRemove-Item\b/,/\bCopy-Item\b/,/\bMove-Item\b/,/\bSet-Content\b/,/\bAdd-Content\b/,/\bStart-Process\b/,/\bNew-Item\b/,/\bSet-ItemProperty\b/,/\bNew-ScheduledTask\b/,/\bInvoke-RestMethod\b/,/\bInvoke-WebRequest\b/,/ConvertFrom-Json/,/Get-Content/]){
    assert.doesNotMatch(code,blocked);
  }
  assert.doesNotMatch(code,/commandline\s*=|arguments\s*=|pathname\s*=|source_id\s*=|token\s*=/i);
  assert.match(classifier,/KEEP_AGENT_RUNNING\\\.ps1/);
  assert.match(classifier,/CentralAMESOperatorAgent/);
  assert.match(classifier,/function Get-Issue57CoordinationBlockers/);
  assert.match(classifier,/function Get-Issue57StartupSignal/);
  assert.match(classifier,/\.CreateShortcut\(/);
  assert.match(classifier,/opaque_supervisor_command_unverified/);
  assert.match(classifier,/direct_launcher_not_fenced/);
  assert.match(classifier,/other_windows_sessions_not_attested/);
  assert.match(classifier,/update_authorized=\$false/);
  assert.doesNotMatch(classifier,/\b(?:Stop-Process|Start-Process|Set-ItemProperty|Get-Content)\b/);
  assert.doesNotMatch(classifier,/\.Save\s*\(/);
});

test('independent Windows process witness checks TCP owner and birth but never grants update',()=>{
  const witness=readFileSync('tools/ames-workstation/ISSUE57_PROCESS_WITNESS_READONLY.ps1','utf8');
  const fixture=readFileSync('scripts/issue57-process-witness.windows.test.ps1','utf8');
  for(const proof of [/Get-CimInstance Win32_Process/,/Get-NetTCPConnection/,/CommandLineToArgvW/,/CreationDate/,/File\]::OpenRead/,/ComputeHash\(\$stream\)/,/scriptArgument=\$text/,/script_argument_mismatch/,/endpoint_owner_pid/,/process_identity_observed/,/guardian_attested=\$false/,/update_authorized=\$false/,/reason='independent_windows_witness_failed_closed'/]){
    assert.match(witness,proof);
  }
  for(const forbidden of [/\bStop-Process\b/,/\bStart-Process\b/,/\bRemove-Item\b/,/\bMove-Item\b/,/\bCopy-Item\b/,/\bSet-Content\b/,/\bInvoke-RestMethod\b/,/\bInvoke-WebRequest\b/]){
    assert.doesNotMatch(witness,forbidden);
  }
  for(const proof of [/GITHUB_ACTIONS/,/RUNNER_OS/,/wrong_script_accepted/,/wrong_pid_accepted/,/wrong_port_accepted/,/process_creation_marker_unstable/,/python_eval_argument_camouflage_accepted/]){
    assert.match(fixture,proof);
  }
  assert.match(readFileSync('.github/workflows/ames-operational-history.yml','utf8'),/process_witness_fixture_not_completed/);
});

test('independent Windows backup ACL verifier is observational and cannot authorize updates',()=>{
  const verifier=readFileSync('tools/ames-workstation/VERIFY_PRIVATE_BACKUP_ACL.ps1','utf8');
  const fixture=readFileSync('scripts/issue57-private-backup-acl.windows.test.ps1','utf8');
  for(const needed of [/Get-Acl -LiteralPath/,/AreAccessRulesProtected/,/IdentityReference\.Translate/,/backup_reparse_point/,/update_authorized=\$false/,/physical_acl_attested=\$false/]){
    assert.match(verifier,needed);
  }
  assert.match(verifier,/\$reason -cin \$safeReasons/);
  assert.match(verifier,/throw 'backup_acl_verification_failed'/);
  for(const mutating of [/\bStop-Process\b/,/\bRemove-Item\b/,/\bStart-Process\b/,/\bCopy-Item\b/,/\bMove-Item\b/,/\bSet-Acl\b/,/\bicacls\b/]){
    assert.doesNotMatch(verifier,mutating);
  }
  assert.match(fixture,/GITHUB_ACTIONS/);
  assert.match(fixture,/RUNNER_TEMP/);
  assert.match(fixture,/broad_allow_ace_not_rejected/);
});

test('Windows CI must reach guardian, dual lock, crash, direct launcher and ACL proofs without nullable LASTEXITCODE shortcuts',()=>{
  const workflow=readFileSync('.github/workflows/ames-operational-history.yml','utf8');
  const step=workflow.split('      - name: Validate background guardian and temporary safe pairing launcher syntax\n')[1]?.split('\n  reading-firestore:')[0];
  assert.ok(step,'Windows fixture step required');
  for(const marker of [/guardian_fixture_not_completed/,/mutex_fixture_not_completed/,/dual_lock_ledger_fixture_not_completed/,/authenticated_drain_fixture_not_completed/,/observed_maintenance_fixture_not_completed/,/candidate_transaction_fixture_not_completed/,/coordinator_crash_fixture_not_completed/,/direct_launcher_claim_fixture_not_completed/,/private_acl_fixture_not_completed/,/Windows fixtures: guardian \+ mutex \+ dual-lock ledger \+ coordinator crash \+ direct launcher \+ backup ACL end-to-end GREEN/]){
    assert.match(step,marker);
  }
  const fixture=readFileSync('scripts/issue57-dual-lock-ledger.windows.test.ps1','utf8');
  for(const proof of [/GITHUB_ACTIONS/,/RUNNER_TEMP/,/Global\\CentralAMES\.Issue57DualUpdateTest/,/Global\\CentralAMES\.Issue57DualBootstrapTest/,/MUTEX_BLOCKED/,/PERSISTENT_CLAIM_BLOCKED/,/update_authorized.*false/]){
    assert.match(fixture,proof);
  }
  assert.match(fixture,/authenticated_drain_fixture_not_completed/);
  assert.match(fixture,/--windows-dual-lock-fixture/);
  assert.ok(fixture.indexOf('--windows-dual-lock-fixture')>fixture.indexOf('$bootstrapHeld=$bootstrapMutex.WaitOne(0)'));
  assert.ok(fixture.indexOf('--windows-dual-lock-fixture')<fixture.indexOf('$bootstrapMutex.ReleaseMutex();$bootstrapHeld=$false'));
  assert.doesNotMatch(fixture,/Global\\CentralAMES\.UpdateTransaction\.8765|Global\\CentralAMES\.CanonicalBootstrap\.8765/);
  const crash=readFileSync('scripts/issue57-coordinator-abandonment.windows.test.ps1','utf8');
  for(const proof of [/GITHUB_ACTIONS/,/RUNNER_OS/,/RUNNER_TEMP/,/Issue57CrashUpdateTest/,/Issue57CrashBootstrapTest/,/\.Kill\(\)/,/AbandonedMutexException/,/claim\.lock/,/update_authorized.*false/]){
    assert.match(crash,proof);
  }
  assert.match(crash,/production_mutex_name_forbidden/);
  const direct=readFileSync('scripts/issue57-direct-launcher-claim.windows.test.ps1','utf8');
  assert.match(direct,/GITHUB_ACTIONS/);
  assert.match(direct,/RUNNER_TEMP/);
  assert.match(direct,/Assert-NoPendingUpdateClaim/);
  assert.match(direct,/fixture_failed_open_/);
  assert.doesNotMatch(step,/if\s*\(\s*\$LASTEXITCODE\s+-ne\s+0\s*\)\s*\{\s*exit\s+\$LASTEXITCODE/i);
});

test('canonical launcher checks pending update claim under bootstrap mutex before stopping any agent',()=>{
  const source=readFileSync('tools/ames-workstation/START_AGENT_CANONICAL.ps1','utf8');
  const gate=source.indexOf('  Assert-NoPendingUpdateClaim $root\n');
  const lock=source.indexOf("$mutex=New-Object System.Threading.Mutex($false,'Global\\CentralAMES.CanonicalBootstrap.8765')");
  const processStop=source.indexOf('Stop-AgentOn8765 $keep');
  assert.ok(lock>=0 && gate>lock && processStop>gate,'read-only maintenance gate must precede all process stop/start actions');
  assert.match(source,/MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED/);
  assert.match(source,/if\(\$failure -eq 'MAINTENANCE_TRANSACTION_PENDING_OR_UNVERIFIED'\)/);
  assert.match(source,/Test-Issue57RelaunchBlocked \$PackageRoot/);
  const shared=readFileSync('tools/ames-workstation/ISSUE57_RELAUNCH_ENROLLMENT.ps1','utf8');
  assert.match(shared,/Get-ChildItem -LiteralPath \$dir -Force -ErrorAction Stop/);
  assert.match(shared,/\[IO\.FileAttributes\]::ReparsePoint/);
  assert.match(shared,/enrollment_not_operationally_enabled/);
  assert.match(shared,/relauncher-request/);
  assert.match(shared,/relauncher-response/);
  assert.match(shared,/claim_blocks_after_mutex_release/);
});

test('fresh Windows private backup root replaces explicit broad ACEs before copying identities',()=>{
  const preflight=readFileSync('tools/ames-workstation/issue57_update_preflight.py','utf8');
  const secureStep=preflight.split('def private_backup_directory(target):')[1]?.split('\ndef copy_private_identity(')[0];
  assert.ok(secureStep);
  for(const proof of [/SetAccessRuleProtection\(\$true,\$false\)/,/RemoveAccessRuleSpecific/,/FileSystemAccessRule/,/Directory\]::GetAccessControl/,/Directory\]::SetAccessControl/,/private_acl_untrusted_allow/,/subprocess\.run\(\["powershell\.exe"/]){
    assert.match(secureStep,proof);
  }
  assert.match(secureStep,/backup_root_not_empty/);
  assert.doesNotMatch(secureStep,/"icacls"/);
  assert.ok(preflight.indexOf('Directory]::SetAccessControl')<preflight.indexOf('def copy_private_identity('));
});
