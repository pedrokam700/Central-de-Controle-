import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const collector=fs.readFileSync(new URL('../ames/agent/ames_3012_live.py',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../ames/factory-engine/ames/navigation.py',import.meta.url),'utf8');

function pythonBin(){
  for(const candidate of [process.env.PYTHON_BIN,'python3','python'].filter(Boolean)){
    const probe=spawnSync(candidate,['--version'],{encoding:'utf8'});
    if(probe.status===0)return candidate;
  }
  return null;
}

test('3012 collector pins the canonical Home surface and exposes provenance',()=>{
  assert.match(collector,/ROUTE_3012 = "UAWIP\.form\.VwDefectRepairView"/);
  assert.match(collector,/HOME_SURFACE = "\/asymes\/home"/);
  assert.match(collector,/OPC_SURFACE = "\/asymes\/opc"/);
  assert.match(collector,/AWIP3012_HOME_DIRECT_EXTJS/);
  assert.match(collector,/"surface":"home"/);
  assert.match(collector,/variante OPC foi recusada/);
});

test('canonical navigator knows 3012 as Home while 2114 remains OPC',()=>{
  assert.match(navigation,/"3012": "UAWIP\.form\.VwDefectRepairView"/);
  assert.match(navigation,/def ensure_3012\(/);
  assert.match(navigation,/3012 canônica exige a superfície \/asymes\/home; variante OPC recusada/);
  assert.match(navigation,/def ensure_2114\(/);
  assert.match(navigation,/"2114": "UAWIP\.form\.TrDefectLotByHandView"/);
});

test('3012 URL helpers reject the OPC look-alike even with the same hash',()=>{
  const py=pythonBin();
  assert.ok(py,'Python is required by the A-MES quality gate');
  const code=String.raw`
import sys
sys.path.insert(0,'ames/agent')
import ames_3012_live as m
host='172.29.185.215'
home='http://172.29.185.215/asymes/home#UAWIP.form.VwDefectRepairView'
opc='http://172.29.185.215/asymes/opc#UAWIP.form.VwDefectRepairView'
assert m._is_home_3012_url(home,host)
assert not m._is_home_3012_url(opc,host)
assert m._home_base_from_url(opc)=='http://172.29.185.215/asymes/home'
assert m._home_base_from_url(home)=='http://172.29.185.215/asymes/home'
`;
  const run=spawnSync(py,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
});
