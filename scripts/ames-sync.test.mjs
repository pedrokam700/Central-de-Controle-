import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {normalizeCanonical,DATASETS} from '../ames/data/canonical.mjs';
import {publication,createMesSync,sanitizeSnapshot,compareCompetingPublisherObservations,isolatedPublisherMetrics} from '../ames/sync.mjs';
import {selectCoraContext} from '../ames/data/cora.mjs';
import {selectProcess} from '../ames/data/process-timeline.mjs';
const FACTORY_NOW=new Date('2026-10-09T12:00:00Z');
export function canonicalFixture(line='TAN10101',product='CPH2859V'){
  const p={schema:'central-ames-v2',schema_version:2,source_id:'source',snapshot_id:'1',snapshot_revision:1,content_hash:'hash',line_id:line,collected_at:'2026-10-09T10:00:00Z',source_view:'3028',summary:{line,snapshot_id:'1',collected_at:'2026-10-09T10:00:00Z',defect_rows:1,period:{mode:'today',start_at:'2026-10-09T07:00',end_at:'2026-10-09T10:00'}},datasets:Object.fromEntries(DATASETS.map(n=>[n,[]])),coverage:{},capabilities:{process_timeline:false}};
  const common={line,line_id:line,snapshot_id:'1',snapshot_revision:1,pcba_sn:'P',product,raw_ref:'sqlite:record',provenance:{contexts:[{line_id:line,pcba_sn:'P',product}],line_candidates:[line]}};
  p.datasets.defects=[{...common,record_id:'D1',occurrence_id:'O1',product_model:product,defect_code:'D',defect_time:p.collected_at}];
  p.datasets.pcba_history=[{...common,record_id:'H1',source_view:'2114',hist_seq:'1'}];
  p.datasets.material_reuse=[{...common,record_id:'M1',source_view:'3074',item_sn:'M',material_sn:'M'}];
  for(const name of DATASETS)p.coverage[name]={stored_total:p.datasets[name].length,transport_complete:true,source_complete:false,status:name==='process_timeline'?'not_collected':'partial'};
  return p;
}
test('canonical revision validation and CPH-specific 3074/2114 CORA projection',()=>{
  const p=canonicalFixture(),s=createAmesStore();s.replaceLocalSnapshots([p]);s.setLocalConnected(true);
  assert.equal(s.read(p.line_id).snapshot.occurrences[0].occurrence_id,'O1');
  const c=selectCoraContext(s,{line_id:p.line_id,product:'CPH2859V',pcba_sn:'P'});assert.equal(c.material_3074[0].material_sn,'M');assert.equal(c.pcba_history_2114.length,1);assert.equal(c.snapshot_revision,1);assert.equal(c.human_confirmed_causes.length,0);
  assert.equal(selectCoraContext(s,{line_id:p.line_id,product:'CPH2859'}).material_3074.length,0);
  assert.equal(selectProcess(s.read(p.line_id).snapshot,c.facts[0]).status,'not_collected');
  for(const mutation of [x=>x.datasets.defects[0].line_id='TAN10102',x=>x.datasets.defects[0].snapshot_revision=2,x=>x.coverage.defects.stored_total=9]){const x=structuredClone(p);mutation(x);assert.throws(()=>normalizeCanonical(x));}
});
test('publication strips credential fields and is idempotent',async()=>{
  const p=canonicalFixture();p.cookie='secret';p.datasets.defects[0].raw_json='secret';p.datasets.defects[0].password='secret';
  const a=await publication('A',p),b=await publication('A',p);assert.equal(a.id,b.id);assert(!a.parts.join('').includes('secret'));assert.equal(a.head.owner_uid,'A');assert.notEqual(a.id,(await publication('B',p)).id);
});
test('two collectors only produce candidate 3028 overlap, never an aggregate or proven deduplication',()=>{
  const a=canonicalFixture('TAN10102'),b=structuredClone(a);
  b.source_id='different-collector';b.datasets.defects[0].defect_time='2026-10-09T07:00:00-03:00';
  const r=compareCompetingPublisherObservations([{payload:a},{payload:b}]);
  assert.deepEqual(r,{state:'candidate_overlap',window_scope:'same_window',observed_defects:[1,1],outside_common_window:[0,0],coverage_complete:[false,false],
    unverifiable_rows:[0,0],ambiguous_keys:[0,0],candidate_matches:1,unmatched_observed:[0,0]});
  assert.equal(JSON.stringify(r).includes('P'),false,'no PCBA/SN in comparison evidence');
  assert.equal('merged_defects' in r,false,'a comparison is never a synthesized team snapshot');
  const other=structuredClone(b);other.datasets.defects[0].defect_code='D2';
  assert.equal(compareCompetingPublisherObservations([{payload:a},{payload:other}]).state,'no_candidate_matches');
  other.summary.period={mode:'today',start_at:'2026-10-09T11:00',end_at:'2026-10-09T12:00'};
  assert.deepEqual(compareCompetingPublisherObservations([{payload:a},{payload:other}]),{state:'different_periods'});
  const longer=structuredClone(b);longer.summary.period.end_at='2026-10-09T12:00';
  longer.datasets.defects.push({...longer.datasets.defects[0],record_id:'LATE',defect_time:'2026-10-09T11:00'});
  const partial=compareCompetingPublisherObservations([{payload:a},{payload:longer}]);
  assert.deepEqual([partial.state,partial.window_scope,partial.candidate_matches,partial.observed_defects,partial.outside_common_window],
    ['candidate_overlap','overlap_only',1,[1,1],[0,1]],'late-only data must not be treated as absent on shorter collection');
  const incomplete=structuredClone(a);incomplete.datasets.defects[0].defect_time=null;
  assert.equal(compareCompetingPublisherObservations([{payload:incomplete},{payload:b}]).state,'ambiguous_identifiers');
  const repeated=structuredClone(a);repeated.datasets.defects.push({...repeated.datasets.defects[0],record_id:'ANOTHER'});
  assert.deepEqual(compareCompetingPublisherObservations([{payload:repeated},{payload:b}]).ambiguous_keys,[1,0]);
  assert.deepEqual(compareCompetingPublisherObservations([{payload:a}]),{state:'unsupported_installation_count'});
});
test('competing source metrics are verified, bounded, isolated and exclude identifiers',()=>{
  const payload=canonicalFixture('TAN10102');
  payload.summary.fpy=97.69;
  payload.summary.check_fpy=97.86;
  payload.summary.quantity=1124;
  payload.summary.owner_uid='private-owner';
  payload.coverage.defects.source_complete=false;
  const result=isolatedPublisherMetrics(payload);
  assert.deepEqual(result,{fpy:97.69,check_fpy:97.86,quantity:1124,observed_defects:1,defects_source_complete:false});
  assert.equal(JSON.stringify(result).includes('private-owner'),false);
  assert.equal(JSON.stringify(result).includes('pcba_sn'),false);
  payload.summary.fpy=150;
  payload.summary.check_fpy='97.86';
  payload.summary.quantity=-1;
  assert.deepEqual([isolatedPublisherMetrics(payload).fpy,isolatedPublisherMetrics(payload).check_fpy,isolatedPublisherMetrics(payload).quantity],[null,null,null]);
});
test('offline/reconnect publishes once; active teammates read sanitized latest line; logout clears state',async()=>{
  let online=false,watcher;const pending=new Map(),parts=new Map(),heads=new Map(),writes=[];let fail=true;
  const queue={put:async e=>pending.set(e.id,e),list:async uid=>[...pending.values()].filter(e=>e.uid===uid),remove:async id=>pending.delete(id)};
  const remote={
    putPart:async(u,h,i,data)=>{if(fail){fail=false;throw Error('offline');}parts.set(u+h.key+i,data);writes.push(u);},
    commitHead:async(u,h)=>heads.set(h.line_id,h),
    getPart:async(owner,h,i)=>parts.get(owner+h.key+i),
    watch:(_u,cb)=>{watcher=()=>cb([...heads.values()]);watcher();return ()=>{};}
  };
  const store=createAmesStore();store.replaceLocalSnapshots([canonicalFixture()]);store.setLocalConnected(true);
  const sync=createMesSync(store,remote,{queue,online:()=>online,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});sync.start('A');await sync.capture();assert.equal(pending.size,1);assert.equal(writes.length,0);
  online=true;await sync.retry();assert.equal(pending.size,1);await sync.retry();assert.equal(pending.size,0);assert.equal(heads.size,1);await sync.capture();assert.equal(writes.length,1);
  const sameAccount=createAmesStore(),readerA=createMesSync(sameAccount,remote,{queue,online:()=>false});readerA.start('A');await new Promise(r=>setTimeout(r,30));assert.equal(sameAccount.read('TAN10101').snapshot.revision,1);readerA.stop();
  const teammate=createAmesStore(),readerB=createMesSync(teammate,remote,{queue,online:()=>false});readerB.start('B');await new Promise(r=>setTimeout(r,30));assert.equal(teammate.read('TAN10101').snapshot.revision,1);assert.equal(teammate.read('TAN10101').source,'remote');
  const syncStatus=teammate.agent().sync;assert.equal(syncStatus.read_status,'ready');assert.equal(syncStatus.remote_scope,'team_latest');assert.equal(syncStatus.remote_line_count,1);assert.equal(syncStatus.remote_latest_collected_at,'2026-10-09T10:00:00Z');
  assert.deepEqual(syncStatus.remote_heads,[{line_id:'TAN10101',source_id:'source',snapshot_id:'1',snapshot_revision:1,collected_at:'2026-10-09T10:00:00Z',authority:'team_latest'}]);assert.equal('owner_uid' in syncStatus.remote_heads[0],false);
  readerB.stop();assert.equal(teammate.agent().sync.read_status,'idle');assert.equal(teammate.agent().sync.remote_line_count,0);assert.deepEqual(teammate.agent().sync.remote_heads,[]);teammate.clear();assert.equal(teammate.read('TAN10101').snapshot,null);sync.stop();
});

