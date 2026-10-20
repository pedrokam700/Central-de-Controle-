// E gate: real Firestore Emulator, authenticated A -> team immutable history ->
// B historical analytics. No factory, MES, browser localhost, or production Firebase.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {firestoreTransport} from '../ames/firebase-sync.mjs';
import {publication,createMesSync} from '../ames/sync.mjs';
import {createMesHistorySource} from '../ames/history-source.mjs';
import {createHistoryTrendReader} from '../ames/data/history-trends.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {DATASETS} from '../ames/data/canonical.mjs';
function canonicalFixture(line,product='CPH2859V'){
  const p={schema:'central-ames-v2',schema_version:2,source_id:'source',
    snapshot_id:'1',snapshot_revision:1,content_hash:'hash',line_id:line,
    collected_at:'2026-10-09T10:00:00Z',source_view:'3028',
    summary:{line,snapshot_id:'1',collected_at:'2026-10-09T10:00:00Z',
      defect_rows:1,period:{mode:'today',start_at:'2026-10-09T07:00',
        end_at:'2026-10-09T10:00'}},
    datasets:Object.fromEntries(DATASETS.map(name=>[name,[]])),coverage:{},
    capabilities:{process_timeline:false}};
  const common={line,line_id:line,snapshot_id:'1',snapshot_revision:1,
    pcba_sn:'P',product,raw_ref:'sqlite:record',
    provenance:{contexts:[{line_id:line,pcba_sn:'P',product}],line_candidates:[line]}};
  p.datasets.defects=[{...common,record_id:'D1',occurrence_id:'O1',product_model:product,
    defect_code:'D',defect_time:p.collected_at}];
  p.datasets.pcba_history=[{...common,record_id:'H1',source_view:'2114',hist_seq:'1'}];
  p.datasets.material_reuse=[{...common,record_id:'M1',source_view:'3074',
    item_sn:'M',material_sn:'M'}];
  for(const name of DATASETS)p.coverage[name]={stored_total:p.datasets[name].length,
    transport_complete:true,source_complete:false,
    status:name==='process_timeline'?'not_collected':'partial'};
  return p;
}

