import test from 'node:test';
import assert from 'node:assert/strict';
import {board2114Timeline} from '../ames/data/reuse-cohorts.mjs';
test('history work must reuse proven descriptors rather than reread every historical pair',()=>{
 let reads=0;
 const rows=Array.from({length:200},(_,hist_seq)=>({pcba_sn:'P',hist_seq,
  get defect_code(){reads++;return 'D';},defect_desc:'Camera impurity',source_view:'2114',
  defect_user_name:'Pessoa '+hist_seq,snapshot_revision:14}));
 const out=board2114Timeline('P',rows);
 assert.equal(out.length,200);assert.equal(out.at(-1).repeat_exact_prior_count,199);
 assert.deepEqual(out.map(r=>r.defect_user_name),rows.map(r=>r.defect_user_name));
 assert(reads<=200*40,`RED historical code reads=${reads}, linear work budget=${200*40}`);
});
