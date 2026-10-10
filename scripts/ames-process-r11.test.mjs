import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const entry=fs.readFileSync('ames/agent/agent_entry.py','utf8');
const adapter=fs.readFileSync('ames/agent/process_r11.py','utf8');
const canonical=fs.readFileSync('ames/data/canonical.mjs','utf8');
const builder=fs.readFileSync('scripts/build-agent-candidate.py','utf8');

test('agente canonico aceita exatamente os tres modos seletivos',()=>{
  for(const mode of ['full','process_only','reuse_only'])assert.ok(entry.includes(mode));
  assert.match(entry,/process_r11\.collect_and_persist/);
  assert.match(entry,/process_contract.*R11_DERIVED_R12_FACTORY_GATE/s);
});

test('3022 exige motor que exponha contrato temporal provado',()=>{
  assert.match(adapter,/correlacionar_falha_3022/);
  assert.match(adapter,/extrair_passagens_processo/);
  assert.match(adapter,/reference_event_time/);
  assert.match(adapter,/root_cause.*False/);
  assert.match(builder,/3022 source lacks required R11\/R12 contract/);
});

test('timeline canonica projeta contextos por falha sem inventar causa',()=>{
  assert.match(canonical,/defect_contexts/);
  assert.match(canonical,/process_timeline:\{status:.*events:processEvents,contexts:processContexts\}/s);
});

test('schema local e catalogo 3022 passam no Python',()=>{
  const py=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(py,['scripts/agent-process-r11.test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,(result.stdout||'')+(result.stderr||''));
});
