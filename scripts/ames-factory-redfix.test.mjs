import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const patch=fs.readFileSync(new URL('../ames/agent/factory_redfix.py',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../ames/agent/fastlane_runtime_guard.py',import.meta.url),'utf8');
const process3022=fs.readFileSync(new URL('../ames/factory-engine/ames/tela_3022.py',import.meta.url),'utf8');
const evidence=fs.readFileSync(new URL('../ames/evidence-view.mjs',import.meta.url),'utf8');

function pythonBin(){for(const candidate of [process.env.PYTHON_BIN,'python3','python'].filter(Boolean)){const p=spawnSync(candidate,['--version'],{encoding:'utf8'});if(p.status===0)return candidate;}return null;}

test('factory RED guards install without modifying production 3022 collector',()=>{
  assert.match(guard,/factory_redfix\.install\(entry_module\)/);
  assert.match(patch,/cancel_aware_live_event/);
  assert.match(patch,/2114_VISIBLE_PCBA_MISMATCH/);
  assert.match(patch,/factory-redfix-3012/);
  assert.doesNotMatch(process3022,/factory-redfix-3012|2114_VISIBLE_PCBA_MISMATCH|cancel_aware_live_event/);
});

test('cancel checkpoint, 2114 visible-PCBA fail-closed and 3012 grouped fields are executable contracts',()=>{
  const py=pythonBin();assert.ok(py,'Python required');
  const code=String.raw`
import sys,threading,types
sys.path.insert(0,'ames/agent')
import factory_redfix as f

class Cancelled(BaseException): pass
class Token:
    def is_set(self): return True
fake=types.SimpleNamespace(JOBS_LOCK=threading.Lock(),JOB_CANCEL={'job':Token()},Cancelled=Cancelled,_factory_cancel_checkpoint_installed=False)
fake._job_live_event=lambda job,*a,**k:{'id':job}
f._install_cancel_checkpoint(fake)
try:
    fake._job_live_event('job',{})
    raise AssertionError('cancel token was not observed')
except Cancelled:
    pass

class Mod:
    @staticmethod
    def normalizar_sn(v): return ''.join(str(v or '').split()).upper()
    @staticmethod
    def _safe_input_value(page,name): return page
class Inst:
    def __init__(self,value): self.value=value
    def _page(self): return self.value
assert f._verify_2114_result(Mod,Inst('ABC123'),'ABC123',{})['visible_query_confirmed'] is True
try:
    f._verify_2114_result(Mod,Inst('OTHER'),'ABC123',{})
    raise AssertionError('mismatched visible PCBA was accepted')
except RuntimeError as exc:
    assert '2114_VISIBLE_PCBA_MISMATCH' in str(exc)

import ames_3012_live as live
f._install_3012_field_resolution()
assert 'factory-redfix-3012' in live.QUERY_3012_JS
assert 'ownerCt' in live.QUERY_3012_JS
assert 'compactPats' in live.QUERY_3012_JS
print('factory redfix contracts OK')
`;
  const run=spawnSync(py,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test('SN correlation alerts are visually explicit while preserving no-root-cause wording',()=>{
  assert.match(evidence,/ALERTA DE CORRELAÇÃO — REQUER ANÁLISE/);
  assert.match(evidence,/var\(--danger,#d92d20\)/);
  assert.match(evidence,/data-has-alerts/);
  assert.match(evidence,/não confirma causa raiz/);
  assert.match(evidence,/PRIORIDADE ALTA/);
});
