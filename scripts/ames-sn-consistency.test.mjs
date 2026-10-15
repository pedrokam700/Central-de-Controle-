import test from 'node:test';
import assert from 'node:assert/strict';
import {snConsistencySummary} from '../ames/console-sn-consistency.mjs';

test('SN consistency sees current and previous failures recovered from raw 2114 rows',()=>{
  const summary=snConsistencySummary({
    sn:'PCBA-CURRENT',detected_type:'PCBA',
    trace_2114:{pcbas:[
      {pcba_sn:'PCBA-CURRENT',status:'COMPLETE',result:{rows:[{'Lot Id':'PCBA-CURRENT','Defect Hist Seq':'5','Defect Code':'CUR','Defect Description':'Current failure','Defect Time':'2026-10-14 12:00:00'}]}},
      {pcba_sn:'PCBA-OLD',status:'COMPLETE',result:{rows:[{'Lot Id':'PCBA-OLD','Defect Hist Seq':'2','Defect Code':'OLD','Defect Description':'Old failure','Defect Time':'2026-09-01 09:00:00'}]}},
    ]},
    trace_3074:{reused_components:[{item_sn:'MAT1',item_type:'Camera',previous_pcbas:['PCBA-OLD'],previous_pcba_evidence:[],relation_to_current_failure:'FALHA_DIFERENTE'}]},
  });
  assert.equal(summary.current.defect_code,'CUR');
  assert.equal(summary.raw_current_recovered,true);
  assert.equal(summary.raw_previous_recovered.length,1);
  assert.equal(summary.raw_previous_recovered[0].failure.defect_code,'OLD');
});
