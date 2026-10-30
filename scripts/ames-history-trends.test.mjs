import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
import {createHistoryTrendReader,planHistoryDays,compareHistoryDays,historyWeekSummary} from '../ames/data/history-trends.mjs';
import {withHistoricalTrends} from '../ames/console-history-trends.mjs';

test('historical trend UI module parses before its browser initializer runs',()=>{
 assert.equal(typeof withHistoricalTrends,'function');
});
function fixture(date,{id=date,source='A',revision=1,mode='previous_day',end='12:00',fpy=98,complete=false}={}){
 const p=canonicalAgentFixture(productFixture('TAN10101',2));p.snapshot_id=id;p.summary.snapshot_id=id;p.source_id=source;p.snapshot_revision=revision;
 p.summary.period={start_at:date+'T07:00-03:00',end_at:date+'T'+end+'-03:00',mode};p.summary.fpy=fpy;
 p.coverage.defects.source_complete=complete;
 for(const rows of Object.values(p.datasets))for(const r of rows){r.snapshot_id=id;r.snapshot_revision=revision;}
 return p;
}
const entry=p=>({line_id:p.line_id,source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,collected_at:p.collected_at,period_start:p.summary.period.start_at,period_end:p.summary.period.end_at,history_source:'shared'});
function source(payloads){let opens=0;const entries=payloads.map(entry);return {list:async()=>entries,open:async e=>{opens++;return payloads.find(p=>p.source_id===e.source_id&&p.snapshot_id===e.snapshot_id&&p.snapshot_revision===e.snapshot_revision);},opens:()=>opens};}
const options={line:'TAN10101',source:'A',endDate:'2026-10-19',days:7};
test('one latest immutable revision per day, gaps not zero; memo reuses exact reads',async()=>{
 const remote=source([fixture('2026-10-16'),fixture('2026-10-19'),fixture('2026-10-19',{revision:2,fpy:97})]);
 const reader=createHistoryTrendReader(remote),r=await reader.read(options);
 assert.equal(r.points.length,7);assert.equal(r.points.filter(p=>p.snapshot).length,2);
 assert.equal(r.points.at(-1).entry.snapshot_revision,2);assert.equal(r.points.at(-1).fpy,97);
 assert.equal(r.points[0].status,'not_collected');assert.equal(r.points[0].observed_failures,undefined);
 assert.equal(r.points.at(-1).occurrences_per_1000,null);assert.equal(remote.opens(),2);
 await reader.read(options);assert.equal(remote.opens(),2);reader.clear();await reader.read(options);assert.equal(remote.opens(),4);
});
test('sources never merged, custom windows never become daily production',async()=>{
 const payloads=[fixture('2026-10-19'),fixture('2026-10-19',{source:'B'}),fixture('2026-10-18',{mode:'custom'})];
 assert.equal(planHistoryDays(payloads.map(entry),{...options,source:''}).at(-1).status,'source_conflict');
 const r=await createHistoryTrendReader(source(payloads)).read(options);
 assert.equal(r.points.at(-2).status,'not_collected');assert.equal(r.points.at(-1).entry.source_id,'A');
});
test('wrong revision, period or content fails closed without silently substituting an older revision',async()=>{
 const p=fixture('2026-10-19'),e=entry(p),remote={list:async()=>[{...e,snapshot_revision:2},e],open:async()=>p};
 assert.equal((await createHistoryTrendReader(remote).read(options)).points.at(-1).status,'unavailable');
 const wrong={...e,period_end:'2026-10-19T13:00-03:00'};
 assert.equal((await createHistoryTrendReader({...remote,list:async()=>[wrong]}).read(options)).points.at(-1).status,'unavailable');
});
test('filters remove aggregate FPY/quantity; zero Check FPY remains valid and rates need complete source',async()=>{
 const p=fixture('2026-10-19',{complete:true});const r=createHistoryTrendReader(source([p]));
 const point=(await r.read(options)).points.at(-1);assert.equal(point.check_fpy,0);assert.equal(point.occurrences_per_1000,2);
 const filtered=(await r.read({...options,filters:{product:'CPH2859'}})).points.at(-1);
 assert.equal(filtered.fpy,null);assert.equal(filtered.quantity,null);assert.equal(filtered.observed_failures,1);
});
test('day comparison refuses different origins or clock cutoffs; weekly rates are not invented',async()=>{
 const r=await createHistoryTrendReader(source([fixture('2026-10-16'),fixture('2026-10-19',{fpy:96})])).read(options);
 const [a,b]=[r.points.at(-1),r.points.find(p=>p.date==='2026-10-16')];
 assert.equal(compareHistoryDays(a,b).fpy_delta,null,'CPH2859V and CPH2859 mixed in the same day cannot be compared');
 const single=point=>({...point,snapshot:{...point.snapshot,occurrences:point.snapshot.occurrences.filter(o=>o.product_key==='CPH2859')}});
 assert.equal(compareHistoryDays(single(a),single(b)).fpy_delta,-2,'matching explicit single-CPH windows remain comparable');
 assert.equal(compareHistoryDays(a,{...b,entry:{...b.entry,source_id:'B'}}).comparable,false);
 assert.equal(compareHistoryDays(a,{...b,entry:{...b.entry,period_end:'2026-10-16T15:00-03:00'}}).comparable,false);
 const weeks=historyWeekSummary(r.points,options.endDate);assert.equal(weeks.current.observed_failures,2);assert.equal(weeks.previous.observed_failures,2);assert.equal(weeks.previous.observed_days,1);assert.equal(weeks.previous.fpy,null);
});
test('missing, pending and cross-line index rows cannot enter the daily series',()=>{
 const e=entry(fixture('2026-10-19'));
 const p=planHistoryDays([{...e,snapshot_revision:null},{...e,line_id:'TAN10102'},{...e,period_start:'2026-10-19T07:30-03:00'}],options);
 assert(p.every(d=>d.status==='not_collected'));
});

