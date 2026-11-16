import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReuseCohorts} from '../ames/data/reuse-cohorts.mjs';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {spawnSync} from 'node:child_process';
const dt='2026-11-03 09:00:00';
function fixture(row={}){
 return {source_id:'SOURCE',snapshot_id:'S',revision:4,line_id:'TAN10103',
  occurrences:[{pcba_sn:'P',defect_code:'D',defect_time:dt}],
  insights:{drilldowns:{pcba_analysis:[{PCBA:'P','Defect Code':'D','Defect Time':dt,'_pcba_use_index':2,...row}]}}};
}
test('3074 ordinal with contradictory explicit source/snapshot/revision/line is rejected',()=>{
 for(const row of [{source_id:'OTHER'},{snapshot_id:'OTHER'},{snapshot_revision:3},{revision:3},{line:'TAN10101'},
                  {snapshot_revision:4,revision:3}]){
  const out=buildReuseCohorts(fixture(row));
  assert.equal(out.pcbas.counts.second_use,0,JSON.stringify(row));
  assert.equal(out.pcbas.counts.unknown_use,1);
 }
});
test('matching explicit lineage and legacy absent lineage retain proven ordinal',()=>{
 for(const row of [{},{source_id:'SOURCE',snapshot_id:'S',snapshot_revision:4,line_id:'TAN10103'}]){
  assert.equal(buildReuseCohorts(fixture(row)).pcbas.counts.second_use,1);
 }
});
test('raw scanner -> disposable SQLite -> insights -> canonical -> Dashboard keep 1/2/3 and unknown distinct',()=>{
 const run=spawnSync(process.env.PYTHON_BIN||'python3',['scripts/agent-3074-physical-classification.test.py','--fixture'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const canonical=JSON.parse(run.stdout),snapshot=normalizeCanonical(canonical),out=buildReuseCohorts(snapshot);
 assert.deepEqual(out.pcbas.rows.map(r=>[r.sn,r.use_index]).sort(),[['P1',1],['P2',2],['P3',3],['P4',3]]);
 assert.deepEqual(out.components.rows.map(r=>[r.sn,r.use_index]).sort(),[['M1',1],['M2',2],['M3',3],['M4',null]]);
 assert.equal(out.components.counts.first_use,1);assert.equal(out.components.counts.second_use,1);
 assert.equal(out.components.counts.third_plus_use,1);assert.equal(out.components.counts.unknown_use,1);
 assert.equal(out.components.rows.find(r=>r.sn==='M4').known_mounting_cycles,2);
 assert.equal(out.components.failure_rate,null);
 assert.equal(out.pcbas.population_coverage,'unproven');
});
