import test from 'node:test';
import assert from 'node:assert/strict';
import {provenRepairUserName,projectRepairTechnicianNames} from '../ames/console-sn-repair-evidence.mjs';

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
