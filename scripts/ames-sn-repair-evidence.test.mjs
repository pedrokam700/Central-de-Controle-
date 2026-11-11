import test from 'node:test';
import assert from 'node:assert/strict';
import {provenRepairUserName,projectRepairTechnicianNames} from '../ames/console-sn-repair-evidence.mjs';
import {a6900TechnicianFor,a6900ForSnRepair} from '../ames/data/a6900-technician.mjs';

const repair=(overrides={})=>({pcba_sn:'PCB-A',repair_user:'BRM00068',repair_comment:'linha 1\nlinha 2',...overrides});
const base=()=>({sn:'PCB-A',detected_type:'PCBA',trace_3022:{operator_evidence:[]}});

test('Repair User gains a human name only from exact same-PCBA 3022 operator ID evidence',()=>{
  const result=base();
  result.trace_3022.operator_evidence=[{pcba_sn:'PCB-A',operator_id:'BRM00068',operator_name:'Irlane',station:'A6900'}];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),'Irlane');
});

test('same operator ID on another PCBA does not rename the repair user',()=>{
  const result=base();
  result.trace_3022.operator_evidence=[{pcba_sn:'PCB-B',operator_id:'BRM00068',operator_name:'Irlane'}];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
});

test('3022 row without PCBA can only be contextualized to the currently queried PCBA',()=>{
  const result=base();
  result.trace_3022.process_passages=[{operator_id:'BRM00068',operator_name:'Irlane'}];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),'Irlane');
  assert.equal(provenRepairUserName(repair({pcba_sn:'PCB-OLD'}),result,'PCB-A'),null);
});

test('missing or conflicting 3022 names fail closed',()=>{
  const result=base();
  result.trace_3022.rows=[
    {pcba_sn:'PCB-A',operator_id:'BRM00068',operator_name:'Irlane'},
    {pcba_sn:'PCB-A',operator_id:'BRM00068',operator_name:'Different Name'},
  ];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
  result.trace_3022.rows=[{pcba_sn:'PCB-A',operator_id:'BRM00068'}];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
});

test('operator ID match is exact rather than fuzzy',()=>{
  const result=base();
  result.trace_3022.operator_evidence=[{pcba_sn:'PCB-A',operator_id:'BRM000680',operator_name:'Wrong'}];
  assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
});

test('explicit repairer name on same original 3012 row is accepted without guessing code',()=>{
 const result=base();
 const repairRow=repair({raw:{raw:{repairUser:'BRM00068',repairUserName:'Technician A'}}});
 assert.equal(provenRepairUserName(repairRow,result,'PCB-A'),'Technician A');
});
test('missing repairer name in both 3012 and 3022 must remain unknown',()=>{
 const result=base();
 result.trace_3022.process_passages=[{pcba_sn:'PCB-A',operator_id:'BRM00068'}];
 assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
});

test('3022 Tran User ID + Tran User name resolves 3012 Repair User in the queried PCBA only',()=>{
 const result=base();
 result.trace_3022.rows=[{pcba_sn:'PCB-A','Tran User ID':'BRM00068','Tran User':'Real Operator'}];
 assert.equal(provenRepairUserName(repair(),result,'PCB-A'),'Real Operator');
 result.trace_3022.rows=[{pcba_sn:'PCB-B','Tran User ID':'BRM00068','Tran User':'Wrong Board Operator'}];
 assert.equal(provenRepairUserName(repair(),result,'PCB-A'),null);
});

test('historical names in saved 3022 process events resolve only their original PCBA and matching BRM',()=>{
 const result=base();
 result.local_snapshot={process_events:[
  {pcba_sn:'PCB-A',station:'A6900',operator_id:'BRM00068',operator_name:'Historical Operator',event_time:'2026-11-09 09:12:18'},
  {pcba_sn:'PCB-B',station:'A6900',operator_id:'BRM00068',operator_name:'Unrelated Operator',event_time:'2026-11-09 09:12:18'}
 ]};
 assert.equal(provenRepairUserName(repair(),result,'PCB-A'),'Historical Operator');
 assert.equal(provenRepairUserName(repair({pcba_sn:'PCB-C'}),result,'PCB-A'),null);
});

