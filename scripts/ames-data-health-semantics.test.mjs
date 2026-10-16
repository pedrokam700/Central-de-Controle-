import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataHealth} from '../ames/console-data-health.mjs';
import {SOURCE_STATE} from '../ames/data/source-provenance.mjs';

const makeStore=snapshot=>({
  agent:()=>({status:'connected',capabilities:{process_timeline:true}}),
  read:line=>line==='TAN10102'?{snapshot,source:'local',source_state:snapshot?SOURCE_STATE.OK:SOURCE_STATE.NOT_COLLECTED,freshness:'fresh'}:{snapshot:null,source:'none',source_state:SOURCE_STATE.NOT_COLLECTED,freshness:'unknown'}
});
const base={snapshot_id:'S2',collected_at:'2026-10-14T10:00:00-03:00',occurrences:[{pcba_sn:'P1'}],material_trace:{status:'unavailable',records:[]},pcba_history:{status:'unavailable',records:[]},process_timeline:{status:'not_collected',events:[]}};

test('unavailable complementary sources render dash, never false zero',()=>{
  const model=buildDataHealth(makeStore(base));
  for(const source of ['3074','2114','3022','3012']){
    const item=model.find(x=>x.source===source);
    assert.equal(item.displayCount,null,source);
  }
  assert.equal(model.find(x=>x.source==='3074').state.label,'Não coletado');
  assert.equal(model.find(x=>x.source==='2114').state.label,'Não coletado');
  assert.equal(model.find(x=>x.source==='3074').state.source_state,SOURCE_STATE.NOT_COLLECTED);
  assert.equal(model.find(x=>x.source==='2114').state.source_state,SOURCE_STATE.NOT_COLLECTED);
  assert.equal(model.find(x=>x.source==='3022').state.source_state,SOURCE_STATE.NOT_COLLECTED);
  assert.equal(model.find(x=>x.source==='3012').state.source_state,SOURCE_STATE.NOT_COLLECTED);
});

test('zero is allowed only after source execution is proven',()=>{
  const snapshot={...base,material_trace:{status:'available',records:[]},pcba_history:{status:'available',records:[]},process_timeline:{status:'available',events:[]}};
  const model=buildDataHealth(makeStore(snapshot));
  for(const source of ['3074','2114','3022']){
    const item=model.find(x=>x.source===source);
    assert.equal(item.displayCount,0,source);
    assert.equal(item.state.label,'Disponível',source);
    assert.equal(item.state.source_state,SOURCE_STATE.ZERO,source);
  }
});

test('3012 cache keeps legacy visual warning while canonical provenance is cached',()=>{
  const repairStatus={status:'ok',factoryValidated:false,amesStartDate:'2026-01-01',local:{rows:14,pcbas:3,repairUsers:2,coverageIntervals:5,coverageSns:3,firstEvent:'2026-01-01',lastEvent:'2026-10-14'}};
  const item=buildDataHealth(makeStore(base),repairStatus).find(x=>x.source==='3012');
  assert.equal(item.displayCount,null);
  assert.equal(item.state.tone,'partial');
  assert.match(item.state.label,/Sem vínculo neste snapshot|No link in this snapshot/);
  assert.equal(item.state.source_state,SOURCE_STATE.CACHED);
});
