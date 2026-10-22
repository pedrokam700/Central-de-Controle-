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
