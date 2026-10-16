import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('captura R12 exige contrato temporal e exclui dados/segredos',()=>{
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  const run=spawnSync(python,['scripts/r12-capture.test.py'],{encoding:'utf8'});
  assert.equal(run.status,0,(run.stdout||'')+(run.stderr||''));
});
