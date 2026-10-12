import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reuseExactId, reuseColumns } from '../ames/console-wave3-views.mjs';

test('drill-down R12 destaca PCBA material e correlação usando os nomes reais da fonte',()=>{
  assert.equal(reuseExactId({PCBA:'002527PCBA','Defect Code':'ANT1'},'pcba_second_use'),'002527PCBA');
  assert.equal(reuseExactId({'PCBA atual':'002527CUR','Material SN':'MAT-001','Tipo material':'ANT','PCBAs desvinculadas':'002527OLD1 | 002527OLD2'},'material_second_use'),'MAT-001');
  assert.equal(reuseExactId({'Material SN':'MAT-001','PCBA desvinculada':'002527OLD1','PCBA atual':'002527CUR'},'correlation_same_failure'),'MAT-001 ↔ 002527OLD1');
  assert.equal(reuseExactId({current_pcba_sn:'002527CANON',item_sn:'MAT-CANON'},'pcba_second_use'),'002527CANON');
  assert.equal(reuseExactId({current_pcba_sn:'002527CANON',item_sn:'MAT-CANON'},'material_second_use'),'MAT-CANON');
});

test('tabela de reuso prioriza a evidência desvinculada em vez de cortar pelos primeiros campos',()=>{
  const row={
    Linha:'TAN10103',Modelo:'CPH2817','PCBA atual':'002527CUR','Defect Time atual':'2026-10-09 10:00',
    'Defect Code atual':'ANT1','Defect Desc atual':'Falha','Tipo material':'ANT','Material SN':'MAT-001',
    'Uso material na falha':2,'Reusos anteriores material':1,'Usos conhecidos material':2,'Reusos conhecidos material':1,
    'PCBAs desvinculadas únicas':2,'PCBAs com mesma falha':1,'PCBAs com mesma família':1,'PCBAs com falha diferente':0,
    'PCBAs desvinculadas':'002527OLD1 | 002527OLD2',_internal:'nao_exibir'
  };
  const keys=reuseColumns(row,'material_same_failure').map(([key])=>key);
  assert.ok(keys.includes('Material SN'));
  assert.ok(keys.includes('PCBA atual'));
  assert.ok(keys.includes('PCBAs desvinculadas'));
  assert.ok(keys.includes('PCBAs desvinculadas únicas'));
  assert.ok(!keys.includes('_internal'));
});
