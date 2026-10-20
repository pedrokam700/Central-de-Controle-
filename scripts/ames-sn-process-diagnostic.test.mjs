import test from 'node:test';
import assert from 'node:assert/strict';
import {processPassageDiagnostic} from '../ames/data/sn-process-diagnostic.mjs';

const unmapped={
  source:'3022',product_model:'CPH2819BR',failure_family:'SIM',
  defect_code:'J606-KZ03',defect_time_utc:'2026-10-20T14:59:16Z',
  registration_mode:'MANUAL',reference_confidence:'UNMAPPED',
  status:'GENERIC_ONLY_RULE_NOT_MAPPED',
  reference_reason:'Sem regra CPH/família/posto',
  previous_operation_code:'A5162',previous_event_time:'2026-10-20T14:10:00+00:00'
};
test('unmapped SIM gives previous process shift/day without inventing origin',()=>{
 const d=processPassageDiagnostic(unmapped);
 assert.equal(d.status,'unmapped');
 assert.equal(d.evidence,'3022_COMPLETED_PRE_DEFECT');
 assert.equal(d.code,'A5162');
 assert.equal(d.passage_shift,'1st Shift');
 assert.equal(d.passage_operational_date,'2026-10-20');
 assert.equal(d.passage_time,'2026-10-20T14:10:00+00:00');
 assert.equal(d.model,'CPH2819BR');
});
test('3022 passage at 03:10 is second shift and previous production day',()=>{
 const d=processPassageDiagnostic({...unmapped,previous_event_time:'2026-10-21T03:10:00-03:00',defect_time_utc:'2026-10-21T10:00:00Z'});
 assert.equal(d.passage_shift,'2nd Shift');
 assert.equal(d.passage_operational_date,'2026-10-20');
});
test('do not present future events, unzoned timestamps or non-3022 as proven passage',()=>{
 for(const row of [
  {...unmapped,previous_event_time:'2026-10-20T15:10:00Z'},
  {...unmapped,previous_event_time:'2026-10-20 11:10:00'},
  {...unmapped,source:'3012'},
  {...unmapped,defect_time_utc:null},
  {...unmapped,previous_operation_code:null}
 ]){
  const d=processPassageDiagnostic(row);
  assert.equal(d.evidence,'NOT_PROVEN');
  assert.equal(d.passage_shift,null);
  assert.equal(d.passage_operational_date,null);
 }
});
test('known rule remains mapped; the previous process never substitutes the reference',()=>{
 const d=processPassageDiagnostic({...unmapped,reference_rule_id:'CAMERA_APPEARANCE_MANUAL_A5162',reference_confidence:'CONFIRMED_OPERATIONAL_RULE'});
 assert.equal(d.status,'mapped');
 assert.equal(d.passage_shift,'1st Shift');
});
