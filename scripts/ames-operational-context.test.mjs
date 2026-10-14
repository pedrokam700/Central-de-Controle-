import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAmesStore} from '../ames/data/store.mjs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';
import {scopedDailyRows} from '../ames/daily-failure-summary.mjs';
import {source3012State} from '../ames/console-sn-offline-fastlane.mjs';

const snapshot=(line,id)=>({
  kind:'ames_shared_snapshot',line,schema:'central-v2-ames-line-v1',
  payload:{schema:'central-v2-ames-line-v1',line,generated_at:'2026-10-14T10:00:00-03:00',summary:{line,snapshot_id:id,collected_at:'2026-10-14T10:00:00-03:00',defect_rows:1,fpy:99,check_fpy:98,quantity:100},defects:[{line,pcba_sn:'002527TEST',product_model:'CPH2817',defect_code:'GN01',defect_desc:'test',defect_time:'2026-10-14T09:00:00-03:00'}]}
});
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('preferred fallback does not pin empty Line 1 before evidence exists',()=>{
  const store=createAmesStore();
  assert.equal(store.context().line_id,null);
  assert.equal(store.preferredLine(),'TAN10101');
  assert.equal(store.context().line_id,null);
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

test('period is structured context and invalid line never enters operational state',()=>{
  const store=createAmesStore();
  assert.throws(()=>store.updateContext({line_id:'TAN99999'}),/invalid_operational_line/);
  store.updateContext({line_id:'TAN10102',period:{from:'2026-10-08',to:'2026-10-09'}});
  assert.deepEqual(store.context().period,{from:'2026-10-08',to:'2026-10-09'});
  assert(Object.isFrozen(store.context().period));
  store.clear();
  assert.deepEqual(store.context(),{line_id:null,lines:[],period:null,product:null,shift:null,defect:null});
});

test('shift filter never converts failures without 3022 classification into false zero',()=>{
  const rows=[
    {pcba_sn:'P1',product_model:'CPH2859V',defect_code:'D1',defect_time:'2026-10-08T10:00:00-03:00'},
    {pcba_sn:'P2',product_model:'CPH2859V',defect_code:'D2',defect_time:'2026-10-08T11:00:00-03:00'},
  ];
  assert.equal(scopedDailyRows(rows,{shift:'1st Shift'}).length,2,'unknown shift must remain visible');
  const classified=[{...rows[0],production_shift:'1st Shift'},{...rows[1],production_shift:'2nd Shift'}];
  assert.equal(scopedDailyRows(classified,{shift:'1st Shift'}).length,1,'proven shift may be filtered normally');
  const daily=source('ames/daily-failure-summary.mjs');
  assert.match(daily,/Turno não classificado pela 3022/);
  assert.match(daily,/não foram convertidas em zero/);
});

test('SN investigation preserves successful 3074 and 3022 evidence when 2114 is unavailable',()=>{
  const result={
    sn:'002527TEST',detected_type:'PCBA',
    trace_3074:{reused_components:[{item_sn:'MAT-1',item_type:'SUBBOARD',known_use_count:2,reuse_count:1,previous_pcbas:['OLD-PCBA'],previous_pcba_evidence:[]}]},
    trace_3022:{process_passages:[{pcba_sn:'002527TEST',operation_code:'A6900',operation_name:'Export Repair',event_time:'2026-10-08T10:00:00-03:00'}]},
  };
  const model=buildLiveSnForensics(result);
  assert.equal(model.current,null);
  assert.equal(model.coverage['2114'],false);
  assert.equal(model.coverage['3074'],true);
  assert.equal(model.coverage['3022'],true);
  assert.equal(model.materials.length,1);
  assert.equal(model.materials[0].item_sn,'MAT-1');
  assert.equal(model.process.length,1);
});

test('3012 source state distinguishes not collected, proven zero, error and cache evidence',()=>{
  globalThis.document={documentElement:{lang:'pt-BR'}};
  assert.equal(source3012State({}).kind,'unknown','missing 3012 is unknown, never zero');
  const zero=source3012State({trace_3012:{rows:[]}});
  assert.equal(zero.kind,'ok');
  assert.equal(zero.proven_zero,true,'an explicit successful rows=[] may represent real zero');
  assert.equal(source3012State({trace_3012:{status:'error',error:'boom'}}).kind,'bad');
  const cached=source3012State({local_snapshot:{repair_3012:[{repair_user:'TECH'}]}});
  assert.equal(cached.kind,'ok');
  assert.match(cached.label,/Cache local/);
});

test('operational view adapters read and write one shared active line',()=>{
  const parity=source('ames/console-legacy-parity.mjs');
  const trace=source('ames/console-trace-scope.mjs');
  const refresh=source('ames/console-refresh-decorator.mjs');
  const daily=source('ames/daily-failure-summary.mjs');
  for(const code of [parity,trace,refresh,daily])assert.match(code,/store\.updateContext\?\.\(\{line_id:/);
  assert.match(parity,/store\.preferredLine\?\.\(\)/);
  assert.match(trace,/store\.context\?\.\(\)\.line_id\|\|store\.preferredLine/);
  assert.match(refresh,/data-reuse-line-tab/);
  assert.match(daily,/mesmo contexto operacional de linha, período, CPH, turno e falha/);
});
