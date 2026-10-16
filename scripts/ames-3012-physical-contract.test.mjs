import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const collector=fs.readFileSync(new URL('../ames/agent/ames_3012_live.py',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('../ames/agent/agent_3012_patch.py',import.meta.url),'utf8');

function pythonBin(){
  for(const candidate of [process.env.PYTHON_BIN,'python3','python'].filter(Boolean)){
    const probe=spawnSync(candidate,['--version'],{encoding:'utf8'});
    if(probe.status===0)return candidate;
  }
  return null;
}

test('3012 never injects the ExtJS 2008 time epoch into the physical date/time filters',()=>{
  assert.doesNotMatch(collector,/new Date\(2008\s*,/);
  assert.match(collector,/resolveDateTimePair/);
  assert.match(collector,/Start\/End nao resolveram quatro campos distintos/);
  assert.match(collector,/Defect Time Start foi alterado ao preencher a hora/);
  assert.match(collector,/Defect Time End foi alterado ao preencher a hora/);
});

test('3012 exact SN window remains 24 Jan 2026 through the end of tomorrow',()=>{
  assert.match(patch,/EXACT_SN_HISTORY_START = datetime\(2026, 1, 24, 0, 0, 0\)/);
  assert.match(patch,/current \+ timedelta\(days=1\)\)\.replace\(hour=23, minute=59, second=59/);
});

test('3012 View uses the visible physical button before internal fallbacks and waits for a new store load',()=>{
  assert.match(collector,/physicalViewElement/);
  assert.match(collector,/MouseEvent\('mousedown'/);
  assert.match(collector,/MouseEvent\('mouseup'/);
  assert.match(collector,/el\.click\(\)/);
  assert.match(collector,/physical_dom_click/);
  assert.match(collector,/store\.on\('load',finish,null,\{single:true\}\)/);
  assert.match(collector,/View foi acionado mas a store nao respondeu/);
});

test('3012 normalization preserves AT repair comment and repair evidence',()=>{
  const py=pythonBin();
  assert.ok(py,'Python is required by the A-MES quality gate');
  const code=String.raw`
import sys
sys.path.insert(0,'ames/agent')
import ames_3012_live as m
row=m.normalize_3012_row({
  'lotId':'00252700000000000001',
  'defectCode':'GN01-TX02',
  'defectDesc':'Antenna: ANT1 test failed',
  'repairUser':'AT001',
  'repairTime':'2026-10-16 11:30:00',
  'repairCode':'MainBoard',
  'repairComment':'Troca antena ANT1; reteste OK'
})
assert row['pcba_sn']=='00252700000000000001'
assert row['repair_user']=='AT001'
assert row['repair_code']=='MainBoard'
assert row['repair_comment']=='Troca antena ANT1; reteste OK'
`;
  const run=spawnSync(py,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
});

test('3012 diagnostics expose the physical View action used for factory evidence',()=>{
  assert.match(collector,/"view_action":raw\.get\("viewAction"\)/);
});
