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
  assert.match(classifier,/direct_launcher_not_fenced/);
  assert.match(classifier,/other_windows_sessions_not_attested/);
  assert.match(classifier,/update_authorized=\$false/);
  assert.doesNotMatch(classifier,/\b(?:Stop-Process|Start-Process|Set-ItemProperty|Get-Content)\b/);
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

test('Windows CI must reach guardian, mutex and ACL proofs without nullable LASTEXITCODE shortcuts',()=>{
  const workflow=readFileSync('.github/workflows/ames-operational-history.yml','utf8');
  const step=workflow.split('      - name: Validate background guardian and temporary safe pairing launcher syntax\n')[1]?.split('\n  reading-firestore:')[0];
  assert.ok(step,'Windows fixture step required');
  for(const marker of [/guardian_fixture_not_completed/,/mutex_fixture_not_completed/,/private_acl_fixture_not_completed/,/Windows fixtures: guardian \+ mutex \+ backup ACL end-to-end GREEN/]){
    assert.match(step,marker);
  }
  assert.doesNotMatch(step,/if\s*\(\s*\$LASTEXITCODE\s+-ne\s+0\s*\)\s*\{\s*exit\s+\$LASTEXITCODE/i);
});
