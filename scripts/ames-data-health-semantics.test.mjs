import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDataHealth} from '../ames/console-data-health.mjs';

const makeStore=snapshot=>({
  agent:()=>({status:'connected',capabilities:{process_timeline:true}}),
  read:line=>line==='TAN10102'?{snapshot,source:'local',freshness:'fresh'}:{snapshot:null,source:'none',freshness:'unknown'}
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
});

test('zero is allowed only after source execution is proven',()=>{
  const snapshot={...base,material_trace:{status:'available',records:[]},pcba_history:{status:'available',records:[]},process_timeline:{status:'available',events:[]}};
  const model=buildDataHealth(makeStore(snapshot));
  for(const source of ['3074','2114','3022']){
    const item=model.find(x=>x.source===source);
    assert.equal(item.displayCount,0,source);
    assert.equal(item.state.label,'Disponível',source);
  }
});
