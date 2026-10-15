import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('3012 mapper accepts Home identity, rejects OPC identity, and strips URL secrets', () => {
  const code = `
import json,sys
sys.path.insert(0,'ames/agent')
import map_3012
assert map_3012._surface('http://172.29.185.215/asymes/home#UAWIP.form.VwDefectRepairView') == 'home'
assert map_3012._surface('http://172.29.185.215/asymes/opc#UAWIP.form.VwDefectRepairView') == 'opc'
safe=map_3012._safe_url('http://user:pass@172.29.185.215/asymes/home?token=secret#UAWIP.form.VwDefectRepairView')
assert safe == {'path':'/asymes/home','fragment':'UAWIP.form.VwDefectRepairView'}
assert 'getValue' not in map_3012.INSPECT_JS
print(json.dumps(safe))
`;
  const run = spawnSync(process.env.PYTHON_BIN || 'python', ['-c', code], { cwd: new URL('..', import.meta.url), encoding:'utf8' });
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test('3012 mapping is exposed only through existing agent/preparation flow and stays read-only', async () => {
  const patch = await read('ames/agent/agent_3012_patch.py');
  const mapper = await read('ames/agent/map_3012.py');
  const client = await read('ames/agent-client.mjs');
  const prep = await read('ames/console-preparation.mjs');
  const updater = await read('ames/agent/update_candidate.py');
  assert.match(patch,/\/api\/v1\/diagnostics\/3012\/map/);
  assert.match(patch,/with a\.MES\.job\(\):/);
  assert.match(mapper,/query_executed": False/);
  assert.match(mapper,/field_values_included": False/);
  assert.doesNotMatch(mapper,/document\.cookie|localStorage|sessionStorage|getAllCookies/i);
  assert.match(client,/name==='map3012'/);
  assert.match(prep,/Mapear 3012 Home \(somente leitura\)/);
  assert.match(prep,/MAPEAMENTO_3012_HOME_/);
  assert.match(updater,/map_3012\.py/);
});
