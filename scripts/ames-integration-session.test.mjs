import test from 'node:test';
import assert from 'node:assert/strict';
import {createMesIntegration} from '../ames/integration-session.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {createMesSync,publication} from '../ames/sync.mjs';
import {canonicalFixture} from './ames-sync.test.mjs';
const FACTORY_NOW=()=>new Date('2026-10-09T12:00:00Z');
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,2));};
const outbox=()=>{const data=new Map();return {data,put:async e=>data.set(e.id,e),list:async uid=>[...data.values()].filter(e=>e.uid===uid),remove:async id=>data.delete(id)};};
const remote=()=>{const writes=[],parts=new Map();return {writes,putPart:async(u,h,i,data)=>parts.set(h.key+i,data),commitHead:async(u,h)=>writes.push(h),getPart:async(u,h,i)=>parts.get(h.key+i),watch:()=>()=>{}};};

test('authenticated Central publishes monitor updates without constructing any Console view',async()=>{
  const store=createAmesStore(),r=remote(),q=outbox(),ticks=[];let p=canonicalFixture(),requests=0;
  const fetcher=async url=>{
    const u=new URL(url);let value={};requests++;
    if(u.pathname.endsWith('/health'))value={agent_version:'0.5.23',mes_scheduler:{policy:'fifo-monitor-skip-v1'}};
    if(u.pathname.endsWith('/v2/capabilities'))value={schema:'central-ames-v2',native_console:true,cursor:true,revision:true};
    if(u.pathname.endsWith('/v2/snapshots'))value={snapshots:[{...p,datasets:undefined,insights:undefined}]};
    if(u.pathname.endsWith('/v2/records')){const name=u.searchParams.get('dataset'),rows=name==='insights'?[]:p.datasets[name];value={...p,rows,dataset:name,next_cursor:null,total:rows.length};}
    return {ok:true,status:200,json:async()=>value};
  };
  const integration=createMesIntegration(store,r,{transport:{fetcher,agentToken:'fixture-only'},syncOptions:{queue:q,online:()=>true,now:FACTORY_NOW},schedule:fn=>{ticks.push(fn);return fn;},unschedule:fn=>{const i=ticks.indexOf(fn);if(i>=0)ticks.splice(i,1);}});
  integration.start('A');await settle();assert.equal(r.writes.length,1);assert.equal(r.writes[0].snapshot_revision,1);
  // Simulates the autonomous agent monitor producing a new revision while home/dashboard is open.
  p=canonicalFixture();p.snapshot_revision=2;p.content_hash='revision-2';for(const rows of Object.values(p.datasets))for(const row of rows)row.snapshot_revision=2;
  await ticks.shift()();await settle();assert.equal(r.writes.length,2);assert.equal(r.writes[1].snapshot_revision,2);
  await ticks.shift()();await settle();assert.equal(r.writes.length,2,'unchanged snapshots are not republished');
  integration.stop();assert.equal(ticks.length,0);const before=requests;await settle();assert.equal(requests,before);
});

test('offline restart hydrates durable outbox, retries another line despite a permanent line error',async()=>{
  const q=outbox(),s=createAmesStore(),r=remote();let online=false;
  for(const line of ['TAN10101','TAN10102'])await q.put(await publication('A',canonicalFixture(line)));
  const commit=r.commitHead;r.commitHead=async(u,h)=>{if(h.line_id==='TAN10101')throw Error('source conflict');await commit(u,h);};
  const sync=createMesSync(s,r,{queue:q,online:()=>online,now:FACTORY_NOW,schedule:()=>0,unschedule:()=>{}});
  sync.start('A');await settle();assert.equal(s.agent().sync.pending,2);assert.equal(r.writes.length,0);
  online=true;await sync.retry();assert.equal(r.writes.length,1);assert.equal(r.writes[0].line_id,'TAN10102');assert.equal(q.data.size,1);assert.equal(s.agent().sync.pending,1);assert.equal(s.agent().sync.publish_errors[0].stage,'head');sync.stop();
});

test('retry recreates terminal Firestore watch, cache does not claim server verification',async()=>{
  const s=createAmesStore(),q=outbox(),r=remote(),p=await publication('A',canonicalFixture());let watches=0;
  for(let i=0;i<p.parts.length;i++)await r.putPart('A',p.head,i,p.parts[i]);
  let send;r.watch=(u,cb,error)=>{watches++;send=cb;if(watches===1)error(Object.assign(Error('permission-denied'),{code:'permission-denied'}));return ()=>{};};
  const sync=createMesSync(s,r,{queue:q,online:()=>false,schedule:()=>0,unschedule:()=>{}});
  sync.start('B');await settle();assert.equal(s.agent().sync.read_status,'error');await sync.retry();assert.equal(watches,2);
  send([p.head],{from_cache:true});await settle();assert.equal(s.agent().sync.read_status,'cached');assert.equal(s.agent().sync.server_received_at,null);
  send([p.head],{from_cache:false});await settle();assert.equal(s.agent().sync.read_status,'ready');assert(s.agent().sync.server_received_at);
  sync.stop();
});

