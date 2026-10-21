import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLiveJobEvents} from '../ames/data/job-live-events.mjs';
import {collectionStatus,liveTraceFeed} from '../ames/collection-status.mjs';

test('live 3074 events preserve physical PCBA + kit item evidence, discarding raw unexpected fields',()=>{
 const rows=projectLiveJobEvents([
  {stage:'3074',kind:'component',line:'TAN10102',sn:'PCBA1',item_type:'Front camera',item_sn:'CAM1',
   defect_index:1,defect_total:2,component_index:11,component_total:11,raw:{password:'secret'},cookie:'bad'},
  {stage:'2114',pcba:'PCBA1',status:'COMPLETE'},
  {stage:'bad',sn:'SHOULD_NOT_LEAK'}
 ]);
 assert.equal(rows.length,2);assert.equal(rows[0].item_sn,'CAM1');
 assert.equal(rows[0].component_total,11);
 assert(!JSON.stringify(rows).includes('secret'));
 assert(!JSON.stringify(rows).includes('bad'));
 assert(!Object.hasOwn(rows[0],'raw'));
});

test('live feed uses 12 last bounded records and escapes SN/atypical user values',()=>{
 const events=projectLiveJobEvents(Array.from({length:50},(_,i)=>({
   stage:'3074',kind:'component',line:'TAN10102',sn:i===49?'<script>x</script>':'PCBA-'+i,
   item_type:'BatteryCover',item_sn:'item'+i,component_index:i+1,component_total:50
 })));
 assert.equal(events.length,40);
 const html=liveTraceFeed({id:'J',kind:'deep_trace',status:'running',live_events:events});
 assert.match(html,/Rastreando ao vivo/);assert.match(html,/Componente 50\/50/);
 assert(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 assert.equal((html.match(/ames-live-feed-row/g)||[]).length,12);
 assert.doesNotMatch(html,/PCBA-1(?:\D|$)/,'early event should not remain in bounded last feed');
});

test('stage bars remain real and unknown/no events do not fabricate completion',()=>{
 const rendered=collectionStatus({job:{id:'J',kind:'deep_trace',status:'running',
  stage_progress:{'3074':{line:'TAN10102',current:2,total:8,line_percent:25}},live_events:[]}});
 assert.match(rendered,/value="25"/);
 assert.match(rendered,/Aguardando eventos detalhados/);
 assert.doesNotMatch(rendered,/Conclu[ií]do/);
 assert.equal(liveTraceFeed({kind:'sn_lookup',live_events:[{stage:'3074'}]}),'');
});
