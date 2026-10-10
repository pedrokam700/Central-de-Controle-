import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProcessScope } from '../ames/console-specialized-views.mjs';

test('filtro de Defect Code limita também os eventos 3022 às PCBAs do contexto',()=>{
  const contexts=[
    {pcba_sn:'PCBA-A',defect_code:'ANT1'},
    {pcba_sn:'PCBA-B',defect_code:'CAM1'},
    {pcba_sn:'PCBA-C',defect_code:'ANT1'}
  ];
  const events=[
    {pcba_sn:'PCBA-A',operation_code:'A5150'},
    {pcba_sn:'PCBA-B',operation_code:'A5162'},
    {pcba_sn:'PCBA-C',operation_code:'A5700'},
    {pcba_sn:'PCBA-X',operation_code:'A5202'}
  ];
  const scoped=filterProcessScope(contexts,events,{defect:'ANT1'});
  assert.deepEqual(scoped.pcbas,['PCBA-A','PCBA-C']);
  assert.deepEqual(scoped.contexts.map(x=>x.pcba_sn),['PCBA-A','PCBA-C']);
  assert.deepEqual(scoped.events.map(x=>x.pcba_sn),['PCBA-A','PCBA-C']);
});

test('PCBA + falha incompatíveis não exibem timeline de outra ocorrência',()=>{
  const contexts=[{pcba_sn:'PCBA-A',defect_code:'ANT1'},{pcba_sn:'PCBA-B',defect_code:'CAM1'}];
  const events=[{pcba_sn:'PCBA-A',operation_code:'A5150'},{pcba_sn:'PCBA-B',operation_code:'A5162'}];
  const scoped=filterProcessScope(contexts,events,{pcba:'PCBA-A',defect:'CAM1'});
  assert.equal(scoped.contexts.length,0);
  assert.equal(scoped.events.length,0);
  assert.equal(scoped.pcbas.length,0);
});
