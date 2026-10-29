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
test('reading-period changes preserve session; logout/reset invalidates retained independent SN state',()=>{
 const s=createAmesStore({now:()=>now.getTime()});
 const session=s.sessionGeneration();
 s.selectReadingPeriod('today');
 s.selectReadingPeriod('previous');
 s.selectReadingPeriod('today');
 assert.equal(s.sessionGeneration(),session,'period navigation cannot reset independent query state');
 s.clear();
 assert.equal(s.sessionGeneration(),session+1,'logout invalidates retained SN view');
 assert.equal(s.readingPeriod(),null);
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
import {traceTargetForLine} from '../ames/data/trace-targets.mjs';
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
 assert.equal(s.agent().period_read.source_choices[0].selected_source_id,q.source_id,'source switch must remain available after opening');
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
test('unreadable newest historical revision recovers an older revision without claiming latest or starting MES',async()=>{
 const l3='TAN10103',base=snapshot('14','2026-10-16','previous_day');
 const old={...base,line_id:l3,content_hash:'a'.repeat(64),source_id:'factory-A'};
 old.summary={...base.summary,line:l3};
 const newest={...old,snapshot_revision:2,content_hash:'b'.repeat(64),collected_at:'2026-10-17T21:00:00Z'};
 const store=createAmesStore({now:()=>now.getTime()}),opened=[];
 store.setLocalConnected(true);
 store.updateAgent({status:'connected',capabilities:{source_id:'factory-A',exact_trace_targets:true}});
 const ctl=createReadingPeriodController(store,{list:async line=>line===l3?[entry(newest),entry(old)]:[],
   open:async e=>{opened.push(e.snapshot_revision);if(e.snapshot_revision===2)throw Error('corrupted_saved_revision');return old;}});
 await ctl.select('previous');
 assert.deepEqual(opened,[2,1]);
 assert.equal(store.read(l3).snapshot?.snapshot_id,'14');
 assert.equal(store.read(l3).snapshot?.revision,1);
 assert.equal(store.agent().period_read.status,'partial');
 assert.deepEqual(store.agent().period_read.recovered_lines,[{
   line_id:l3,unreadable_revisions:1,source_id:'factory-A',snapshot_id:'14',snapshot_revision:1}]);
 assert.equal(traceTargetForLine(store,l3).available,false,'recovered older revision must not be sent to MES');
 ctl.clear();
});
test('historical fallback never crosses a second collector and fails closed if all entries from selected origin are corrupt',async()=>{
 const p=snapshot('old','2026-10-16','previous_day'),newer={...p,snapshot_revision:2,
   collected_at:'2026-10-18T19:00:00Z'};
 const foreign={...snapshot('foreign','2026-10-16','previous_day'),source_id:'foreign-pc'};
 const opened=[],store=createAmesStore({now:()=>now.getTime()});
 store.updateAgent({status:'connected',capabilities:{source_id:p.source_id}});
 const ctl=createReadingPeriodController(store,{list:async l=>l===line?[{...entry(newer),history_source:'local'},{...entry(p),history_source:'local'},entry(foreign)]:[],
   open:async e=>{opened.push(e.source_id);throw Error('all_selected_origin_unreadable');}});
 await ctl.select('previous');
 assert.deepEqual(opened,[p.source_id,p.source_id]);
 assert.equal(store.read(line).snapshot,null);
 assert.equal(store.agent().period_read.status,'partial');
 assert.equal(store.agent().period_read.recovered_lines.length,0);
 assert.match(store.agent().period_read.errors[0].error,/all_selected_origin_unreadable/);
 ctl.clear();
});
test('newest revision with a false period index is not silently skipped',async()=>{
 const old=snapshot('14','2026-10-16','previous_day'),incorrect={...old,snapshot_revision:2,
   collected_at:'2026-10-17T21:00:00Z',summary:{...old.summary,period:{
     ...old.summary.period,start_at:'2026-10-15T07:00'}}};
 const store=createAmesStore({now:()=>now.getTime()});
 const ctl=createReadingPeriodController(store,{list:async l=>l===line?[{...entry(incorrect),
   period_start:old.summary.period.start_at},entry(old)]:[],
   open:async e=>e.snapshot_revision===2?incorrect:old});
 await ctl.select('previous');
 assert.equal(store.read(line).snapshot?.snapshot_id,'14');
 assert.equal(store.agent().period_read.status,'partial');
 assert.equal(store.agent().period_read.recovered_lines[0].unreadable_revisions,1);
 ctl.clear();
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

test('chosen source remains switchable, newly published revision replaces older without MES collection',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('first','2026-10-16','previous_day');
 const q={...snapshot('other','2026-10-16','previous_day'),source_id:'other-workstation'};
 const newest={...snapshot('new-revision','2026-10-16','previous_day'),snapshot_revision:2,
   collected_at:'2026-10-17T20:00:00Z'};
 let published=[p,q],collections=0;
 const controller=createReadingPeriodController(s,{list:async l=>l===line?published.map(entry):[],
   open:async e=>{collections++;return published.find(p=>p.snapshot_id===e.snapshot_id);}});
 await controller.select('previous');
 await controller.chooseSource(line,p.source_id);
 assert.equal(s.read(line).snapshot.snapshot_id,'first');
 assert.deepEqual(s.agent().period_read.source_choices[0].options.map(e=>e.source_id).sort(),
   ['original-source','other-workstation'].sort());
 published=[newest,p,q];
 await controller.select('previous');
 assert.equal(s.read(line).snapshot.snapshot_id,'new-revision','refresh shows latest revision for chosen source');
 await controller.chooseSource(line,q.source_id);
 assert.equal(s.read(line).snapshot.source_id,q.source_id);
 await controller.chooseSource(line,p.source_id);
 assert.equal(s.read(line).snapshot.snapshot_id,'new-revision');
 assert.equal(collections,4,'only immutable history.open reads, no MES collection');
 controller.clear();
});
test('missing selected revision is removed from the visual store without deleting any physical data',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('old','2026-10-16','previous_day');
 let available=true;
 const ctl=createReadingPeriodController(s,{list:async l=>l===line&&available?[entry(p)]:[],open:async()=>p});
 await ctl.select('previous');assert.equal(s.read(line).snapshot.snapshot_id,'old');
 available=false;
 await ctl.select('previous');
 assert.equal(s.read(line).snapshot,null,'stale historical view must not pretend its source is current');
 assert.equal(s.read(line).source,'none');
 ctl.clear();
});
test('preferred source survives the operational period change in one session, but not missing sources',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),p=snapshot('p','2026-10-16','previous_day');
 const q={...snapshot('q','2026-10-16','previous_day'),source_id:'another'};
 const history={list:async l=>l===line?[entry(p),entry(q)]:[],open:async e=>e.source_id===q.source_id?q:p};
 const ctl=createReadingPeriodController(s,history);
 await ctl.select('previous');await ctl.chooseSource(line,q.source_id);
 assert.equal(ctl.preferredSource(line),q.source_id);
 await ctl.select('today');
 await ctl.select('previous');
 assert.equal(s.read(line).snapshot.source_id,q.source_id);
 assert.equal(s.agent().period_read.source_choices[0].selected_source_id,q.source_id);
 ctl.clear();
});

