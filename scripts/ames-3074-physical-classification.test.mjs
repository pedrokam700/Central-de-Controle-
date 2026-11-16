import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReuseCohorts} from '../ames/data/reuse-cohorts.mjs';
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