test('same 3012 Repair User resolves 3022 Tran User ID and Tran User name in any supported table',()=>{
 const rows=[{pcba_sn:'PCB-A',repair_user:'BRM00061',repair_comment:'Comentario 1'},
   {pcba_sn:'PCB-B',repair_user:'BRM00061',repair_comment:'Comentario 2'}];
 const events=[{pcba_sn:'PCB-A','Tran User ID':'BRM00061','Tran User':'Maria Teste'},
   {pcba_sn:'PCB-B','Tran User ID':'BRM00061','Tran User':'João Teste'}];
 const out=projectRepairTechnicianNames(rows,events);
 assert.equal(out[0].repair_technician_name,'Maria Teste');
 assert.equal(out[1].repair_technician_name,'João Teste');
 assert.equal(rows[0].repair_technician_name,undefined,'source stays immutable');
});
test('unconfirmed or conflicting 3022 identities never fabricate an AT name',()=>{
 const row={pcba_sn:'PCB-A',repair_user:'BRM00061'};
 assert.equal(projectRepairTechnicianNames([row],[{pcba_sn:'PCB-B','Tran User ID':'BRM00061','Tran User':'Outro'}])[0].repair_technician_name,null);
 assert.equal(projectRepairTechnicianNames([row],[
   {pcba_sn:'PCB-A','Tran User ID':'BRM00061','Tran User':'Nome A'},
   {pcba_sn:'PCB-A','Tran User ID':'BRM00061','Tran User':'Nome B'}
 ])[0].repair_technician_name,null);
});

test('A6900 analyst is not chosen from matching BRM at a different station or from another failure day',()=>{
 const row=repair({defect_time:'2026-11-04 09:00:00',repair_time:'2026-11-04 11:00:00'});
 const events=[
  {pcba_sn:'PCB-A',station:'A5265',event_time:'2026-11-04 10:00:00',operator_id:'BRM00068',operator_name:'Export Operator'},
  {pcba_sn:'PCB-A',station:'A6900',event_time:'2026-11-04 10:10:00',operator_id:'BRM00099',operator_name:'Actual Fault Technician'},
  {pcba_sn:'PCB-A',station:'A6900',event_time:'2026-11-05 10:10:00',operator_id:'BRM00055',operator_name:'Next Day Operator'},
  {pcba_sn:'PCB-B',station:'A6900',event_time:'2026-11-04 10:10:00',operator_id:'BRM00055',operator_name:'Different Board'},
 ];
 assert.deepEqual(a6900TechnicianFor(row,events),{name:'Actual Fault Technician',id:'BRM00099',station:'A6900'});
 assert.deepEqual(a6900ForSnRepair(row,{sn:'PCB-A',trace_3022:{operator_evidence:events}},'PCB-A'),
  {name:'Actual Fault Technician',id:'BRM00099',station:'A6900'});
 assert.equal(a6900TechnicianFor(row,events.filter(event=>event.station!=='A6900'||event.pcba_sn==='PCB-B')),null);
});

test('historical A6900 operator remains visible as a qualified candidate when 3012 and 3022 clocks differ by one hour',()=>{
 const row=repair({repair_user:'BRM00151',defect_time:'2026-11-09 10:11:00',repair_time:'2026-11-09 10:12:09'});
 const old={pcba_sn:'PCB-A',station:'A6900',event_time:'2026-11-09 09:12:18',operator_id:'BRM00151',operator_name:'Jamile Maria'};
 const latest={pcba_sn:'PCB-A',station:'A6900',event_time:'2026-11-10 16:54:05',operator_id:'BRM00075',operator_name:'Jonathan Pires'};
 const candidate=a6900TechnicianFor(row,[old,latest]);
 assert.deepEqual(candidate,{name:'Jamile Maria',id:'BRM00151',station:'A6900',confidence:'nearby_repair_clock',event_time:old.event_time});
 assert.deepEqual(a6900ForSnRepair(row,{sn:'PCB-A',trace_3022:{operator_evidence:[latest]},
  local_snapshot:{process_events:[old]}},'PCB-A'),candidate,'the saved exact-board 3022 event is reusable without recollecting');
 assert.equal(a6900TechnicianFor(row,[{...old,operator_id:'BRM00999'},latest]),null,
  'the 3012 Repair User cannot authenticate a different A6900 operator in the fallback window');
 assert.equal(a6900TechnicianFor(row,[old,{...old,operator_id:'BRM00777',operator_name:'Another Operator'}]),null,
  'two different A6900 people in the same nearby window are ambiguous');
});