test('completed previous-day 3028 locally collected revision replaces pinned old shared origin, without losing history',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),localOld=snapshot('36','2026-10-16','previous_day');
 const localNew={...snapshot('38','2026-10-16','previous_day'),collected_at:'2026-10-19T17:35:00Z'};
 const remote={...snapshot('37','2026-10-16','previous_day'),source_id:'other-workstation',collected_at:'2026-10-19T17:00:00Z'};
 let local=localOld;
 const e=p=>({...entry(p),history_source:p.source_id===local.source_id?'local':'shared'});
 const history={list:async l=>l===line?[e(remote),e(local)]:[],open:async target=>
   target.source_id===remote.source_id?remote:local};
 s.setLocalConnected(true);s.updateAgent({status:'connected',capabilities:{source_id:local.source_id}});
 const ctl=createReadingPeriodController(s,history);
 await ctl.select('previous');await ctl.chooseSource(line,remote.source_id);
 assert.equal(s.read(line).source,'remote');
 assert.equal(traceTargetForLine(s,line).reason,'Revisão não pertence ao agente local conectado');
 local=localNew;
 // A manual/period read refresh alone must retain the explicit historical choice.
 await ctl.select('previous');assert.equal(s.read(line).snapshot.snapshot_id,'37');
 await ctl.select('previous',{collectionReceipt:{snapshot_ids:{[line]:'38'},
   period_start:'2026-10-16T07:00',period_end:'2026-10-17T07:00'}});
 assert.equal(s.read(line).snapshot.snapshot_id,'38');
 assert.equal(s.read(line).source,'local');
 assert.equal(s.agent().period_read.source_choices[0].selected_source_id,local.source_id);
 assert.equal(traceTargetForLine(s,line).available,true);
 await ctl.select('previous');
 assert.equal(s.read(line).snapshot.snapshot_id,'38','refresh keeps the locally collected version');
 await ctl.chooseSource(line,remote.source_id);
 assert.equal(s.read(line).snapshot.snapshot_id,'37','older shared history remains accessible on request');
 ctl.clear();
});
test('collection receipt cannot switch an operator-selected remote source without exact local snapshot and period',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),local=snapshot('38','2026-10-16','previous_day');
 const remote={...snapshot('37','2026-10-16','previous_day'),source_id:'other-workstation'};
 s.setLocalConnected(true);s.updateAgent({status:'connected',capabilities:{source_id:local.source_id}});
 const history={list:async l=>l===line?[{...entry(local),history_source:'local'},entry(remote)]:[],
  open:async e=>e.source_id===local.source_id?local:remote};
 const ctl=createReadingPeriodController(s,history);
 await ctl.select('previous');await ctl.chooseSource(line,remote.source_id);
 await ctl.select('previous',{collectionReceipt:{snapshot_ids:{[line]:'99'},
  period_start:'2026-10-16T07:00',period_end:'2026-10-17T07:00'}});
 assert.equal(s.agent().period_read.status,'partial','unknown local job revision cannot masquerade as updated');
 assert.equal(s.read(line).snapshot,null);
 await ctl.select('previous');
 assert.equal(s.read(line).snapshot.source_id,remote.source_id);
 await ctl.select('previous',{collectionReceipt:{snapshot_ids:{[line]:'38'},
  period_start:'2026-10-15T07:00',period_end:'2026-10-16T07:00'}});
 assert.equal(s.read(line).snapshot.source_id,remote.source_id,'a different production day cannot change this selection');
 ctl.clear();
});
test('a completed local collection missing its exact historical revision fails visibly instead of showing the old shared one as updated',async()=>{
 const s=createAmesStore({now:()=>now.getTime()}),remote={...snapshot('37','2026-10-16','previous_day'),source_id:'other-workstation'};
 s.updateAgent({status:'connected',capabilities:{source_id:'my-agent'}});
 const ctl=createReadingPeriodController(s,{list:async l=>l===line?[entry(remote)]:[],open:async()=>remote});
 await ctl.select('previous');assert.equal(s.read(line).snapshot?.snapshot_id,'37');
 await ctl.select('previous',{collectionReceipt:{snapshot_ids:{[line]:'38'},
  period_start:'2026-10-16T07:00',period_end:'2026-10-17T07:00'}});
 assert.equal(s.agent().period_read.status,'partial');
 assert.match(s.agent().period_read.errors[0].error,/não foi comprovada no agente deste PC/);
 assert.equal(s.read(line).snapshot,null);
 ctl.clear();
});

