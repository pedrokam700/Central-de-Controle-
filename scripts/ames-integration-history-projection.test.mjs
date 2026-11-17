import test from 'node:test';
import assert from 'node:assert/strict';
import {board2114Timeline} from '../ames/data/reuse-cohorts.mjs';
import {renderBoardComparisonTable} from '../ames/console-reuse-cohorts.mjs';
test('cohort projection must retain explicit 2114 author and observation lineage for the historical timeline',()=>{
 const row={pcba_sn:'P',source_view:'2114',hist_seq:0,defect_code:'D',defect_time:'2026-11-01 08:00:00',
  defect_user:'AUTHOR-0',defect_user_name:'Autor sintético',source_id:'SYNTHETIC',snapshot_id:'1',snapshot_revision:2,line_id:'TAN10101'};
 const rows=board2114Timeline('P',[row]);
 assert.equal(rows[0].defect_user_name,row.defect_user_name);
 assert.equal(rows[0].source_id,row.source_id);assert.equal(rows[0].snapshot_revision,2);
 const html=renderBoardComparisonTable({sn:'P',history_2114:rows,events:[]});
 assert.match(html,/Autor sintético/);assert.match(html,/SYNTHETIC/);
});
test('same 2114 sequence from another revision or contradictory author must remain inspectable without extra recurrence',()=>{
 const row={pcba_sn:'P',source_view:'2114',hist_seq:0,defect_code:'D',snapshot_revision:2,defect_user_name:'Autor A'};
 const rows=board2114Timeline('P',[row,structuredClone(row),{...row,snapshot_revision:3},{...row,defect_user_name:'Autor B'}]);
 assert.equal(rows.length,3);
 assert(rows.every(r=>r.repeat_exact_prior_count===0));
 const withLater=board2114Timeline('P',[row,{...row,snapshot_revision:3},{...row,defect_user_name:'Autor B'},
  {...row,hist_seq:1}]);
 assert.equal(withLater.find(r=>r.hist_seq===1).repeat_exact_prior_count,1);
});
