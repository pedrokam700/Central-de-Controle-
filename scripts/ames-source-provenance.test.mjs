import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_STATE,normalizeSourceState,sourceDisplayValue,sourceStateFromTrace,sourceStateLabel,sourceStateTone} from '../ames/data/source-provenance.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {buildLiveSnForensics,buildLocalSnForensics} from '../ames/data/sn-forensics.mjs';

const snapshot=line=>({schema:'central-v2-ames-line-v1',line,generated_at:'2026-10-14T10:00:00-03:00',summary:{line,snapshot_id:'S',collected_at:'2026-10-14T10:00:00-03:00',defect_rows:0,fpy:100,check_fpy:100,quantity:10},defects:[]});

test('canonical source states have stable PT/EN labels and UI tones',()=>{
  assert.equal(sourceStateLabel(SOURCE_STATE.NOT_COLLECTED,'pt-BR'),'Não coletado');
  assert.equal(sourceStateLabel(SOURCE_STATE.CACHED,'en-US'),'Local cache');
  assert.equal(sourceStateTone(SOURCE_STATE.ERROR),'bad');
  assert.equal(sourceStateTone(SOURCE_STATE.PARTIAL),'warn');
  assert.equal(normalizeSourceState('failed'),SOURCE_STATE.ERROR);
});

test('unknown never renders as zero and proven zero remains numeric zero',()=>{
  assert.equal(sourceDisplayValue(0,SOURCE_STATE.NOT_COLLECTED),'—');
  assert.equal(sourceDisplayValue(null,SOURCE_STATE.UNAVAILABLE),'—');
  assert.equal(sourceDisplayValue(0,SOURCE_STATE.ZERO),0);
  assert.equal(sourceDisplayValue(7,SOURCE_STATE.CACHED),7);
});

test('trace zero requires completed query, while non-empty evidence is still evidence',()=>{
  assert.equal(sourceStateFromTrace({rows:[]},{recordCount:0,countProven:true}),SOURCE_STATE.NOT_COLLECTED,'empty default container is not proof of zero');
  assert.equal(sourceStateFromTrace({status:'ok',rows:[]},{recordCount:0,countProven:true}),SOURCE_STATE.ZERO);
  assert.equal(sourceStateFromTrace({rows:[{}]},{recordCount:1,countProven:true}),SOURCE_STATE.OK);
  assert.equal(sourceStateFromTrace({status:'partial',rows:[{}]},{recordCount:1,countProven:true}),SOURCE_STATE.PARTIAL);
  assert.equal(sourceStateFromTrace({status:'error',error:'boom'},{recordCount:0,countProven:true}),SOURCE_STATE.ERROR);
});

test('shared store exposes snapshot provenance without changing line selection',()=>{
  const store=createAmesStore();
  assert.equal(store.read('TAN10101').source_state,SOURCE_STATE.NOT_COLLECTED);
  store.replaceSyncedSnapshots([snapshot('TAN10102')]);
  assert.equal(store.read('TAN10102').source_state,SOURCE_STATE.OK);
  assert.equal(store.preferredLine(),'TAN10102');
});

test('SN forensics preserves independent source state when 2114 fails and other sources succeed',()=>{
  const model=buildLiveSnForensics({
    sn:'PCBA-1',detected_type:'PCBA',
    trace_2114:{status:'error',error:'shift unavailable'},
    trace_3074:{status:'ok',reused_components:[]},
    trace_3022:{status:'ok',process_passages:[{pcba_sn:'PCBA-1',operation_code:'A6900',event_time:'2026-10-14T10:00:00-03:00'}]},
    trace_3012:{status:'ok',rows:[]},
  });
  assert.equal(model.source_states['2114'],SOURCE_STATE.ERROR);
  assert.equal(model.source_states['3074'],SOURCE_STATE.ZERO);
  assert.equal(model.source_states['3022'],SOURCE_STATE.OK);
  assert.equal(model.source_states['3012'],SOURCE_STATE.ZERO);
  assert.equal(model.coverage['2114'],false);
  assert.equal(model.coverage['3074'],true);
  assert.equal(model.process.length,1);
});

test('local SN evidence is marked cached rather than current or zero',()=>{
  const model=buildLocalSnForensics({query_sn:'PCBA-1',coverage:{2114:true,3012:true,3022:false,3074:false}});
  assert.equal(model.source_states['2114'],SOURCE_STATE.CACHED);
  assert.equal(model.source_states['3012'],SOURCE_STATE.CACHED);
  assert.equal(model.source_states['3022'],SOURCE_STATE.NOT_COLLECTED);
});