test('Line 2 keeps the exact prior-day source already proven in memory across refresh even when preferences are unavailable',async()=>{
 const line2='TAN10102',p={...snapshot('LOCAL-L2','2026-10-16','previous_day'),line_id:line2,source_id:'source-L2'};
 p.summary={...p.summary,line:line2};
 const other={...snapshot('REMOTE-L2','2026-10-16','previous_day'),line_id:line2,source_id:'source-foreign'};
 other.summary={...other.summary,line:line2};
 const s=createAmesStore({now:()=>now.getTime()}),list=[entry(p),entry(other)];
 s.updateContext({line_id:line2});
 const ctl=createReadingPeriodController(s,{list:async l=>l===line2?list:[],open:async e=>e.source_id===p.source_id?p:other});
 await ctl.select('previous');
 assert.equal(s.read(line2).snapshot,null,'first choice must remain explicit when origins conflict');
 const serial=s.periodGeneration();
 s.installHistoricalSnapshot(p,{generation:serial,source:'local'});
 await ctl.select('previous');
 assert.equal(s.read(line2).snapshot?.snapshot_id,'LOCAL-L2');
 assert.equal(s.agent().period_read.source_choices[0].selected_source_id,'source-L2');
 assert.equal(s.context().line_id,line2);
 ctl.clear();
});


