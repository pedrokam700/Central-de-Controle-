import test from 'node:test';
import assert from 'node:assert/strict';
import {fullDayClosureEvidence,latestProvenFullDayClosure} from '../ames/data/full-day-closure.mjs';

const complete=()=>({line_id:'L3',source_id:'PC-FACTORY',snapshot_id:'14',snapshot_revision:3,
  content_hash:'a'.repeat(64),summary:{period:{start_at:'2026-10-22T07:00',end_at:'2026-10-23T07:00',mode:'previous_day'}},
  coverage:{defects:{source_complete:true,transport_complete:true}},
  source_coverage:Object.fromEntries(['3028','3074','2114','3022'].map(view=>[view,
    {status:'observed_complete',source_complete:true,transport_complete:true,
      scope:{line_id:'L3',snapshot_id:'14',snapshot_revision:3}}]))});

test('only full, matching 3028+3074+2114+3022 day snapshot yields immutable closure',()=>{
 const payload=complete(),value=fullDayClosureEvidence(payload);
 assert.equal(value.status,'FULL');assert(value.immutable_id);
 const dup=latestProvenFullDayClosure([payload,payload]);assert.equal(dup.immutable_id,value.immutable_id);
 assert.equal(fullDayClosureEvidence({...payload,summary:{period:{...payload.summary.period,end_at:'2026-10-22T23:00'}}}).status,'UNPROVEN');
});

test('current saved 3074/2114/3022 metadata is partial and never a FULL closure',()=>{
 const payload=complete();payload.source_coverage['3074']={status:'observed_partial',source_complete:false,transport_complete:true};
 const result=fullDayClosureEvidence(payload);
 assert.equal(result.status,'UNPROVEN');assert.deepEqual(result.missing_sources,['3074']);
 assert.equal(latestProvenFullDayClosure([payload]),null);
 const other=complete();other.source_coverage['2114'].scope.snapshot_id='13';
 assert.equal(fullDayClosureEvidence(other).status,'UNPROVEN');
});
