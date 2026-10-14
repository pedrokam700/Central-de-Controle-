import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseGroupSourceState} from '../ames/console-reuse-provenance.mjs';
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
