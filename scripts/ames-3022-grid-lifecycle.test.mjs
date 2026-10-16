import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('3022 grid/store lifecycle regression contract', () => {
  const python = process.env.PYTHON_BIN || 'python3';
  const run = spawnSync(python, ['scripts/agent-3022-grid-lifecycle.test.py'], {encoding:'utf8'});
  assert.equal(run.status, 0, `${run.stdout || ''}\n${run.stderr || ''}`);
});
