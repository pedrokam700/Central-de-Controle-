import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {normalizeCanonical,DATASETS} from '../ames/data/canonical.mjs';
import {publication,createMesSync,sanitizeSnapshot} from '../ames/sync.mjs';
import {selectCoraContext} from '../ames/data/cora.mjs';
import {selectProcess} from '../ames/data/process-timeline.mjs';
export function canonicalFixture(line='TAN10101',product='CPH2859V'){
  const p={schema:'central-ames-v2',schema_version:2,source_id:'source',snapshot_id:'1',snapshot_revision:1,content_hash:'hash',line_id:line,collected_at:'2026-10-09T10:00:00Z',source_view:'3028',summary:{line,snapshot_id:'1',collected_at:'2026-10-09T10:00:00Z',defect_rows:1},datasets:Object.fromEntries(DATASETS.map(n=>[n,[]])),coverage:{},capabilities:{process_timeline:false}};
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
  const sync=createMesSync(store,remote,{queue,online:()=>online,schedule:()=>0,unschedule:()=>{}});sync.start('A');await sync.capture();assert.equal(pending.size,1);assert.equal(writes.length,0);
  online=true;await sync.retry();assert.equal(pending.size,1);await sync.retry();assert.equal(pending.size,0);assert.equal(heads.size,1);await sync.capture();assert.equal(writes.length,1);
  const sameAccount=createAmesStore(),readerA=createMesSync(sameAccount,remote,{queue,online:()=>false});readerA.start('A');await new Promise(r=>setTimeout(r,30));assert.equal(sameAccount.read('TAN10101').snapshot.revision,1);readerA.stop();
  const teammate=createAmesStore(),readerB=createMesSync(teammate,remote,{queue,online:()=>false});readerB.start('B');await new Promise(r=>setTimeout(r,30));assert.equal(teammate.read('TAN10101').snapshot.revision,1);assert.equal(teammate.read('TAN10101').source,'remote');
  readerB.stop();teammate.clear();assert.equal(teammate.read('TAN10101').snapshot,null);sync.stop();
});
