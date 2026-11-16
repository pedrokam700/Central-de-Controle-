// Focused U1 parity: original 2114 facts remain visible after removing the duplicate table.
// This test uses synthetic data; it never connects to the factory MES or SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBoardComparisonTable} from '../ames/console-reuse-cohorts.mjs';

test('U1a: two original 2114 passages and one 3028 fault remain independent',()=>{
  globalThis.document={documentElement:{lang:'pt-BR'}};
  const board={sn:'SYNTH-PCBA-U1',
    history_2114:[
      {pcba_sn:'SYNTH-PCBA-U1',record_id:'H-0',hist_seq:0,
       defect_code:'GN-U1',defect_desc:'Falha anterior A',defect_time:null,
       defect_type:'MainBoard',analysis_scope:'mainboard',repair_status:'RESOLVED',
       history_order_proven:true,repeat_exact_prior_count:0},
      {pcba_sn:'SYNTH-PCBA-U1',record_id:'H-1',hist_seq:1,
       defect_code:'GN-U1',defect_desc:'Falha anterior B',defect_time:'2026-11-10 09:30:00',
       defect_type:'Phone Disassembly',analysis_scope:'phone',repair_status:'PENDING',
       history_order_proven:true,repeat_exact_prior_count:1}
    ],
    events:[{pcba_sn:'SYNTH-PCBA-U1',record_id:'CUR',defect_code:'GN-U1',
      defect_desc:'Falha atual',defect_time:'2026-11-16 09:45:00'}]
  };
  const html=renderBoardComparisonTable(board);
  assert.equal((html.match(/data-board-failure-row/g)||[]).length,3,
    'each 2114 and 3028 source passage must keep a separate row');
  for(const required of ['Falha anterior A','Falha anterior B','Falha atual',
    'MainBoard','Phone Disassembly','RESOLVED','PENDING','Hist Seq 0','Hist Seq 1',
    'Mesma falha anterior','Escopo do processo']){
    assert.ok(html.includes(required),`original fact disappeared: ${required}`);
  }
  assert.doesNotMatch(html,/data-board-2114-timeline/,
    'the duplicate 2114 table must not be reintroduced');
  assert.match(html,/data-reuse-3012-history/,
    '3012 facts still have their own source and must not be fabricated onto 2114');
});
