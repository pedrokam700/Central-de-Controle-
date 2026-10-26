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

test('latest FULL selects actual later collection, not the larger unrelated revision number',()=>{
 const at09=complete();at09.collected_at='2026-10-23T12:00:00Z';at09.snapshot_id='14';at09.snapshot_revision=9;
 for(const view of ['3074','2114','3022']){
  at09.source_coverage[view].scope.snapshot_id='14';at09.source_coverage[view].scope.snapshot_revision=9;
 }
 const at10=complete();at10.collected_at='2026-10-23T13:00:00Z';at10.snapshot_id='15';at10.snapshot_revision=1;
 for(const view of ['3074','2114','3022']){
  at10.source_coverage[view].scope.snapshot_id='15';at10.source_coverage[view].scope.snapshot_revision=1;
 }
 at10.content_hash='b'.repeat(64);
 const later=latestProvenFullDayClosure([at09,at10]);
 assert.equal(later.identity.snapshot_id,'15');
 assert.equal(later.collected_at,at10.collected_at);
 const partial=structuredClone(at10);partial.collected_at='2026-10-23T14:00:00Z';
 partial.snapshot_revision=2;partial.source_coverage['3074'].source_complete=false;
 assert.equal(latestProvenFullDayClosure([at09,at10,partial]).immutable_id,later.immutable_id,
  'a later partial revision must not overwrite a proven FULL');
});

test('competing FULL origins or lines require explicit selection before choosing latest',()=>{
 const a=complete(),b=complete(),otherLine=complete();
 b.source_id='SECOND-POST';b.content_hash='b'.repeat(64);
 otherLine.line_id='L2';otherLine.content_hash='c'.repeat(64);
 for(const view of ['3074','2114','3022'])otherLine.source_coverage[view].scope.line_id='L2';
 assert.equal(latestProvenFullDayClosure([a,b]),null,'two posts must never silently become one closing authority');
 assert.equal(latestProvenFullDayClosure([a,otherLine]),null,'two lines must not be mixed');
 assert.equal(latestProvenFullDayClosure([a,b],{line:'L3',source:'PC-FACTORY'}).identity.source_id,'PC-FACTORY');
});
