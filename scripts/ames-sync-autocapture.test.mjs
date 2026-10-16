import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {DATASETS} from '../ames/data/canonical.mjs';
import {createMesSync} from '../ames/sync.mjs';

function fixture(line='TAN10103'){
  const p={schema:'central-ames-v2',schema_version:2,source_id:'factory-pc',snapshot_id:'25',snapshot_revision:1,content_hash:'fixture-hash',line_id:line,collected_at:'2026-10-16T20:00:00Z',source_view:'3028',summary:{line,snapshot_id:'25',collected_at:'2026-10-16T20:00:00Z',defect_rows:1},datasets:Object.fromEntries(DATASETS.map(n=>[n,[]])),coverage:{},capabilities:{process_timeline:true}};
  const common={line,line_id:line,snapshot_id:'25',snapshot_revision:1,pcba_sn:'P1',product:'CPH2819BR',raw_ref:'sqlite:record',provenance:{contexts:[{line_id:line,pcba_sn:'P1',product:'CPH2819BR'}],line_candidates:[line]}};
  p.datasets.defects=[{...common,record_id:'D1',occurrence_id:'O1',product_model:'CPH2819BR',defect_code:'GN01-TX01',defect_time:p.collected_at}];
  for(const name of DATASETS)p.coverage[name]={stored_total:p.datasets[name].length,transport_complete:true,source_complete:false,status:'partial'};
  return p;
}

const waitFor=async(predicate,timeout=1000)=>{
  const end=Date.now()+timeout;
  while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,10));}
  assert.fail('condition not reached');
};

test('local snapshot changes publish automatically and a remote-only teammate reads the team head',async()=>{
  const pending=new Map(),parts=new Map(),heads=new Map(),watchers=new Set();
  const queue={put:async e=>pending.set(e.id,e),list:async uid=>[...pending.values()].filter(e=>e.uid===uid),remove:async id=>pending.delete(id)};
  const notify=()=>{for(const cb of watchers)cb([...heads.values()]);};
  const remote={
    putPart:async(u,h,i,data)=>parts.set(u+h.key+i,data),
    commitHead:async(_u,h)=>{heads.set(h.line_id,h);notify();},
    getPart:async(owner,h,i)=>parts.get(owner+h.key+i),
    watch:(_u,cb)=>{watchers.add(cb);queueMicrotask(()=>cb([...heads.values()]));return ()=>watchers.delete(cb);}
  };

  const factory=createAmesStore();
  const writer=createMesSync(factory,remote,{queue,online:()=>true});
  writer.start('factory-user');
  factory.replaceLocalSnapshots([fixture()]);
  factory.setLocalConnected(true);
  await waitFor(()=>heads.has('TAN10103'));
  assert.equal(pending.size,0);

  const home=createAmesStore();
  const reader=createMesSync(home,remote,{queue,online:()=>false});
  reader.start('home-user');
  await waitFor(()=>home.read('TAN10103').snapshot?.snapshot_id==='25');
  assert.equal(home.read('TAN10103').source,'remote');
  assert.equal(home.read('TAN10103').snapshot.occurrences[0].defect_code,'GN01-TX01');
  assert.equal(home.agent().sync.read_status,'ready');
  writer.stop();reader.stop();
});