test('identity mismatch is quarantined; other lines publish and historical outbox survives',async()=>{
  const pending=new Map(),partWrites=new Map(),commits=[],attempts=new Map(),history=[];
  const queue={put:async e=>pending.set(e.id,e),list:async uid=>[...pending.values()].filter(e=>e.uid===uid),remove:async id=>pending.delete(id)};
  const remote={
    putPart:async(_u,h)=>partWrites.set(h.line_id,(partWrites.get(h.line_id)||0)+1),
    commitHead:async(_u,h)=>{
      attempts.set(h.line_id,(attempts.get(h.line_id)||0)+1);
      if(h.line_id==='TAN10103')throw Error('Esta linha pertence a outra instalação. Use o migration helper para preservar a identidade da base.');
      commits.push(h.line_id);
    },
    inspectIdentity:async()=>({available:true,owner_exists:true,owner_source_matches:false,shared_exists:true,shared_owner_is_current:true}),
    commitHistory:async(_u,h)=>history.push(h.line_id),
    watch:(_uid,cb)=>{cb([]);return()=>{}}
  };
  const store=createAmesStore();
  store.replaceLocalSnapshots([canonicalFixture('TAN10102'),canonicalFixture('TAN10103')]);
  store.setLocalConnected(true);
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('A');await sync.capture();await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(commits,['TAN10102']);
  assert.equal(attempts.get('TAN10103'),1);
  assert.equal(pending.size,0,'immutable history already committed and acknowledged');
  assert.deepEqual(history.sort(),['TAN10102','TAN10103']);
  assert.equal(store.agent().sync.status,'shared_history_legacy_conflict');
  assert.equal(store.agent().sync.last_sent.line_id,'TAN10103');
  assert.equal(store.agent().sync.last_sent.authority,'operational_day_history','blocked mutable team head is never reported as committed');
  assert.equal(store.agent().sync.publish_errors[0].identity.owner_source_matches,false);
  assert(['TAN10102','TAN10103'].includes(store.agent().sync.last_publish_timing.line_id));
  const priorParts=partWrites.get('TAN10103');
  await sync.retry();
  assert.equal(attempts.get('TAN10103'),1,'permanent conflict must not retry on verification');
  assert.equal(partWrites.get('TAN10103'),priorParts,'do not retransmit blocked parts');
  assert.equal(pending.size,0,'successful immutable history must not remain pending');
  sync.stop();
});

