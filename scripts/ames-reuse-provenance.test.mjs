import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseGroupSourceState,reuseKpiEvidence} from '../ames/console-reuse-provenance.mjs';
import {SOURCE_STATE} from '../ames/data/source-provenance.mjs';

test('reuse KPI groups stay unknown when their source was not collected',()=>{
  const snapshot={insights:{groups:{material_kpis:[['Materiais em 2º uso',0]],pcba_kpis:[['PCBA em 2º uso',0]]}}};
  assert.equal(reuseGroupSourceState(snapshot,'material_kpis'),SOURCE_STATE.NOT_COLLECTED);
  assert.equal(reuseGroupSourceState(snapshot,'pcba_kpis'),SOURCE_STATE.NOT_COLLECTED);
});

test('completed empty source may prove zero reuse',()=>{
  const snapshot={material_trace:{status:'available',records:[]},pcba_history:{status:'available',records:[{pcba_sn:'P1'}]}};
  assert.equal(reuseGroupSourceState(snapshot,'material_kpis'),SOURCE_STATE.ZERO);
  assert.equal(reuseGroupSourceState(snapshot,'correlation_kpis'),SOURCE_STATE.ZERO);
});

test('source error does not become a zero KPI',()=>{
  const snapshot={pcba_history:{status:'error',error:'2114 unavailable',records:[]}};
  assert.equal(reuseGroupSourceState(snapshot,'pcba_kpis'),SOURCE_STATE.ERROR);
});

test('correlation becomes partial when only one required source is proven',()=>{
  const snapshot={material_trace:{status:'available',records:[{item_sn:'MAT-1'}]},pcba_history:{records:[]}};
  assert.equal(reuseGroupSourceState(snapshot,'correlation_kpis'),SOURCE_STATE.PARTIAL);
});

test('loaded rows plus current source error are partial rather than factual absence',()=>{
  const snapshot={material_trace:{status:'error',error:'refresh failed',records:[{item_sn:'MAT-1'}]}};
  assert.equal(reuseGroupSourceState(snapshot,'material_kpis'),SOURCE_STATE.PARTIAL);
});

test('reused evidence from a cached line is explicitly cached',()=>{
  const snapshot={material_trace:{status:'available',records:[{item_sn:'MAT-1'}]}};
  assert.equal(reuseGroupSourceState(snapshot,'material_kpis',SOURCE_STATE.CACHED),SOURCE_STATE.CACHED);
});

test('rate KPIs require both reuse sources instead of bypassing provenance',()=>{
  const snapshot={material_trace:{status:'available',records:[{item_sn:'MAT-1'}]},pcba_history:{status:'available',records:[{pcba_sn:'P1'}]}};
  assert.equal(reuseGroupSourceState(snapshot,'rate_kpis'),SOURCE_STATE.OK);
});

test('positive PCBA cards missing a named drilldown can still expose exact KPI evidence',()=>{
  const snapshot={insights:{drilldowns:{pcba_analysis:[
    {PCBA:'P1',_pcba_use_index:1,'Falhas registradas 2114':1},
    {PCBA:'P2',_pcba_use_index:2,'Falhas registradas 2114':1},
    {PCBA:'P3',_pcba_use_index:3,'Falhas registradas 2114':3},
  ]}}};
  assert.deepEqual(reuseKpiEvidence(snapshot,'PCBA em 1º uso').rows.map(r=>r.PCBA),['P1']);
  assert.deepEqual(reuseKpiEvidence(snapshot,'PCBAs 2º+ uso com só 1 falha 2114').rows.map(r=>r.PCBA),['P2']);
  assert.deepEqual(reuseKpiEvidence(snapshot,'PCBAs com 3+ falhas 2114').rows.map(r=>r.PCBA),['P3']);
});

test('positive material and rate cards expose the numerator evidence',()=>{
  const snapshot={insights:{drilldowns:{material_analysis:[
    {'Material SN':'M1','Tipo material':'Rear Camera','Reusos anteriores material':1,'Falhas 2114 nas desvinculadas':0,'PCBAs com mesma falha':0,'PCBAs com mesma família':0},
    {'Material SN':'M2','Tipo material':'Screen','Reusos anteriores material':2,'Falhas 2114 nas desvinculadas':2,'PCBAs com mesma falha':1,'PCBAs com mesma família':0},
  ]}}};
  assert.deepEqual(reuseKpiEvidence(snapshot,'Câmeras reutilizadas').rows.map(r=>r['Material SN']),['M1']);
  assert.deepEqual(reuseKpiEvidence(snapshot,'Screens/LCDs reutilizados').rows.map(r=>r['Material SN']),['M2']);
  assert.deepEqual(reuseKpiEvidence(snapshot,'Reuso SEM falha em PCBA desvinculada').rows.map(r=>r['Material SN']),['M1']);
  assert.deepEqual(reuseKpiEvidence(snapshot,'% materiais reutilizados com mesma falha').rows.map(r=>r['Material SN']),['M2']);
});
