import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const patch=fs.readFileSync(new URL('../ames/agent/factory_redfix.py',import.meta.url),'utf8');
const collector3012=fs.readFileSync(new URL('../ames/agent/ames_3012_live.py',import.meta.url),'utf8');
const agent3012=fs.readFileSync(new URL('../ames/agent/agent_3012_patch.py',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../ames/agent/fastlane_runtime_guard.py',import.meta.url),'utf8');
const process3022=fs.readFileSync(new URL('../ames/factory-engine/ames/tela_3022.py',import.meta.url),'utf8');
const evidence=fs.readFileSync(new URL('../ames/evidence-view.mjs',import.meta.url),'utf8');

function pythonBin(){for(const candidate of [process.env.PYTHON_BIN,'python3','python'].filter(Boolean)){const p=spawnSync(candidate,['--version'],{encoding:'utf8'});if(p.status===0)return candidate;}return null;}

test('factory RED guards preserve mapped 3012 V2 and do not modify production 3022 collector',()=>{
  assert.match(guard,/factory_redfix\.install\(entry_module\)/);
  assert.match(patch,/cancel_aware_live_event/);
  assert.match(patch,/2114_VISIBLE_PCBA_MISMATCH/);
  assert.match(patch,/QUERY_CONTRACT.*3012-home-mapped-v2/s);
  assert.match(collector3012,/QUERY_CONTRACT = "3012-home-mapped-v2"/);
  assert.match(collector3012,/SOURCE_3012 = "AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2"/);
  assert.match(collector3012,/byItemId\('grdDefectRepair'/);
  assert.match(collector3012,/byItemId\('btnView'/);
  assert.match(collector3012,/applyDateTime\('dteFromDate'/);
  assert.match(collector3012,/applyDateTime\('dteToDate'/);
  assert.doesNotMatch(process3022,/factory-redfix-3012|2114_VISIBLE_PCBA_MISMATCH|cancel_aware_live_event/);
});

test('cancel checkpoint, 2114 visible-PCBA fail-closed and mapped 3012 redfix idempotence are executable contracts',()=>{
  const py=pythonBin();assert.ok(py,'Python required');
  const code=String.raw`
import sys,threading,types
from datetime import datetime
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
before=live.QUERY_3012_JS
f._install_3012_field_resolution()
assert live.QUERY_3012_JS==before, 'legacy fuzzy redfix rewrote mapped V2 collector'
assert live.QUERY_CONTRACT=='3012-home-mapped-v2'
assert live.SOURCE_3012=='AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2'
for marker in ['txtSnImei','grdDefectRepair','btnView','dteFromDate','dteToDate','STORE_REBOUND_AFTER_VIEW','3012_VIEW_NOT_EXECUTED']:
    assert marker in live.QUERY_3012_JS, marker
row=live.normalize_3012_row({'lotId':'002527TEST','repairComment':'comentario AT preservado','repairUser':'AT01','repairTime':'2026-10-16 09:10:00'})
assert row['repair_comment']=='comentario AT preservado'
assert row['repair_user']=='AT01'

import agent_3012_patch as p3012
start,end=p3012.exact_sn_history_window(datetime(2026,10,16,9,30,0))
assert start==datetime(2026,1,24,0,0,0)
assert end==datetime(2026,10,17,23,59,59)
print('factory guards + mapped 3012 V2 contracts OK')
`;
  const run=spawnSync(py,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test('exact-SN 3012 policy is pinned to factory baseline while broad query fallback stays separate',()=>{
  assert.match(agent3012,/EXACT_SN_HISTORY_START = datetime\(2026, 1, 24, 0, 0, 0\)/);
  assert.match(agent3012,/current \+ timedelta\(days=1\)/);
  assert.match(agent3012,/exact_start, exact_end = exact_sn_history_window\(\)/);
  assert.match(agent3012,/exact_end if exact_targets else datetime\.now\(\)/);
});

test('SN correlation alerts are visually explicit while preserving no-root-cause wording',()=>{
  assert.match(evidence,/ALERTA DE CORRELAÇÃO — REQUER ANÁLISE/);
  assert.match(evidence,/var\(--danger,#d92d20\)/);
  assert.match(evidence,/data-has-alerts/);
  assert.match(evidence,/não confirma causa raiz/);
  assert.match(evidence,/PRIORIDADE ALTA/);
});
