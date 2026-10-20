import test from 'node:test';
import assert from 'node:assert/strict';
import {readingPeriod,matchesReadingPeriod} from '../ames/data/reading-period.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
const line='TAN10101',now=new Date('2026-10-19T15:00:00Z');
function snapshot(id,date,mode='today'){
  const names=['defects','pcba_history','material_reuse','history_contexts','process_timeline'];
  return {schema:'central-ames-v2',schema_version:2,source_id:'original-source',snapshot_id:id,snapshot_revision:1,content_hash:id,line_id:line,collected_at:date+'T16:00:00Z',summary:{line,snapshot_id:id,collected_at:date+'T16:00:00Z',period:{mode,start_at:date+'T07:00',end_at:date+'T12:00'}},datasets:Object.fromEntries(names.map(n=>[n,[]])),coverage:Object.fromEntries(names.map(n=>[n,{stored_total:0,transport_complete:true,source_complete:false}])),capabilities:{}};
}
test('factory day rolls at 07:00 São Paulo and previous production day honors exceptions',()=>{
  assert.equal(readingPeriod('today',{now:new Date('2026-10-19T09:59:00Z')}).start,'2026-10-18T07:00');
  assert.equal(readingPeriod('previous',{now}).start,'2026-10-16T07:00');
  assert.equal(readingPeriod('previous',{now,config:{non_production_dates:['2026-10-16']}}).start,'2026-10-15T07:00');
  assert.equal(readingPeriod('previous',{now,config:{extra_production_dates:['2026-10-18']}}).start,'2026-10-18T07:00');
});
test('custom query on identical dates is never a daily population; UTC dates normalize',()=>{
 const p=snapshot('a','2026-10-19','custom'),scope=readingPeriod('today',{now});
 assert.equal(matchesReadingPeriod(p,scope),false);
 p.summary.period.mode='today';p.summary.period.start_at='2026-10-19T10:00:00Z';
 assert.equal(matchesReadingPeriod(p,scope),true);
 p.summary.period.end_at='2026-10-20T07:00:01-03:00';assert.equal(matchesReadingPeriod(p,scope),false);
 assert.throws(()=>readingPeriod('custom',{start:'2026-10-20T07:00',end:'2026-10-19T07:00'}));
});
test('Today → previous → Today keeps publication head and all datasets unchanged',()=>{
 const s=createAmesStore({now:()=>now.getTime()}),today=snapshot('new','2026-10-19'),previous=snapshot('old','2026-10-16','previous_day');
 s.replaceLocalSnapshots([today]);s.setLocalConnected(true);s.selectReadingPeriod('today');
 assert.equal(s.read(line).snapshot.snapshot_id,'new');
 const token=s.selectReadingPeriod('previous');assert.equal(s.read(line).snapshot,null);
 s.installHistoricalSnapshot(previous,{source:'local',generation:token});
 assert.equal(s.read(line).snapshot.snapshot_id,'old');assert.equal(s.localCanonical()[0].snapshot_id,'new');
 s.replaceLocalSnapshots([snapshot('newer','2026-10-19')]);assert.equal(s.read(line).snapshot.snapshot_id,'old');
 s.selectReadingPeriod('today');assert.equal(s.read(line).snapshot.snapshot_id,'newer');
 s.selectReadingPeriod('previous');assert.equal(s.read(line).snapshot.snapshot_id,'old');
});
test('late response cannot repopulate another period or another account',()=>{
 const s=createAmesStore({now:()=>now.getTime()});const token=s.selectReadingPeriod('previous');
 s.selectReadingPeriod('today');assert.equal(s.installHistoricalSnapshot(snapshot('old','2026-10-16','previous_day'),{generation:token}),false);
 const next=s.selectReadingPeriod('previous');s.clear();s.selectReadingPeriod('previous');
 assert.equal(s.installHistoricalSnapshot(snapshot('old','2026-10-16','previous_day'),{generation:next}),false);
 assert.equal(s.read(line).snapshot,null);
});
test('wrong line stays absent; mismatched period fails closed; no metrics invented',()=>{
 const s=createAmesStore({now:()=>now.getTime()});s.selectReadingPeriod('previous');
 assert.throws(()=>s.installHistoricalSnapshot(snapshot('wrong','2026-10-19')),/period_mismatch/);
 s.installHistoricalSnapshot(snapshot('old','2026-10-16','previous_day'));
 assert.equal(s.read('TAN10102').source,'none');assert.equal(s.occurrences({line_id:'TAN10102'}).coverage.status,'unavailable');
 assert(Object.isFrozen(s.read(line).snapshot));
});