test('concurrent captures coalesce; logout prevents late read/write callbacks crossing accounts',async()=>{
  const s=createAmesStore(),q=outbox(),r=remote();s.replaceLocalSnapshots([canonicalFixture()]);let callbacks=[];
  r.watch=(u,cb)=>{callbacks.push(cb);return ()=>{};};
  const sync=createMesSync(s,r,{queue:q,online:()=>false});sync.start('A');await Promise.all([sync.capture(),sync.capture(),sync.capture()]);assert.equal(q.data.size,1);
  sync.stop();s.clear();sync.start('B');const p=await publication('A',canonicalFixture());callbacks[0]([p.head]);await settle();assert.equal(s.read('TAN10101').snapshot,null);assert.equal(s.agent().sync.pending,0);sync.stop();
});

test('failed integrity preserves verified remote data and never turns into zero',async()=>{
  const s=createAmesStore(),q=outbox(),r=remote(),p=await publication('A',canonicalFixture());let send;
  for(let i=0;i<p.parts.length;i++)await r.putPart('A',p.head,i,p.parts[i]);
  r.watch=(u,cb)=>{send=cb;return ()=>{};};
  const sync=createMesSync(s,r,{queue:q,online:()=>false,schedule:()=>0,unschedule:()=>{}});sync.start('B');send([p.head]);await settle();
  assert.equal(s.occurrences({line_id:'TAN10101'}).rows.length,1);send([{...p.head,key:'tampered'}]);await settle();assert.equal(s.agent().sync.read_status,'error');assert.equal(s.occurrences({line_id:'TAN10101'}).rows.length,1);sync.stop();
});

test('Verify cannot invent a server response before the first watch event',async()=>{
  const s=createAmesStore(),sync=createMesSync(s,remote(),{queue:outbox(),online:()=>false});
  sync.start('B');await sync.retry();await settle();
  assert.equal(s.agent().sync.read_status,'connecting');assert.equal(s.agent().sync.server_received_at,null);sync.stop();
});

test('terminal watch error invalidates in-flight read and retains reconnect timer',async()=>{
  const s=createAmesStore(),r=remote(),p=await publication('A',canonicalFixture()),timers=[];let send,fail,release;
  r.watch=(u,cb,error)=>{send=cb;fail=error;return ()=>{};};
  r.getPart=()=>new Promise(resolve=>{release=()=>resolve(p.parts[0]);});
  const sync=createMesSync(s,r,{queue:outbox(),online:()=>false,schedule:fn=>{timers.push(fn);return fn;},unschedule:fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);}});
  sync.start('B');send([p.head],{from_cache:false});await settle();fail(Error('permission-denied'));release();await settle();
  assert.equal(s.agent().sync.read_status,'error');assert.equal(s.agent().sync.server_received_at,null);assert.equal(timers.length,1);sync.stop();
});

test('outbox completion after logout cannot put publisher A metadata into session B',async()=>{
  const s=createAmesStore(),q=outbox(),r=remote();let release;
  await q.put(await publication('A',canonicalFixture()));
  q.remove=id=>new Promise(resolve=>{release=()=>{q.data.delete(id);resolve();};});
  const sync=createMesSync(s,r,{queue:q,online:()=>true,now:FACTORY_NOW});sync.start('A');await settle();assert(release);
  sync.start('B');await settle();release();await settle();assert.equal(s.agent().sync.last_sent,null);assert.equal(s.agent().sync.pending,0);sync.stop();
});

test('offline Verify reuses evidence without inventing a new server confirmation time',async()=>{
  const s=createAmesStore(),r=remote(),p=await publication('A',canonicalFixture());let send,online=true;
  r.watch=(u,cb)=>{send=cb;return ()=>{};};for(let i=0;i<p.parts.length;i++)await r.putPart('A',p.head,i,p.parts[i]);
  const sync=createMesSync(s,r,{queue:outbox(),online:()=>online});sync.start('B');send([p.head],{from_cache:false});await settle();
  const stamp=s.agent().sync.server_received_at;assert(stamp);online=false;await sync.retry();await settle();
  assert.equal(s.agent().sync.read_status,'cached');assert.equal(s.agent().sync.server_received_at,stamp);sync.stop();
});
