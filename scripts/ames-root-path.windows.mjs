// Windows-only integration: execute the unmodified BAT failure path and the
// real diagnostic in Windows PowerShell 5.1, without mocking filesystem/HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

assert.equal(process.platform, 'win32', 'This gate requires real Windows');
const source = path.resolve(process.argv[2] || 'tools/ames-workstation');
const evidence = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'ames root gate '));
const root = path.join(evidence, 'Factory package [candidate] with spaces !');
const support = path.join(root, 'suporte', 'ames-workstation');
fs.mkdirSync(support, {recursive:true});
fs.mkdirSync(path.join(root, 'ames-agent', 'data'), {recursive:true});
fs.mkdirSync(path.join(root, 'logs'), {recursive:true});
for (const name of ['INICIAR_POSTO_CENTRAL_V2.bat', 'DIAGNOSTICO_POSTO.ps1']) {
  fs.copyFileSync(path.join(source, name), path.join(name.endsWith('.bat') ? root : support, name));
}
const token = 'root-path-regression-secret-do-not-print-0123456789';
fs.writeFileSync(path.join(root, 'ames-agent/data/local_agent_token'), token);
const state = path.join(root, 'logs/agent_startup_state.json');
const log = path.join(root, 'logs/agent_stdout_test.log');
fs.writeFileSync(log, 'ROOT_GATE_LOG_FOUND\n');
fs.writeFileSync(state, JSON.stringify({status:'ROOT_GATE_STATE_FOUND', stdout:log, stderr:'C:\\bad"path\\stderr.log'}));

function run(name, body, expectedExit) {
  const batch = path.join(evidence, `${name}.cmd`);
  // Delayed expansion is enabled by the caller on purpose. The launcher must
  // preserve literal exclamation marks as well as spaces and square brackets.
  fs.writeFileSync(batch, `@echo off\r\nsetlocal DisableDelayedExpansion\r\n${body}\r\nexit /b %errorlevel%\r\n`);
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:on', '/c', `"${batch}"`], {
    windowsVerbatimArguments:true, encoding:'utf8', cwd:evidence, timeout:120000,
    input:'', windowsHide:true,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  fs.writeFileSync(path.join(evidence, `${name}.txt`), output);
  assert.ifError(result.error);
  assert.equal(result.status, expectedExit, `${name}: ${output}`);
  assert.doesNotMatch(output, /ItemExistsArgumentError|InvalidArgument|ArgumentException|ROOT_INVALID|Caracteres inv.lidos|Illegal characters|Invalid characters/i, name);
  assert.ok(!output.includes(token), 'Diagnostic leaked local token');
  return output;
}
function checkState(output) {
  for (const marker of ['presente/valido', 'ROOT_GATE_STATE_FOUND', 'ROOT_GATE_LOG_FOUND', 'LOG_UNREADABLE', '[11] Segredos']) {
    assert.ok(output.includes(marker), `Missing ${marker}: ${output}`);
  }
}

// No installer/venv: the real launcher fails before any route mutation or
// browser launch and enters its actual :fail diagnostic invocation.
checkState(run('launcher-failure', `call "${root}\\INICIAR_POSTO_CENTRAL_V2.bat" /prod <nul`, 1));
const diagnostic = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${support}\\DIAGNOSTICO_POSTO.ps1"`;
// Reproduce the old native argv boundary, including its trailing backslash.
checkState(run('legacy-trailing-slash', `${diagnostic} -Root "${root}\\"`, 0));
fs.writeFileSync(state, '{broken json');
const broken = run('corrupt-state-relative-root', `${diagnostic} -Root ".\\${path.basename(root)}\\."`, 0);
assert.ok(broken.includes('STATE_UNREADABLE') && broken.includes('[11] Segredos'));
fs.unlinkSync(state);
const missing = run('missing-state', `${diagnostic} -Root "${root}\\."`, 0);
assert.ok(missing.includes('agent_startup_state.json ainda nao existe.') && missing.includes('ROOT_GATE_LOG_FOUND'));

// Invalid interior quotes/control characters and missing directories must fail
// cleanly before Join-Path/Test-Path or any HTTP diagnostic runs.
const invalidHarness = path.join(evidence, 'invalid-roots.ps1');
fs.writeFileSync(invalidHarness, `param([string]$Diagnostic)\n& $Diagnostic -Root ('C:\\invalid'+[char]1+'root')\nexit $LASTEXITCODE\n`);
const invalid = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',invalidHarness,'-Diagnostic',path.join(support,'DIAGNOSTICO_POSTO.ps1')], {encoding:'utf8',windowsHide:true,timeout:10000});
assert.equal(invalid.status, 2);
assert.match(invalid.stdout, /ROOT_INVALID/);
assert.equal(invalid.stderr, '');
const absent = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(support,'DIAGNOSTICO_POSTO.ps1'),'-Root',path.join(root,'missing')], {encoding:'utf8',windowsHide:true,timeout:10000});
assert.equal(absent.status, 2);
assert.match(absent.stdout, /ROOT_INVALID/);
assert.equal(absent.stderr, '');
fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({status:'GREEN', platform:process.platform, cases:6, physical_gate:'PENDING'}, null, 2));
console.log(`Windows real BAT/PowerShell root gate GREEN; evidence: ${evidence}`);
