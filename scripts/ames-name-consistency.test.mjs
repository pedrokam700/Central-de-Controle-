import test from 'node:test';
import assert from 'node:assert/strict';
import {
  provenRepairUserName,
  projectRepairTechnicianNames,
  normalize3022OperatorRows
} from '../ames/console-sn-repair-evidence.mjs';

// Fake evidence only: no MES, network, files, browser or production SQLite.
const repair=(extras={})=>({
  pcba_sn:'PCBA-ONE',repair_user:'BRM00123',
  source_id:'SRC-1',line_id:'TAN10101',...extras
});
const event=(extras={})=>({
  pcba_sn:'PCBA-ONE',operator_id:'BRM00123',
  operator_name:'Operadora Confirmada',source_id:'SRC-1',
  line_id:'TAN10101',station:'A6900',event_time:'2026-11-10 11:22:33',...extras
});

test('N1: SN story and Dashboard table display same explicitly named 3012 repair',()=>{
  const row=repair({raw:{raw:{repairUserName:'Técnica do próprio reparo'}}});
  assert.equal(provenRepairUserName(row,{sn:'PCBA-ONE'}),'Técnica do próprio reparo');
  const projected=projectRepairTechnicianNames([row],[]);
  assert.equal(projected[0].repair_technician_name,'Técnica do próprio reparo');
  assert.equal(row.repair_technician_name,undefined,'3012 payload must be immutable');
});

test('N3: foreign explicit source is not a person identity for this repair',()=>{
  const row=repair();
  const foreign=event({provenance:{source_id:'SRC-FOREIGN'},source_id:undefined});
  assert.equal(provenRepairUserName(row,{sn:row.pcba_sn,trace_3022:{operator_evidence:[foreign]}}),null);
  assert.equal(projectRepairTechnicianNames([row],[foreign])[0].repair_technician_name,null);
});

test('N3: explicit line conflict must be rejected in both views',()=>{
  const row=repair(),foreign=event({line_id:'TAN10103'});
  assert.equal(provenRepairUserName(row,{sn:row.pcba_sn,trace_3022:{operator_evidence:[foreign]}}),null);
  assert.equal(projectRepairTechnicianNames([row],[foreign])[0].repair_technician_name,null);
});

test('same PCBA + MES user with compatible proven source resolves identically',()=>{
  const row=repair(),matched=event();
  assert.equal(provenRepairUserName(row,{sn:row.pcba_sn,trace_3022:{operator_evidence:[matched]}}),'Operadora Confirmada');
  assert.equal(projectRepairTechnicianNames([row],[matched])[0].repair_technician_name,'Operadora Confirmada');
});

test('historical 3022 row lacking optional source metadata is allowed only for same PCBA and ID',()=>{
  const row=repair(),legacy={pcba_sn:'PCBA-ONE',operator_id:'BRM00123',operator_name:'Nome histórico'};
  assert.equal(projectRepairTechnicianNames([row],[legacy])[0].repair_technician_name,'Nome histórico');
  assert.equal(projectRepairTechnicianNames([row],[{...legacy,pcba_sn:'PCBA-TWO'}])[0].repair_technician_name,null);
  assert.equal(projectRepairTechnicianNames([row],[{...legacy,operator_id:'BRM99999'}])[0].repair_technician_name,null);
});

test('conflicting names under the exact same scoped PCBA+ID remain unknown',()=>{
  const row=repair(),a=event({operator_name:'Nome A'}),b=event({operator_name:'Nome B'});
  assert.equal(provenRepairUserName(row,{sn:row.pcba_sn,trace_3022:{operator_evidence:[a,b]}}),null);
  assert.equal(projectRepairTechnicianNames([row],[a,b])[0].repair_technician_name,null);
});

test('wrapped 3022 adapter inherits source+line and cannot contaminate another source',()=>{
  const wrapped={pcba_sn:'PCBA-ONE',source_id:'SRC-FOREIGN',line_id:'TAN10101',
    provenance:{adapter:{operator_evidence:{
      station:'A6900',operator_id:'BRM00123',operator_name:'Outra pessoa'
    }}}};
  const normalized=normalize3022OperatorRows([wrapped]);
  assert.equal(normalized[0].source_id,'SRC-FOREIGN');
  assert.equal(normalized[0].line_id,'TAN10101');
  assert.equal(projectRepairTechnicianNames([repair()],[wrapped])[0].repair_technician_name,null);
});

test('wrapper and nested event with explicit contradictory origin are discarded',()=>{
  const row=repair(),eventRow={pcba_sn:'PCBA-ONE',source_id:'SRC-1',
    provenance:{adapter:{operator_evidence:{
      pcba_sn:'PCBA-ONE',source_id:'SRC-OTHER',operator_id:'BRM00123',
      operator_name:'Incompatível'
    }}}};
  assert.equal(normalize3022OperatorRows([eventRow]).some(x=>x.operator_name==='Incompatível'),false);
  assert.equal(projectRepairTechnicianNames([row],[eventRow])[0].repair_technician_name,null);
});
