import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';

const snapshot=(line,id)=>({
  kind:'ames_shared_snapshot',line,schema:'central-v2-ames-line-v1',
  payload:{schema:'central-v2-ames-line-v1',line,generated_at:'2026-10-14T10:00:00-03:00',summary:{line,snapshot_id:id,collected_at:'2026-10-14T10:00:00-03:00',defect_rows:1,fpy:99,check_fpy:98,quantity:100},defects:[{line,pcba_sn:'002527TEST',product_model:'CPH2817',defect_code:'GN01',defect_desc:'test',defect_time:'2026-10-14T09:00:00-03:00'}]}
});

test('first loaded line becomes shared context instead of arbitrary Line 1',()=>{
  const store=createAmesStore();
  store.replaceRemoteDocuments([snapshot('TAN10102','S2')]);
  assert.equal(store.preferredLine(),'TAN10102');
  assert.equal(store.context().line_id,'TAN10102');
  assert.deepEqual(store.context().lines,['TAN10102']);
});

test('explicit line selection survives later snapshots and is shared by views',()=>{
  const store=createAmesStore();
  store.replaceRemoteDocuments([snapshot('TAN10102','S2')]);
  store.updateContext({line_id:'TAN10103',product:'CPH2819',shift:'1st Shift',defect:'GN01'});
  store.replaceRemoteDocuments([snapshot('TAN10101','S1'),snapshot('TAN10102','S2B')]);
  assert.deepEqual(store.context(),{line_id:'TAN10103',lines:['TAN10103'],period:null,product:'CPH2819',shift:'1st Shift',defect:'GN01'});
  assert.equal(store.preferredLine(),'TAN10103');
});

test('invalid line never enters operational context and clear resets it',()=>{
  const store=createAmesStore();
  assert.throws(()=>store.updateContext({line_id:'TAN99999'}),/invalid_operational_line/);
  store.updateContext({line_id:'TAN10102'});
  store.clear();
  assert.deepEqual(store.context(),{line_id:null,lines:[],period:null,product:null,shift:null,defect:null});
});
