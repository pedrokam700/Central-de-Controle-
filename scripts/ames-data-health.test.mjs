import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDataHealth,buildSecurityHealth} from '../ames/console-data-health.mjs';

function fakeStore(occurrences=[]){
  return {
    agent(){return {status:'connected',capabilities:{process_timeline:true}};},
    read(line){
      if(line!=='TAN10101')return {snapshot:null,freshness:'unknown',source:null};
      return {snapshot:{
        snapshot_id:'1',collected_at:'2026-10-14T09:00:00',occurrences,
        material_trace:{status:'not_collected',records:[]},
        pcba_history:{status:'not_collected',records:[]},
        process_timeline:{status:'not_collected',events:[]},
      },freshness:'fresh',source:'local'};
    }
  };
}

const repairStatus=(overrides={})=>({
  status:'ok',implemented:true,factoryValidated:false,amesStartDate:'2026-01-01',
  local:{rows:0,pcbas:0,repairUsers:0,coverageIntervals:0,coverageSns:0,firstEvent:null,lastEvent:null,...overrides}
});

test('security health exposes counts only and keeps validated policy green',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:true,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:0,secret:'https://hidden.example'}
  });
  assert.equal(model.tone,'ok');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,0);
  assert.equal(model.mode,'loopback-plus-explicit-https');
  assert.equal(JSON.stringify(model).includes('hidden.example'),false);
});

test('legacy rejected origins are visible as partial without exposing origin values',()=>{
  const model=buildSecurityHealth({
    status:'ok',
    originPolicy:{ok:false,mode:'loopback-plus-explicit-https',remoteOrigins:1,rejectedEntries:3,origins:['https://must-not-render.example']}
  });
  assert.equal(model.tone,'partial');
  assert.equal(model.remote,1);
  assert.equal(model.rejected,3);
  assert.match(model.label,/Configuração legada|Legacy configuration/);
  assert.equal(JSON.stringify(model).includes('must-not-render'),false);
});

test('unavailable hardening diagnostics remain unknown instead of being reported safe',()=>{
  for(const value of [null,{status:'unavailable',reason:'not_paired'},{status:'error'}]){
    const model=buildSecurityHealth(value);
    assert.equal(model.tone,'unknown');
    assert.equal(model.remote,null);
    assert.equal(model.rejected,null);
  }
});

test('3012 cache coverage never becomes coverage of current PCBAs without linked evidence',()=>{
  const store=fakeStore([{pcba_sn:'P1',repair_evidence_3012:[]}]);
  const item=buildDataHealth(store,repairStatus({rows:14,coverageSns:3,coverageIntervals:5})).find(x=>x.source==='3012');
  assert.equal(item.count,0);
  assert.equal(item.state.tone,'partial');
  assert.match(item.state.label,/Sem vínculo neste snapshot|No link in this snapshot/);
  assert.match(item.state.detail,/não prova cobertura|does not prove coverage/);
  assert.equal(item.cache.coverageSns,3);
  assert.equal(item.cache.factoryValidated,false);
});

test('3012 without linked evidence and without exact cache stays unknown, never zero-covered',()=>{
  const store=fakeStore([{pcba_sn:'P1',repair_evidence_3012:[]}]);
  const item=buildDataHealth(store,repairStatus()).find(x=>x.source==='3012');
  assert.equal(item.count,0);
  assert.equal(item.state.tone,'unknown');
  assert.match(item.state.label,/Não comprovado|Not proven/);
  assert.match(item.state.detail,/não equivale a zero reparos|does not mean zero repairs/);
});

test('3012 linked evidence counts only current occurrences and does not inherit unrelated cache rows',()=>{
  const store=fakeStore([
    {pcba_sn:'P1',repair_evidence_3012:[{row_key:'R1'}]},
    {pcba_sn:'P2',repair_evidence_3012:[]},
  ]);
  const item=buildDataHealth(store,repairStatus({rows:999,coverageSns:100,coverageIntervals:120})).find(x=>x.source==='3012');
  assert.equal(item.count,1);
  assert.equal(item.state.tone,'partial');
  assert.match(item.state.detail,/1\/2/);
  assert.equal(item.cache.rows,999);
});
