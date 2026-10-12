import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineOutbox} from '../core/offline-outbox.mjs';
import {offlineWritePlan,routineFailureLinkEffect,normalizeOfflineEffects} from '../core/offline-domain-write.mjs';

function memoryStorage(){
  const rows=new Map();
  return {
    async put(item){rows.set(item.id,structuredClone(item));},
    async list(){return [...rows.values()].map(value=>structuredClone(value));},
    async remove(id){rows.delete(id);},
    async legacyCount(){return 0;},
    rows
  };
}

function failurePayload(){
  return {
    id:'F-2026-001',
    issue:'Falha de rotina',
    originType:'routineExecution',
    originRoutineExecutionId:'2026-10-11::routine-1::TAN10101',
    createdAt:'2026-10-11T15:00:00.000Z'
  };
}

test('efeito de rotina é vinculado exatamente ao ID de negócio e executionKey da falha',()=>{
  const payload=failurePayload();
  const item={collection:'operationalFailures',documentId:'offline-op-1',payload};
  const effects=normalizeOfflineEffects([
    routineFailureLinkEffect({executionKey:payload.originRoutineExecutionId,failureId:payload.id,linkedAt:payload.createdAt})
  ],item);
  assert.deepEqual(effects,[{
    type:'routine_failure_link',
    executionKey:payload.originRoutineExecutionId,
    failureId:payload.id,
    linkedAt:payload.createdAt
  }]);
});

test('plano composto mantém documento determinístico e vínculo idempotente por array union',()=>{
  const payload=failurePayload();
  const item={
    collection:'operationalFailures',documentId:'offline-op-1',payload,
    effects:[routineFailureLinkEffect({executionKey:payload.originRoutineExecutionId,failureId:payload.id,linkedAt:payload.createdAt})]
  };
  const plan=offlineWritePlan(item);
  assert.equal(plan.length,2);
  assert.deepEqual(plan[0],{
    kind:'set_document',collection:'operationalFailures',documentId:'offline-op-1',payload,merge:false
  });
  assert.deepEqual(plan[1],{
    kind:'routine_failure_link',collection:'routineExecutions',documentId:payload.originRoutineExecutionId,
    field:'linkedFailureIds',value:payload.id,updatedAt:payload.createdAt,merge:true
  });
});

test('efeito não pode apontar para outra falha, outra rotina ou coleção report',()=>{
  const payload=failurePayload();
  assert.throws(()=>normalizeOfflineEffects([
    routineFailureLinkEffect({executionKey:payload.originRoutineExecutionId,failureId:'F-OUTRA',linkedAt:payload.createdAt})
  ],{collection:'operationalFailures',documentId:'x',payload}),/failureId/);
  assert.throws(()=>normalizeOfflineEffects([
    routineFailureLinkEffect({executionKey:'outra-execucao',failureId:payload.id,linkedAt:payload.createdAt})
  ],{collection:'operationalFailures',documentId:'x',payload}),/executionKey/);
  assert.throws(()=>normalizeOfflineEffects([
    routineFailureLinkEffect({executionKey:payload.originRoutineExecutionId,failureId:payload.id,linkedAt:payload.createdAt})
  ],{collection:'reports',documentId:'x',payload}),/falha operacional/);
});

test('outbox persiste efeito composto e só ACKa depois de writer confirmar operação inteira',async()=>{
  const storage=memoryStorage();
  const outbox=createOfflineOutbox({storage,uuid:()=> 'compound-op',now:()=>100});
  const payload=failurePayload();
  const effect=routineFailureLinkEffect({executionKey:payload.originRoutineExecutionId,failureId:payload.id,linkedAt:payload.createdAt});
  const queued=await outbox.enqueue({uid:'u1',collection:'operationalFailures',payload,effects:[effect]});
  assert.equal(queued.documentId,'offline-compound-op');
  assert.deepEqual(queued.effects,[effect]);

  let attempts=0;
  const failed=await outbox.replay({uid:'u1',write:async item=>{
    attempts++;
    const plan=offlineWritePlan(item);
    assert.equal(plan.length,2);
    throw new Error('batch não confirmado');
  }});
  assert.equal(failed.synced,0);assert.equal(failed.failed,1);assert.equal(failed.remaining,1);
  assert.equal((await outbox.pending('u1'))[0].attempts,1);

  const committed=[];
  const ok=await outbox.replay({uid:'u1',write:async item=>{
    attempts++;
    committed.push(...offlineWritePlan(item));
  }});
  assert.equal(ok.synced,1);assert.equal(ok.remaining,0);assert.equal(attempts,2);
  assert.deepEqual(await outbox.pending('u1'),[]);
  assert.equal(committed[0].documentId,'offline-compound-op');
  assert.equal(committed[1].value,payload.id);
});

test('itens antigos sem effects continuam produzindo plano de uma única escrita',async()=>{
  const storage=memoryStorage();
  const outbox=createOfflineOutbox({storage,uuid:()=> 'legacy-v2'});
  const queued=await outbox.enqueue({uid:'u1',collection:'reports',payload:{id:'R1'}});
  assert.equal('effects' in queued,false);
  assert.deepEqual(offlineWritePlan(queued),[{
    kind:'set_document',collection:'reports',documentId:'offline-legacy-v2',payload:{id:'R1'},merge:false
  }]);
});
