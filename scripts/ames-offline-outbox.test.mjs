import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOfflineOutbox,OFFLINE_OUTBOX_SCHEMA} from '../core/offline-outbox.mjs';

function memoryStorage({legacy=0}={}){
  const rows=new Map();
  return {
    async put(item){rows.set(item.id,structuredClone(item));},
    async list(){return [...rows.values()].map(value=>structuredClone(value));},
    async remove(id){rows.delete(id);},
    async legacyCount(){return legacy;},
    rows
  };
}

test('novas gravações exigem UID e usam documento determinístico no retry',async()=>{
  const storage=memoryStorage();let seq=0;
  const outbox=createOfflineOutbox({storage,now:()=>1234,uuid:()=>`op-${++seq}`});
  await assert.rejects(()=>outbox.enqueue({collection:'reports',payload:{id:'F1'}}),/Sessão obrigatória/);
  const item=await outbox.enqueue({uid:'user-a',collection:'reports',payload:{id:'F1'}});
  assert.equal(item.schema,OFFLINE_OUTBOX_SCHEMA);
  assert.equal(item.uid,'user-a');
  assert.equal(item.operationId,'op-1');
  assert.equal(item.documentId,'offline-op-1');
  assert.equal(item.id,'user-a:reports:offline-op-1');
  assert.deepEqual((await outbox.pending('user-a')).map(x=>x.id),[item.id]);
  assert.deepEqual(await outbox.pending('user-b'),[]);
});

test('replay usa somente fila do UID, ACK após write e não duplica retry',async()=>{
  const storage=memoryStorage();let seq=0;
  const outbox=createOfflineOutbox({storage,uuid:()=>`r-${++seq}`,now:()=>seq});
  const a=await outbox.enqueue({uid:'a',collection:'reports',payload:{value:'A'}});
  const b=await outbox.enqueue({uid:'b',collection:'operationalFailures',payload:{value:'B'}});
  const writes=[];
  const result=await outbox.replay({uid:'a',write:async item=>writes.push([item.collection,item.documentId,item.payload.value])});
  assert.equal(result.synced,1);assert.equal(result.remaining,0);
  assert.deepEqual(writes,[['reports',a.documentId,'A']]);
  assert.equal((await outbox.pending('b'))[0].id,b.id);
  const second=await outbox.replay({uid:'a',write:async item=>writes.push(item)});
  assert.equal(second.synced,0);assert.equal(writes.length,1);
});

test('falha mantém item pendente e contador de tentativas para retry idempotente',async()=>{
  const storage=memoryStorage();const outbox=createOfflineOutbox({storage,uuid:()=> 'stable'});
  const item=await outbox.enqueue({uid:'u',collection:'reports',payload:{x:1}});
  const failed=await outbox.replay({uid:'u',write:async()=>{throw new Error('offline');}});
  assert.equal(failed.synced,0);assert.equal(failed.failed,1);assert.equal(failed.remaining,1);
  const pending=(await outbox.pending('u'))[0];assert.equal(pending.documentId,item.documentId);assert.equal(pending.attempts,1);assert.match(pending.lastError,/offline/);
  const ids=[];const ok=await outbox.replay({uid:'u',write:async row=>ids.push(row.documentId)});
  assert.equal(ok.synced,1);assert.deepEqual(ids,[item.documentId]);assert.deepEqual(await outbox.pending('u'),[]);
});

test('troca de sessão depois do write não ACKa item e retry conserva o mesmo documentId',async()=>{
  const storage=memoryStorage();const outbox=createOfflineOutbox({storage,uuid:()=> 'session-op'});
  const item=await outbox.enqueue({uid:'a',collection:'reports',payload:{x:1}});
  let current=true,writes=0;
  const first=await outbox.replay({uid:'a',sessionIsCurrent:()=>current,write:async row=>{writes++;assert.equal(row.documentId,item.documentId);current=false;}});
  assert.equal(first.stopped,true);assert.equal(first.synced,0);assert.equal((await outbox.pending('a')).length,1);
  current=true;
  const second=await outbox.replay({uid:'a',sessionIsCurrent:()=>current,write:async row=>{writes++;assert.equal(row.documentId,item.documentId);}});
  assert.equal(second.synced,1);assert.equal(writes,2);
});

test('legacy sem UID fica em quarentena e nunca entra no replay',async()=>{
  const storage=memoryStorage({legacy:3});const outbox=createOfflineOutbox({storage,uuid:()=> 'new'});
  await outbox.enqueue({uid:'a',collection:'reports',payload:{x:1}});
  const writes=[];const result=await outbox.replay({uid:'a',write:async row=>writes.push(row)});
  assert.equal(writes.length,1);assert.equal(result.legacy_quarantined,3);assert.equal(await outbox.legacyPendingCount(),3);
});

test('replay concorrente do mesmo UID compartilha uma única execução',async()=>{
  const storage=memoryStorage();const outbox=createOfflineOutbox({storage,uuid:()=> 'lock'});
  await outbox.enqueue({uid:'a',collection:'reports',payload:{x:1}});
  let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
  const writer=async()=>{calls++;await gate;};
  const one=outbox.replay({uid:'a',write:writer});const two=outbox.replay({uid:'a',write:writer});
  assert.equal(one,two);release();
  const [a,b]=await Promise.all([one,two]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.synced,1);
});

test('Central usa H2 no source, no build e no cache offline',()=>{
  const app=fs.readFileSync('app.js','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  const build=fs.readFileSync('scripts/build-static.mjs','utf8');
  const module=fs.readFileSync('core/offline-outbox.mjs','utf8');
  assert.match(app,/\.\/core\/offline-outbox\.mjs/);
  assert.match(app,/offlineOutbox\.replay\(\{uid,write,sessionIsCurrent\}\)/);
  assert.match(app,/setDoc\(doc\(db,item\.collection,item\.documentId\),item\.payload\)/);
  assert.match(app,/report\.docId=queued\.documentId/);
  assert.match(app,/item\.docId=queued\.documentId/);
  assert.match(app,/legacyPendingCount/);
  assert.doesNotMatch(app,/const OFFLINE_DB_NAME='central-trabalho-offline'/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,item\.collection\),item\.payload\)/);
  assert.doesNotMatch(app,/arr\.slice\(-50\)/);
  assert.match(sw,/core\/offline-outbox\.mjs/);
  assert.match(build,/collect\('core'\)/);
  assert.match(module,/const DB_VERSION=2/);
  assert.match(module,/LEGACY_STORE='queue'/);
  assert.match(module,/item\.uid!==uid/);
});
