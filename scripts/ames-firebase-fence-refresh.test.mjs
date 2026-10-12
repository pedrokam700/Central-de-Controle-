import test from 'node:test';
import assert from 'node:assert/strict';
import {firestoreTransport} from '../ames/firebase-sync.mjs';

const line='TAN10101',uid='A',wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const key=n=>String(n).repeat(64);
const fence=(generation,workstation_id=wsA)=>({schema:'central-mes-publication-fence-v1',line_id:line,owner_uid:uid,workstation_id,generation,fence:`${line}:${generation}:${workstation_id}`});
const head=(overrides={})=>({schema:'central-ames-v2',owner_uid:uid,line_id:line,source_id:'source',snapshot_id:'1',snapshot_num:1,snapshot_revision:1,key:key('a'),hash:key('f'),parts:1,collected_at:'2026-10-09T10:00:00Z',...overrides});
const snapshot=value=>({exists:()=>value!==undefined,data:()=>structuredClone(value)});

function rig(){
  const docs=new Map(),writes=[];
  const path=(...parts)=>parts.join('/');
  const transport=firestoreTransport({
    db:{},auth:{currentUser:{uid}},
    doc(_db,...parts){return path(...parts);},collection(){},
    async getDoc(ref){return snapshot(docs.get(ref));},
    async setDoc(ref,value){docs.set(ref,structuredClone(value));},
    onSnapshot(){return()=>{};},
    async runTransaction(_db,callback){
      const staged=[];
      const tx={
        async get(ref){return snapshot(docs.get(ref));},
        set(ref,value){staged.push([ref,structuredClone(value)]);writes.push([ref,structuredClone(value)]);}
      };
      const out=await callback(tx);
      for(const [ref,value] of staged)docs.set(ref,value);
      return out;
    }
  });
  return {transport,docs,writes,owner:path('amesUsers',uid,'lines',line),team:path('amesTeamLines',line)};
}

test('same-content fence metadata refresh advances unfenced -> gen4 -> gen5 on owner and team heads',async()=>{
  const h=rig(),base=head();
  await h.transport.commitHead(uid,base);
  assert.equal(h.docs.get(h.owner).collector_fence,undefined);
  const g4=head({key:key('b'),collector_fence:fence(4)});
  await h.transport.commitHead(uid,g4);
  assert.equal(h.docs.get(h.owner).collector_fence.generation,4);assert.equal(h.docs.get(h.team).collector_fence.generation,4);
  const g5=head({key:key('c'),collector_fence:fence(5,wsB)});
  await h.transport.commitHead(uid,g5);
  assert.equal(h.docs.get(h.owner).collector_fence.generation,5);assert.equal(h.docs.get(h.owner).collector_fence.workstation_id,wsB);
  assert.equal(h.docs.get(h.team).collector_fence.generation,5);
});

test('older same-content fence generation is ignored instead of downgrading or poisoning queue',async()=>{
  const h=rig(),g5=head({key:key('c'),collector_fence:fence(5,wsB)});h.docs.set(h.owner,g5);h.docs.set(h.team,g5);
  const beforeWrites=h.writes.length;
  await h.transport.commitHead(uid,head({key:key('b'),collector_fence:fence(4)}));
  assert.equal(h.docs.get(h.owner).collector_fence.generation,5);assert.equal(h.docs.get(h.team).collector_fence.generation,5);
  assert.equal(h.writes.length,beforeWrites);
});

test('same revision refuses changed content and same-generation divergent metadata key',async()=>{
  const h=rig(),g5=head({key:key('c'),collector_fence:fence(5)});h.docs.set(h.owner,g5);h.docs.set(h.team,g5);
  await assert.rejects(()=>h.transport.commitHead(uid,head({key:key('d'),hash:key('e'),collector_fence:fence(6)})),/Conflito de conteúdo/);
  await assert.rejects(()=>h.transport.commitHead(uid,head({key:key('e'),collector_fence:fence(5)})),/Conflito de metadado/);
  assert.equal(h.docs.get(h.owner).key,key('c'));
});

test('idempotent same key remains a no-op',async()=>{
  const h=rig(),g4=head({key:key('b'),collector_fence:fence(4)});h.docs.set(h.owner,g4);h.docs.set(h.team,g4);
  await h.transport.commitHead(uid,structuredClone(g4));
  assert.equal(h.writes.length,1); // team idempotent set only; owner remains untouched
  assert.equal(h.writes[0][0],h.team);
});

test('newer snapshot remains accepted even with lower fence because stale-publisher enforcement is intentionally not active yet',async()=>{
  const h=rig(),g5=head({key:key('c'),collector_fence:fence(5)});h.docs.set(h.owner,g5);h.docs.set(h.team,g5);
  const newer=head({snapshot_id:'2',snapshot_num:2,key:key('d'),hash:key('e'),collected_at:'2026-10-09T10:05:00Z',collector_fence:fence(4)});
  await h.transport.commitHead(uid,newer);
  assert.equal(h.docs.get(h.owner).snapshot_num,2);assert.equal(h.docs.get(h.owner).collector_fence.generation,4);
  assert.equal(h.docs.get(h.team).snapshot_num,2);
});
