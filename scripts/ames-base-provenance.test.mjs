import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedDatasetProvenance,completedDatasetProvenance} from '../ames/console-base-view.mjs';
import {SOURCE_STATE} from '../ames/data/source-provenance.mjs';

test('shared Base does not turn missing 2114 into zero',()=>{
  const snapshot={pcba_history:{records:[]}};
  assert.equal(sharedDatasetProvenance(snapshot,'pcba_history'),SOURCE_STATE.NOT_COLLECTED);
});

test('shared Base preserves explicit unavailable/error source states',()=>{
  const snapshot={
    pcba_history:{status:'unavailable',records:[]},
    material_trace:{status:'error',error:'3074 failed',records:[]},
  };
  assert.equal(sharedDatasetProvenance(snapshot,'pcba_history'),SOURCE_STATE.UNAVAILABLE);
  assert.equal(sharedDatasetProvenance(snapshot,'material_reuse'),SOURCE_STATE.ERROR);
});

test('completed 3022 with zero rows is a proven zero',()=>{
  const snapshot={process_timeline:{status:'available',events:[],contexts:[]}};
  assert.equal(sharedDatasetProvenance(snapshot,'process_events'),SOURCE_STATE.ZERO);
  assert.equal(sharedDatasetProvenance(snapshot,'process_defect_contexts'),SOURCE_STATE.ZERO);
});

test('positive shared evidence is current unless the line read itself is cached',()=>{
  const snapshot={material_trace:{status:'available',records:[{item_sn:'MAT-1'}]}};
  assert.equal(sharedDatasetProvenance(snapshot,'material_reuse',SOURCE_STATE.OK),SOURCE_STATE.OK);
  assert.equal(sharedDatasetProvenance(snapshot,'material_reuse',SOURCE_STATE.CACHED),SOURCE_STATE.CACHED);
});

test('cached snapshot never upgrades explicit source error to cache evidence',()=>{
  const snapshot={pcba_history:{status:'error',error:'shift missing',records:[]}};
  assert.equal(sharedDatasetProvenance(snapshot,'pcba_history',SOURCE_STATE.CACHED),SOURCE_STATE.ERROR);
});

test('3028 snapshot zero and local SQLite completed zero remain legitimate zero',()=>{
  assert.equal(sharedDatasetProvenance({occurrences:[]},'defects',SOURCE_STATE.OK),SOURCE_STATE.ZERO);
  assert.equal(sharedDatasetProvenance({occurrences:[]},'defects',SOURCE_STATE.CACHED),SOURCE_STATE.CACHED);
  assert.equal(completedDatasetProvenance([],0),SOURCE_STATE.ZERO);
  assert.equal(completedDatasetProvenance([],5),SOURCE_STATE.OK,'an empty page is not a zero dataset when server total proves rows exist');
  assert.equal(completedDatasetProvenance([{pcba_sn:'P1'}],1),SOURCE_STATE.OK);
});
