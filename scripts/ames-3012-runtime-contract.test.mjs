import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('3012 mapped runtime executes filters, View fallback, store lifecycle and cache invalidation',()=>{
  const python=process.env.PYTHON_BIN||'python3';
  const run=spawnSync(python,['scripts/agent-3012-runtime-contract.test.py'],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,`${run.stdout||''}\n${run.stderr||''}`);
});