test('advanced and previous production periods cannot commit team latest',async()=>{
  const queueEntries=new Map(),history=[],heads=[];
  const queue={put:async x=>queueEntries.set(x.id,x),list:async uid=>[...queueEntries.values()].filter(x=>x.uid===uid),remove:async id=>queueEntries.delete(id)};
  const remote={
    putPart:async()=>{},
    commitHead:async(_u,h)=>heads.push(h),
    commitHistory:async(_u,h)=>history.push(h),
    watch:(_u,cb)=>{cb([]);return()=>{}}
  };
  const store=createAmesStore(),historical=canonicalFixture('TAN10102');
  historical.summary.period={mode:'custom',start_at:'2026-09-08T07:00',end_at:'2026-09-09T07:00'};
  store.replaceLocalSnapshots([historical]);store.setLocalConnected(true);
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('A');await sync.capture();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(heads.length,0,'September must not replace current head');
  assert.equal(history.length,1,'historical revision remains auditable');
  assert.equal(store.agent().sync.last_sent.authority,'operational_day_history');
  assert.equal(queueEntries.size,0);
  sync.stop();
});

test('Line 3 reaches PC B from immutable day index despite an old legacy owner head',async()=>{
  const current=canonicalFixture('TAN10103');
  const old=canonicalFixture('TAN10103');
  old.source_id='old-installation';
  old.summary.period={mode:'previous_day',start_at:'2026-10-08T07:00',end_at:'2026-10-09T07:00'};
  const livePublication=await publication('A',current,{now:FACTORY_NOW});
  const oldPublication=await publication('A',old,{now:FACTORY_NOW});
  const content=new Map();
  for(const item of [livePublication,oldPublication])item.parts.forEach((part,i)=>content.set(item.head.key+':'+i,part));
  const remote={
    getPart:async(_uid,h,i)=>content.get(h.key+':'+i),
    watch:(_uid,cb)=>{cb([oldPublication.head,{...livePublication.head,...livePublication.history}],{day_index_available:true,from_cache:false});return()=>{}}
  };
  const empty={put:async()=>{},remove:async()=>{},list:async()=>[]};
  const store=createAmesStore();
  const sync=createMesSync(store,remote,{queue:empty,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('B');await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(store.read('TAN10103').snapshot.source_id,'source');
  assert.equal(store.agent().sync.remote_scope,'operational_day_history');
  assert.equal(store.agent().sync.remote_line_count,1);
  assert.equal(store.agent().sync.read_status,'ready');
  sync.stop();
});

test('different current installations cannot silently replace one another on PC B',async()=>{
  const first=canonicalFixture('TAN10103'),second=canonicalFixture('TAN10103');
  second.source_id='new-source';
  first.summary.fpy=97.26;first.summary.quantity=1422;
  second.summary.fpy=96.5;second.summary.quantity=1420;
  const p1=await publication('A',first,{now:FACTORY_NOW}),p2=await publication('B',second,{now:FACTORY_NOW});
  const parts=new Map();
  for(const p of [p1,p2])p.parts.forEach((v,i)=>parts.set(p.head.key+':'+i,v));
  const remote={
    getPart:async(_u,h,i)=>parts.get(h.key+':'+i),
    watch:(_uid,cb)=>{cb([{...p1.head,...p1.history},{...p2.head,...p2.history}],{day_index_available:true,from_cache:false});return()=>{}}
  };
  const queue={put:async()=>{},remove:async()=>{},list:async()=>[]},store=createAmesStore();
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('C');await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(store.read('TAN10103').snapshot,null);
  assert.equal(store.agent().sync.read_status,'origin_conflict');
  assert.deepEqual(store.agent().sync.origin_conflict_lines,['TAN10103']);
  assert.deepEqual(store.agent().sync.origin_conflict_candidates.map(x=>[x.line_id,x.installations,x.distinct_sources,x.identity_collision]),
    [['TAN10103',2,2,false]]);
  assert.deepEqual(store.agent().sync.origin_conflict_candidates[0].candidates.map(x=>x.source_id).sort(),['new-source','source']);
  assert.equal(JSON.stringify(store.agent().sync.origin_conflict_candidates).includes('owner_uid'),false);
  assert.equal(store.agent().sync.origin_conflict_candidates[0].observation_comparison.state,'candidate_overlap');
  const isolated=store.agent().sync.origin_conflict_candidates[0].candidates.map(x=>x.isolated_metrics);
  assert.deepEqual(isolated.map(x=>x.quantity).sort(),[1420,1422]);
  assert.deepEqual(isolated.map(x=>x.fpy).sort(),[96.5,97.26]);
  assert(isolated.every(x=>x.observed_defects===1&&x.defects_source_complete===false));
  assert.equal(store.agent().sync.remote_line_count,0,'observations must not become a team head');
  assert.equal(store.read('TAN10103').snapshot,null,'read-only isolated observations never become Today');
  sync.stop();
  assert.deepEqual(store.agent().sync.origin_conflict_candidates,[],'logout removes reviewer metadata');
});

test('an incomplete Firestore cache cannot revoke a server-verified multiwriter conflict',async()=>{
  const a=canonicalFixture('TAN10102'),b=canonicalFixture('TAN10102');b.source_id='second-live-source';
  const pa=await publication('owner-A',a,{now:FACTORY_NOW}),pb=await publication('owner-B',b,{now:FACTORY_NOW});
  const parts=new Map();for(const p of [pa,pb])p.parts.forEach((v,i)=>parts.set(p.head.key+':'+i,v));
  let notify;
  const remote={getPart:async(_u,h,i)=>parts.get(h.key+':'+i),
    watch:(_u,cb)=>{notify=cb;cb([{...pa.head,...pa.history},{...pb.head,...pb.history}],{day_index_available:true,from_cache:false});return()=>{};}};
  const queue={put:async()=>{},remove:async()=>{},list:async()=>[]},store=createAmesStore();
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('reader');
  notify([{...pa.head,...pa.history}],{day_index_available:true,from_cache:true});
  await new Promise(r=>setTimeout(r,40));
  assert.equal(store.agent().sync.read_status,'origin_conflict');
  assert.equal(store.agent().sync.origin_conflict_candidates[0].installations,2);
  notify([{...pa.head,...pa.history}],{day_index_available:true,from_cache:true});
  await new Promise(r=>setTimeout(r,40));
  assert.equal(store.agent().sync.read_status,'origin_conflict');
  assert.equal(store.agent().sync.origin_conflict_candidates[0].installations,2);
  assert.equal(store.agent().sync.remote_line_count,0);
  assert.equal(store.read('TAN10102').snapshot,null,'cache may not promote a single source');
  notify([],{day_index_available:true,from_cache:true});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(store.agent().sync.read_status,'origin_conflict','empty cached index cannot clear prior conflict');
  assert.equal(store.agent().sync.origin_conflict_candidates[0].installations,2);
  sync.stop();
});

test('same source ID reused under different owners stays in conflict without exposing owner UID',async()=>{
  const payload=canonicalFixture('TAN10102');
  const a=await publication('installation-owner-A',payload,{now:FACTORY_NOW});
  const b=await publication('installation-owner-B',payload,{now:FACTORY_NOW});
  const parts=new Map();for(const item of [a,b])item.parts.forEach((v,i)=>parts.set(item.head.owner_uid+':'+i,v));
  const remote={
    getPart:async(owner,_head,index)=>parts.get(owner+':'+index),
    watch:(_uid,cb)=>{cb([{...a.head,...a.history},{...b.head,...b.history}],{day_index_available:true});return()=>{};}
  };
  const queue={put:async()=>{},remove:async()=>{},list:async()=>[]},store=createAmesStore();
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('third-workstation');await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(store.agent().sync.read_status,'origin_conflict');
  const conflict=store.agent().sync.origin_conflict_candidates[0];
  assert.deepEqual([conflict.line_id,conflict.installations,conflict.distinct_sources,conflict.identity_collision],
    ['TAN10102',2,1,true]);
  assert.equal(conflict.candidates.length,2);
  assert.equal(conflict.observation_comparison.candidate_matches,1);
  assert.equal(JSON.stringify(conflict).includes('installation-owner-'),false);
  assert.equal(store.read('TAN10102').snapshot,null);
  sync.stop();
});

test('day index downloads newest valid revision only, yet falls back from newer advanced query',async()=>{
  const samples=[];
  for(let i=1;i<=22;i++){
    const payload=canonicalFixture('TAN10103');
    payload.snapshot_id=String(i);
    payload.summary.snapshot_id=payload.snapshot_id;
    payload.collected_at='2026-10-09T10:'+String(i).padStart(2,'0')+':00Z';
    payload.summary.collected_at=payload.collected_at;
    payload.summary.period={mode:'today',start_at:'2026-10-09T07:00',end_at:'2026-10-09T10:30'};
    for(const rows of Object.values(payload.datasets))for(const row of rows)row.snapshot_id=payload.snapshot_id;
    samples.push(await publication('A',payload,{now:FACTORY_NOW}));
  }
  const custom=canonicalFixture('TAN10103');
  custom.snapshot_id='23';custom.summary.snapshot_id='23';
  custom.collected_at='2026-10-09T10:23:00Z';
  custom.summary.collected_at=custom.collected_at;
  custom.summary.period={mode:'custom',start_at:'2026-10-09T07:00',end_at:'2026-10-09T10:23'};
  for(const rows of Object.values(custom.datasets))for(const row of rows)row.snapshot_id='23';
  samples.push(await publication('A',custom,{now:FACTORY_NOW}));
  const allParts=new Map(),heads=[];
  for(const item of samples){
    item.parts.forEach((part,i)=>allParts.set(item.head.key+':'+i,part));
    heads.push({...item.head,...item.history});
  }
  let reads=0;
  const remote={
    getPart:async(_u,h,i)=>{reads++;return allParts.get(h.key+':'+i);},
    watch:(_u,receive)=>{receive(heads,{day_index_available:true,from_cache:false});return ()=>{};}
  };
  const queue={put:async()=>{},remove:async()=>{},list:async()=>[]},store=createAmesStore();
  const sync=createMesSync(store,remote,{queue,online:()=>true,now:()=>FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('B');
  await new Promise(done=>setTimeout(done,90));
  assert.equal(store.read('TAN10103').snapshot.snapshot_id,'22','advanced query cannot supersede valid today');
  assert.equal(reads,2,'newest custom and newest valid live only, not all 23 historical revisions');
  assert.equal(store.agent().sync.last_receive_timing.downloaded,2);
  assert.equal(store.agent().sync.last_receive_timing.skipped_versions,21);
  assert.equal(store.agent().sync.last_receive_timing.candidates,23);
  assert.equal(store.agent().sync.read_status,'ready');
  sync.stop();
});
