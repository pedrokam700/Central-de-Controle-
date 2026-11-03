import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseOverviewMetrics} from '../ames/console-reuse-cohorts.mjs';
import {summarizeReusePopulation} from '../ames/data/reuse-cohorts.mjs';

test('compact reuse cards do not split second and third-plus uses',()=>{
 const sample=summarizeReusePopulation([
  {id:'one',reused:false,use_index:1,outcome:'unknown',prior_events:[],same_failure:false},
  {id:'two',reused:true,use_index:2,outcome:'failed',prior_events:[{id:'p'}],same_failure:true},
  {id:'three',reused:true,use_index:3,outcome:'unknown',prior_events:[],same_failure:false}
 ]);
 assert.equal(sample.counts.reused,2);
 assert.deepEqual(sample.metrics.reused.map(r=>r.use_index),[2,3]);
 assert.equal(sample.counts.same_failure,1);
 for(const kind of ['pcbas','components']){
  assert.equal(reuseOverviewMetrics[kind].filter(key=>key==='reused').length,1);
  assert(!reuseOverviewMetrics[kind].includes('second_use'));
  assert(!reuseOverviewMetrics[kind].includes('third_plus_use'));
 }
});
test('unproven failure outcome is not reclassified as no prior failure',()=>{
 const sample=summarizeReusePopulation([{id:'x',reused:true,use_index:2,outcome:'unknown',prior_events:[],same_failure:false}]);
 assert.equal(sample.counts.verified_no_failure,null);
 assert.equal(sample.failure_rate,null);
});