const modules=process.env.FIREBASE_TEST_MODULES;
if(!modules)throw Error('FIREBASE_TEST_MODULES is required');
const {initializeTestEnvironment,assertFails}=await import(pathToFileURL(modules+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const fb=await import(pathToFileURL(modules+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({
  projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}
});
const LINE='TAN10103',SOURCE='factory-A',now=new Date('2026-10-19T12:25:00Z');
const queue={put:async()=>{},remove:async()=>{},list:async()=>[]};
const waitFor=async(predicate,label)=>{
  for(let n=0;n<200;n++){
    if(await predicate())return;
    await new Promise(resolve=>setTimeout(resolve,35));
  }
  throw Error('Timed out: '+label);
};
const nextDay=date=>new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
function day({date,id,revision=1,mode='previous_day',quantity=100}){
  const p=canonicalFixture(LINE,'CPH2859V');
  p.source_id=SOURCE;p.snapshot_id=String(id);p.snapshot_revision=revision;
  p.content_hash='e'.repeat(64);p.collected_at=date+'T12:00:00Z';
  p.summary.snapshot_id=p.snapshot_id;p.summary.collected_at=p.collected_at;
  p.summary.quantity=quantity;p.summary.fpy=95;p.summary.check_fpy=94;
  p.summary.period={mode,start_at:date+'T07:00-03:00',
    end_at:mode==='today'?date+'T09:00-03:00':nextDay(date)+'T07:00-03:00'};
  for(const rows of Object.values(p.datasets))for(const row of rows){
    row.snapshot_id=p.snapshot_id;row.snapshot_revision=revision;
  }
  // The actual defect event belongs to this historical day, not the source
  // fixture's original 09 October event. Association MUST match its time.
  p.datasets.defects[0].defect_time=p.collected_at;
  // Explicit reuse for the existing C model; no fabricated no-failure outcome.
  p.datasets.defects[0]._pcba_use_index=2;
  p.datasets.material_reuse[0].item_type='LCM';
  p.datasets.material_reuse[0].material_use_index=2;
  p.datasets.material_reuse[0].defect_code='D';
  p.datasets.material_reuse[0].defect_time=p.datasets.defects[0].defect_time;
  p.datasets.material_reuse[0].part_number='PN-LCM';
  // The C analyzer intentionally reads usage evidence from normalized insight
  // drilldowns, rather than trusting unprojected arbitrary 3028/3074 columns.
  p.insights={schema:'ames-insights-v1',ready:true,line:LINE,snapshot_id:String(id),
    drilldowns:{
      pcba_analysis:[{pcba_sn:'P',defect_code:'D',defect_time:p.collected_at,
        pcba_use_index:2,product_model:'CPH2859V'}],
      material_analysis:[{pcba_sn:'P',item_sn:'M',item_type:'LCM',
        defect_code:'D',defect_time:p.collected_at,
        material_use_index:2,part_number:'PN-LCM',product_model:'CPH2859V'}]
    }};
  // These private attributes MUST be stripped by the publication sanitizer.
  p.cookie='PRIVATE-COOKIE-E';p.datasets.defects[0].raw_json='PRIVATE-RAW-E';
  return p;
}
async function publish(transport,payload){
  const entry=await publication('A',payload,{now});
  assert(!entry.parts.join('').includes('PRIVATE-COOKIE-E'));
  assert(!entry.parts.join('').includes('PRIVATE-RAW-E'));
  for(let i=0;i<entry.parts.length;i++)await transport.putPart('A',entry.head,i,entry.parts[i]);
  await transport.commitHistory('A',entry.head,entry.history);
  // The current owner pointer may change only for a genuinely current day.
  if(payload.summary.period.mode==='today')await transport.commitHead('A',entry.head);
  return entry;
}
let sync=null,remoteCalls=0;
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    for(const uid of ['A','B','disabled'])
      await fb.setDoc(fb.doc(context.firestore(),'users',uid),
        {email:uid.toLowerCase()+'@example.test',role:'user',disabled:uid==='disabled'});
  });
  const a=firestoreTransport({...fb,db:env.authenticatedContext('A').firestore(),auth:{currentUser:{uid:'A'}}});
  const b=firestoreTransport({...fb,db:env.authenticatedContext('B').firestore(),auth:{currentUser:{uid:'B'}}});
  const old1=day({date:'2026-10-16',id:4,quantity:100});
  const old2=day({date:'2026-10-16',id:4,revision:2,quantity:105});
  const previous=day({date:'2026-10-17',id:5,quantity:130});
  const current=day({date:'2026-10-19',id:11,mode:'today',quantity:150});
  for(const p of [old1,old2,previous,current])await publish(a,p);
  const guest=env.unauthenticatedContext().firestore();
  const inactive=env.authenticatedContext('disabled').firestore();
  const historyPath=['amesTeamLines',LINE,'history'];
  const index=await b.listHistory(LINE);
  assert.equal(index.length,4,'all source revisions retain their immutable history IDs');
  await assertFails(fb.getDoc(fb.doc(guest,...historyPath,'A_'+(await publication('A',old1)).head.key)));
  await assertFails(fb.getDoc(fb.doc(inactive,...historyPath,'A_'+(await publication('A',old1)).head.key)));
  const store=createAmesStore({now:()=>now.getTime()});
  sync=createMesSync(store,b,{queue,online:()=>true,now:()=>now,
    schedule:()=>0,unschedule:()=>{}});
  sync.start('B');
  await waitFor(()=>store.read(LINE).snapshot?.snapshot_id==='11'&&
    store.agent().sync?.read_status==='ready','current B head');
  const head=store.read(LINE).snapshot;
  assert.equal(head.source_id,SOURCE);
  assert.equal(store.read(LINE).source,'remote');
  assert.equal(store.agent().sync.remote_scope,'operational_day_history');
  const history=createMesHistorySource(sync,{
    async localHistoryList(){remoteCalls++;throw Error('B cannot query A localhost');},
    async historicalPayload(){remoteCalls++;throw Error('B cannot open A localhost');}
  },store);
  const entries=await history.list(LINE);
  assert.equal(entries.length,4);
  assert(entries.every(e=>e.history_source==='shared'));
  const reader=createHistoryTrendReader(history);
  const result=await reader.read({line:LINE,source:SOURCE,endDate:'2026-10-19',days:7});
  assert.equal(result.points.length,7);
  const loaded=result.points.filter(p=>p.snapshot);
  assert.equal(loaded.length,3,'two revisions of 16 Oct count as ONE day');
  const sixteen=result.points.find(p=>p.date==='2026-10-16');
  assert.equal(sixteen.entry.snapshot_revision,2,'latest preserved canonical revision wins');
  assert.equal(sixteen.quantity,105);
  assert.equal(sixteen.stored_revisions,2);
  assert.equal(sixteen.cohorts.pcbas.counts.reused,1);
  assert.equal(sixteen.cohorts.components.counts.reused,1);
  assert.equal(sixteen.cohorts.components.failure_rate,null);
  assert.equal(sixteen.cohorts.components.counts.verified_no_failure,0);
  assert.equal(result.points.find(p=>p.date==='2026-10-18').status,'not_collected');
  assert.equal(result.points.find(p=>p.date==='2026-10-19').quantity,150);
  assert.equal(store.read(LINE).snapshot.snapshot_id,'11','historical reads cannot replace current head');
  assert.equal(remoteCalls,0,'no local agent/MES request on PC B');
  const opened=await history.open(entries.find(e=>String(e.snapshot_id)==='4'&&e.snapshot_revision===1));
  assert.equal(opened.snapshot_revision,1,'old immutable revision is still readable');
  assert(!JSON.stringify(opened).includes('PRIVATE-'));
  assert.equal(store.read(LINE).snapshot.snapshot_id,'11');
  // A forged index cannot alias another production day or silently fall back.
  await assert.rejects(history.open({...entries[0],period_start:'2026-10-15T07:00-03:00'}),
    /History metadata mismatch/);
  sync.stop();sync=null;
  assert.equal(store.read(LINE).snapshot,null,'session logout clears B head');
  console.log('PASS: Firestore A to B, old and current revisions, 7-day C/D analytics, forbidden users, sanitized payload, no MES/localhost, session cleanup');
}finally{sync?.stop();await env.cleanup();}