test('Today opens latest saved custom-window evidence from the same day without promoting it to a live head',async()=>{
 const s=createAmesStore({now:()=>now.getTime()});
 const saved=snapshot('saved-custom','2026-10-19','custom');
 saved.summary.period.end_at='2026-10-19T17:36';
 const ctl=createReadingPeriodController(s,{list:async l=>l===line?[entry(saved)]:[],open:async()=>saved});
 await ctl.select('today');
 assert.equal(s.read(line).snapshot?.snapshot_id,'saved-custom');
 assert.equal(s.read(line).saved_today,true);
 assert.equal(s.read(line).source,'remote');
 assert.equal(s.read(line).snapshot?.canonical?.summary?.period?.end_at,'2026-10-19T17:36');
 assert.equal(s.localCanonical().length,0,'historical fallback must never modify the local publisher');
 const live=snapshot('actual-live','2026-10-19','today');
 s.replaceSyncedSnapshots([live]);
 assert.equal(s.read(line).snapshot?.snapshot_id,'actual-live','verified live head takes precedence');
 assert.equal(s.read(line).saved_today,false);
 ctl.clear();
});
test('Today does not import a saved observation from yesterday or a shifted/custom start',async()=>{
 const s=createAmesStore({now:()=>now.getTime()});
 const yesterday=snapshot('yesterday','2026-10-18','custom');
 const shifted=snapshot('shifted','2026-10-19','custom');
 shifted.summary.period.start_at='2026-10-19T09:00';
 const ctl=createReadingPeriodController(s,{
  list:async l=>l===line?[entry(yesterday),entry(shifted)]:[],
  open:async p=>p.snapshot_id==='shifted'?shifted:yesterday
 });
 await ctl.select('today');
 assert.equal(s.read(line).snapshot,null);
 assert.equal(s.read(line).saved_today,false);
 ctl.clear();
});


test('history source preference is authenticated-account scoped and ignores unscoped legacy keys',async()=>{
 const previous=globalThis.localStorage,values=new Map();
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const p=snapshot('p','2026-10-16','previous_day'),q={...snapshot('q','2026-10-16','previous_day'),source_id:'OTHER-POST'};
 const history={list:async l=>l===line?[entry(p),entry(q)]:[],open:async e=>e.source_id===q.source_id?q:p};
 values.set('ames-history-source-preference-v1:'+line,q.source_id);
 const make=account=>{const store=createAmesStore({now:()=>now.getTime()});return {store,ctl:createReadingPeriodController(store,history,{preferenceScope:account})};};
 try{
  const a=make('SYNTHETIC-ACCOUNT-A');await a.ctl.select('previous');
  assert.equal(a.store.read(line).snapshot,null,'legacy browser-wide preference is not account consent');
  await a.ctl.chooseSource(line,q.source_id);
  const b=make('SYNTHETIC-ACCOUNT-B');await b.ctl.select('previous');
  assert.equal(b.store.read(line).snapshot,null,'account B cannot inherit account A source choice');
  const again=make('SYNTHETIC-ACCOUNT-A');await again.ctl.select('previous');
  assert.equal(again.store.read(line).snapshot?.source_id,q.source_id,'the same account keeps its own valid preference');
  assert.equal(values.get('ames-history-source-preference-v1:'+line),q.source_id,'do not delete or migrate legacy data');
  a.ctl.clear();b.ctl.clear();again.ctl.clear();
 }finally{globalThis.localStorage=previous;}
});

test('changing account or resetting session invalidates source overrides and stale reads',async()=>{
 let account='SYNTHETIC-A',release;
 const p=snapshot('p','2026-10-16','previous_day'),q={...snapshot('q','2026-10-16','previous_day'),source_id:'OTHER-POST'};
 const store=createAmesStore({now:()=>now.getTime()});
 const history={list:async l=>l===line?[entry(p),entry(q)]:[],open:async e=>e.source_id===q.source_id?q:p};
 const ctl=createReadingPeriodController(store,history,{preferenceScope:()=>account});
 await ctl.select('previous');await ctl.chooseSource(line,q.source_id);
 account='SYNTHETIC-B';store.clear();
 await ctl.select('previous');assert.equal(store.read(line).snapshot,null);
 assert.equal(ctl.preferredSource(line),null);
 await ctl.chooseSource(line,p.source_id);
 history.open=()=>new Promise(resolve=>{release=resolve;});
 const pending=ctl.select('previous');
 for(let i=0;i<10&&!release;i++)await Promise.resolve();
 assert.equal(typeof release,'function');
 account='SYNTHETIC-C';release(p);await pending;
 assert.equal(store.agent().period_read.status,'loading','response from prior account must not complete the new account read');
 ctl.clear();
});
