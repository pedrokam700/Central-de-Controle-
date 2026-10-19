import test from 'node:test';
import assert from 'node:assert/strict';
import {fiveSourceEvidence} from '../ames/data/source-coverage.mjs';

test('five source statuses never turn missing queries into zero or into verified no-failure',()=>{
 const p={source_coverage:{
   '3028':{status:'observed_partial',stored_rows:4,source_complete:false,transport_complete:true,scope:'snapshot_line_context'},
   '3074':{status:'unknown',stored_rows:0,source_complete:false,transport_complete:true},
   '2114':{status:'observed_partial',stored_rows:3,source_complete:false,transport_complete:true},
   '3022':{status:'unknown',stored_rows:0,source_complete:false,transport_complete:true},
   '3012':{status:'candidate_partial',stored_rows:1,source_complete:false,transport_complete:true},
 }};
 const res=fiveSourceEvidence(p);
 assert.deepEqual(res.map(x=>x.view),['3028','3074','2114','3022','3012']);
 assert.equal(res[0].count,4);
 assert.equal(res[1].count,null);
 assert.equal(res[3].count,null);
 assert.equal(res[4].count,1);
 assert.equal(res[4].status,'candidate_partial');
 assert.equal(res[4].candidateOnly,true);
 assert(res.every(x=>!x.sourceComplete));
 assert(res.every(Object.isFrozen));
});
test('legacy revisions have unverified source collection, not invented 0',()=>{
 const old=fiveSourceEvidence({datasets:{defects:[],material_reuse:[]}});
 assert.equal(old.length,5);
 for(const item of old){assert.equal(item.status,'unknown');assert.equal(item.count,null);}
});
test('corrupt source completeness and missing evidence counts fail closed',()=>{
 const z=fiveSourceEvidence({coverage:{sources:{
  '3074':{status:'observed_partial',stored_rows:-5,transport_complete:false,source_complete:false},
  '3012':{status:'some_untrusted_state',stored_rows:100,source_complete:false}
 }}});
 assert.equal(z[1].count,null);
 assert.equal(z[1].status,'observed_partial');
 assert.equal(z[4].status,'unknown');
 assert.equal(z[4].count,null);
});