test('historic comparisons reject different, mixed or missing CPH without hiding observed weekly totals',async()=>{
 const read=await createHistoryTrendReader(source([fixture('2026-10-16'),fixture('2026-10-19')])).read(options);
 const oneProduct=point=>!point.snapshot?point:{...point,snapshot:{...point.snapshot,occurrences:point.snapshot.occurrences.filter(o=>o.product_key==='CPH2859')}};
 const points=read.points.map(oneProduct),a=points.at(-1),b=points.find(p=>p.date==='2026-10-16');
 const altered=(products)=>({...b,snapshot:{...b.snapshot,occurrences:products.map((product_key,i)=>({...b.snapshot.occurrences[0],product_key,occurrence_id:'O'+i}))}});
 assert.equal(compareHistoryDays(a,b).comparable,true);
 assert.equal(compareHistoryDays(a,altered(['CPH9999'])).comparable,false);
 assert.equal(compareHistoryDays(a,altered([])).comparable,false);
 assert.equal(compareHistoryDays(a,altered(['CPH2859','CPH9999'])).comparable,false);
 const mixed=historyWeekSummary(points.map(p=>p.date==='2026-10-16'?altered(['CPH2859','CPH9999']):p),options.endDate);
 assert.equal(mixed.previous.scope_mixed,true);
 assert.equal(mixed.previous.observed_failures,2,'observed evidence is retained, not converted to zero');
 const other=historyWeekSummary(points.map(p=>p.date==='2026-10-16'?altered(['CPH9999']):p),options.endDate);
 assert.notEqual(other.current.scope_key,other.previous.scope_key);
});

test('FULL closure trend keeps prior complete revision when a later capture is partial',async()=>{
 const full=fixture('2026-10-19',{id:'DAY19',revision:1,complete:true});
 full.content_hash='a'.repeat(64);
 full.summary.period.end_at='2026-10-20T07:00-03:00';
 full.source_coverage=Object.fromEntries(['3074','2114','3022'].map(view=>[view,{
   status:'complete',transport_complete:true,source_complete:true,
   scope:{line_id:full.line_id,source_id:full.source_id,snapshot_id:full.snapshot_id,snapshot_revision:full.snapshot_revision}}]));
 const partial=fixture('2026-10-19',{id:'DAY19',revision:2,complete:true});
 partial.content_hash='b'.repeat(64);
 partial.summary.period.end_at='2026-10-20T07:00-03:00';
 partial.source_coverage=Object.fromEntries(['3074','2114','3022'].map(view=>[view,{
   status:'observed_partial',transport_complete:true,source_complete:false,
   scope:{line_id:partial.line_id,source_id:partial.source_id,snapshot_id:partial.snapshot_id,snapshot_revision:partial.snapshot_revision}}]));
 const reader=createHistoryTrendReader(source([full,partial]));
 const observed=(await reader.read(options)).points.at(-1);
 assert.equal(observed.entry.snapshot_revision,2,'observed mode preserves the existing latest-revision behavior');
 const closure=(await reader.read({...options,requireFullClosure:true})).points.at(-1);
 assert.equal(closure.entry.snapshot_revision,1,'later partial must not downgrade the previous FULL');
 assert.equal(closure.status,'complete');
 const onlyPartial=(await createHistoryTrendReader(source([partial])).read({...options,requireFullClosure:true})).points.at(-1);
 assert.equal(onlyPartial.status,'unproven_full');
 assert.equal(onlyPartial.snapshot,undefined);
 assert.equal(onlyPartial.observed_failures,undefined,'missing full data is not a zero');
});

test('FULL history preserves an older proven closure when a newer immutable revision cannot be read',async()=>{
 const full=fixture('2026-10-19',{id:'DAY19',revision:1,complete:true});
 full.content_hash='a'.repeat(64);
 full.summary.period.end_at='2026-10-20T07:00-03:00';
 full.source_coverage=Object.fromEntries(['3074','2114','3022'].map(view=>[view,{
  status:'complete',source_complete:true,transport_complete:true,
  scope:{line_id:full.line_id,source_id:full.source_id,snapshot_id:full.snapshot_id,snapshot_revision:1}}]));
 const newest=fixture('2026-10-19',{id:'DAY19',revision:2,complete:true});
 newest.summary.period.end_at='2026-10-20T07:00-03:00';
 const history=source([full,newest]);
 const remote={list:history.list,open:async e=>{
  if(e.snapshot_revision===2)throw Error('immutable revision unavailable');
  return history.open(e);
 }};
 const reader=createHistoryTrendReader(remote);
 const fallback=(await reader.read({...options,requireFullClosure:true})).points.at(-1);
 assert.equal(fallback.status,'complete');
 assert.equal(fallback.entry.snapshot_revision,1);
 assert.equal(fallback.unreadable_newer_revisions,1,'the unreadable newer entry must remain auditable');
 const observed=(await reader.read(options)).points.at(-1);
 assert.equal(observed.status,'unavailable','normal historical mode cannot silently fall back');
 const noFull=(await createHistoryTrendReader({list:async()=>[entry(newest)],open:async()=>{throw Error('missing')}})
  .read({...options,requireFullClosure:true})).points.at(-1);
 assert.equal(noFull.status,'unavailable');
 assert.equal(noFull.snapshot,undefined);
 assert.equal(noFull.unreadable_newer_revisions,1);
});