import {createReadingPeriodController} from '../ames/reading-period-controller.mjs';
const entry=p=>({line_id:p.line_id,source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,collected_at:p.collected_at,period_start:p.summary.period.start_at,period_end:p.summary.period.end_at,history_source:'shared'});
test('loader uses immutable history, excludes custom and preserves selected line',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day');s.updateContext({line_id:'TAN10102'});
 const c=createReadingPeriodController(s,{list:async l=>l===line?[entry(p)]:[],open:async()=>p});
 await c.select('previous');assert.equal(s.read(line).snapshot.snapshot_id,'old');assert.equal(s.context().line_id,'TAN10102');assert.equal(s.localCanonical().length,0);c.clear();
});
test('loader exposes ambiguous sources without silently choosing the newest remote workstation',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day');let opened=0;
 const c=createReadingPeriodController(s,{list:async l=>l===line?[entry(p),{...entry(p),source_id:'other'}]:[],open:async()=>{opened++;return p;}});
 await c.select('previous');
 assert.equal(opened,0);assert.equal(s.read(line).snapshot,null);
 assert.equal(s.agent().period_read.status,'partial');
 assert.deepEqual(s.agent().period_read.source_choices[0].options.map(o=>o.source_id),['original-source','other']);
 await assert.rejects(()=>c.chooseSource('TAN10102','other'),/invalid_history_source_choice/);
 c.clear();
});
test('connected agent chooses only its own proven local origin for both lines, not a newer shared source',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day');
 s.updateAgent({status:'connected',capabilities:{source_id:p.source_id}});
 const local={...entry(p),history_source:'local'};
 const remote={...entry(p),source_id:'different-workstation',collected_at:'2026-10-21T20:00:00Z'};
 const opened=[],c=createReadingPeriodController(s,{list:async l=>l===line?[remote,local]:[],open:async e=>{opened.push(e.source_id);return p;}});
 await c.select('previous');
 assert.equal(s.read(line).snapshot?.source_id,p.source_id);
 assert.deepEqual(opened,[p.source_id]);
 assert.equal(s.agent().period_read.status,'ready');
 c.clear();
});
test('when local identity cannot be proven operator chooses a single source without triggering MES',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day'),q={...snapshot('other','2026-10-16','previous_day'),source_id:'other-workstation'};
 const openings=[],c=createReadingPeriodController(s,{list:async l=>l===line?[entry(p),entry(q)]:[],open:async e=>{openings.push(e.source_id);return e.source_id===q.source_id?q:p;}});
 await c.select('previous');assert.equal(openings.length,0);
 await c.chooseSource(line,q.source_id);
 assert.deepEqual(openings,[q.source_id]);
 assert.equal(s.read(line).snapshot?.snapshot_id,'other');
 assert.equal(s.agent().period_read.source_choices.length,0);
 c.clear();
});
test('chosen source cannot admit another source payload even with a matching line and period',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day'),q={...snapshot('other','2026-10-16','previous_day'),source_id:'other-workstation'};
 const c=createReadingPeriodController(s,{list:async l=>l===line?[entry(p),entry(q)]:[],open:async()=>q});
 await c.select('previous');await c.chooseSource(line,p.source_id);
 assert.equal(s.read(line).snapshot,null);
 assert.match(s.agent().period_read.errors[0].error,/historical_identity_mismatch/);
 c.clear();
});
test('loader does not mix late historical reads after switching back Today',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day');let release;
 const c=createReadingPeriodController(s,{list:async l=>l===line?[entry(p)]:[],open:()=>new Promise(r=>{release=r;})});
 const pending=c.select('previous');await new Promise(r=>setImmediate(r));
 await c.select('today');release(p);await pending;assert.equal(s.read(line).snapshot,null);assert.equal(s.readingPeriod().mode,'today');
});
test('only explicitly pending local entries may materialize a revision',async()=>{
 for(const [source,pending,revision,accepted] of [['local',true,null,true],['local',false,null,false],['shared',true,null,false],['local',false,2,false]]){
  const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('2','2026-10-16','previous_day');
  const h={...entry(p),history_source:source,revision_pending:pending,snapshot_revision:revision};
  const c=createReadingPeriodController(s,{list:async l=>l===line?[h]:[],open:async()=>p});
  await c.select('previous');assert.equal(!!s.read(line).snapshot,accepted);
  assert.equal(s.agent().period_read.errors.length,accepted?0:1);
 }
});
