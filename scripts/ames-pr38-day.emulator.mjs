// Isolated real Firestore Rules emulator, no live factory/cloud access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {firestoreTransport} from '../ames/firebase-sync.mjs';
import {publication,createMesSync} from '../ames/sync.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {canonicalFixture} from './ames-sync.test.mjs';
const modules=process.env.FIREBASE_TEST_MODULES;
const {initializeTestEnvironment}=await import(pathToFileURL(modules+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const fb=await import(pathToFileURL(modules+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const waitFor=async(fn,label)=>{for(let n=0;n<200;n++){if(await fn())return;await new Promise(done=>setTimeout(done,35));}throw Error('Timeout: '+label);};
const queue={put:async()=>{},remove:async()=>{},list:async()=>[]};
function snapshot({id,source,date,mode}){
  const p=canonicalFixture('TAN10103');
  p.snapshot_id=String(id);p.source_id=source;
  p.collected_at=date+'T12:00:00Z';
  p.summary.snapshot_id=p.snapshot_id;
  p.summary.collected_at=p.collected_at;
  p.summary.period={mode,start_at:date+'T07:00-03:00',end_at:date+'T09:00-03:00'};
  for(const rows of Object.values(p.datasets))for(const row of rows)row.snapshot_id=p.snapshot_id;
  return p;
}
async function saveParts(remote,uid,entry){
  for(let i=0;i<entry.parts.length;i++)await remote.putPart(uid,entry.head,i,entry.parts[i]);
}
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    for(const uid of ['A','B'])await fb.setDoc(fb.doc(ctx.firestore(),'users',uid),{email:uid.toLowerCase()+'@example.test',role:'user',disabled:false});
  });
  const a=firestoreTransport({...fb,db:env.authenticatedContext('A').firestore(),auth:{currentUser:{uid:'A'}}});
  const b=firestoreTransport({...fb,db:env.authenticatedContext('B').firestore(),auth:{currentUser:{uid:'B'}}});
  const old=await publication('A',snapshot({id:4,source:'legacy-install',date:'2026-10-16',mode:'previous_day'}));
  const current=await publication('A',snapshot({id:11,source:'new-install',date:'2026-10-19',mode:'today'}),{now:new Date('2026-10-19T12:20:00Z')});
  await saveParts(a,'A',old);await a.commitHead('A',old.head);await a.commitHistory('A',old.head,old.history);
  await saveParts(a,'A',current);await a.commitHistory('A',current.head,current.history);
  await assert.rejects(a.commitHead('A',current.head),/outra instalação/);
  const inspected=await a.inspectIdentity('A',current.head);
  assert.equal(inspected.owner_exists,true);
  assert.equal(inspected.owner_source_matches,false);
  const oldOwner=await fb.getDoc(fb.doc(env.authenticatedContext('A').firestore(),'amesUsers','A','lines','TAN10103'));
  assert.equal(oldOwner.data().source_id,'legacy-install');
  const oldShared=await fb.getDoc(fb.doc(env.authenticatedContext('B').firestore(),'amesTeamLines','TAN10103'));
  assert.equal(oldShared.data().source_id,'legacy-install');
  const store=createAmesStore();
  const sync=createMesSync(store,b,{queue,online:()=>true,now:()=>new Date('2026-10-19T12:25:00Z'),schedule:()=>0,unschedule:()=>{}});
  try{
    sync.start('B');
    await waitFor(()=>store.read('TAN10103').snapshot?.source_id==='new-install','Line3 current immutable history reaches B');
    assert.equal(store.agent().sync.remote_scope,'operational_day_history');
    assert.equal(store.agent().sync.read_status,'ready');
    assert.equal(store.agent().sync.remote_line_count,1);
    const history=await sync.listHistory('TAN10103');
    assert.equal(history.length,2,'old and new revisions remain immutable');
  }finally{sync.stop();}
  // The second workstation publishes the SAME factory-day 07:00 instant as
  // 10:00Z. The index must not hide it or promote the first origin as unique.
  const utc=snapshot({id:12,source:'second-install',date:'2026-10-19',mode:'today'});
  utc.summary.period={mode:'today',start_at:'2026-10-19T10:00:00Z',end_at:'2026-10-19T12:00:00Z'};
  const competitor=await publication('B',utc,{now:new Date('2026-10-19T12:20:00Z')});
  assert.equal(competitor.publish_scope,'today');
  await saveParts(b,'B',competitor);await b.commitHistory('B',competitor.head,competitor.history);
  // Another revision with a different start on the same lexical date must
  // not shadow the valid competing head or be downloaded as a current head.
  const different=snapshot({id:13,source:'second-install',date:'2026-10-19',mode:'today'});
  different.summary.period={mode:'today',start_at:'2026-10-19T11:00:00Z',end_at:'2026-10-19T13:00:00Z'};
  const unrelated=await publication('B',different,{now:new Date('2026-10-19T12:20:00Z')});
  assert.equal(unrelated.publish_scope,'history');
  await saveParts(b,'B',unrelated);await b.commitHistory('B',unrelated.head,unrelated.history);
  const conflictStore=createAmesStore();
  const receiver=createMesSync(conflictStore,a,{queue,online:()=>true,now:()=>new Date('2026-10-19T12:25:00Z'),schedule:()=>0,unschedule:()=>{}});
  try{
    receiver.start('A');
    await waitFor(()=>conflictStore.agent().sync.read_status==='origin_conflict','UTC/local two-origin conflict');
    const status=conflictStore.agent().sync;
    assert.deepEqual(status.origin_conflict_lines,['TAN10103']);
    assert.equal(status.origin_conflict_candidates[0].installations,2);
    assert.deepEqual(status.origin_conflict_candidates[0].candidates.map(x=>x.source_id).sort(),['new-install','second-install']);
    assert.equal(status.remote_line_count,0,'never promote a single current head for competing collectors');
    assert.equal(conflictStore.read('TAN10103').snapshot,null,'no merged/selected 3028 snapshot is installed');
    assert.equal(status.last_receive_timing.candidates,2,'same-day unrelated periods are filtered before payload download');
  }finally{receiver.stop();}
  console.log('PASS: real Firestore Rules preserves prior identity, discovers equivalent UTC/local production starts, excludes unrelated periods and blocks competing current heads');
}finally{await env.cleanup();}
