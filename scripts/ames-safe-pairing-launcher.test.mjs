import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync('tools/ames-workstation/ABRIR_HTTPS_EXISTENTE_SEM_ATUALIZAR.ps1','utf8');
test('pilot fallback verifies owner from ready PID and existing token, never creates credentials',()=>{
 assert.match(code,/api\/v1\/ready/);
 assert.match(code,/agent_build -ne 'CANONICAL-R11-BATCH'/);
 assert.match(code,/Get-CimInstance Win32_Process/);
 assert.match(code,/agent_hardened_entry/);
 assert.match(code,/data\\local_agent_token/);
 assert.match(code,/Central-de-Controle-\/#ames_agent_token=/);
 assert.doesNotMatch(code,/(?:Stop-Process|Remove-Item|Set-Content|Copy-Item|Invoke-WebRequest|Invoke-Expression|Start-Job)/);
 assert.doesNotMatch(code,/Write-(?:Host|Output).*\$(?:token|dest)/i);
 assert.match(code,/Nenhum arquivo ou processo foi modificado/);
});
