import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTOR_LEASE_SCHEMA,COLLECTOR_LEASE_TTL_MS,COLLECTOR_LEASE_MAX_TTL_MS,
  validateCollectorIdentity,validateLeaseLine,validateLeaseTtl,leasePath,classifyLease,
  fencingToken,isStaleFence,leaseContract
} from '../ames/data/collector-authority.mjs';

const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const lease=(overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:'TAN10101',owner_uid:'A',workstation_id:wsA,generation:4,expires_at_ms:20_000,...overrides});

test('collector identity and line are explicit and exact',()=>{
  assert.equal(validateCollectorIdentity(wsA.toUpperCase()),wsA);
  assert.equal(validateLeaseLine('tan10102'),'TAN10102');
  assert.deepEqual(leasePath('TAN10103'),['amesLineLeases','TAN10103']);
  assert.throws(()=>validateCollectorIdentity('not-a-workstation'),/workstation_id/);
  assert.throws(()=>validateLeaseLine('Linha 2'),/Linha MES/);
});

test('TTL is bounded and cannot become an effectively permanent lease',()=>{
  assert.equal(validateLeaseTtl(),COLLECTOR_LEASE_TTL_MS);
  assert.equal(validateLeaseTtl(60_000),60_000);
  assert.equal(validateLeaseTtl(COLLECTOR_LEASE_MAX_TTL_MS),COLLECTOR_LEASE_MAX_TTL_MS);
  assert.throws(()=>validateLeaseTtl(59_999),/TTL/);
  assert.throws(()=>validateLeaseTtl(COLLECTOR_LEASE_MAX_TTL_MS+1),/TTL/);
});

test('vacant line acquires generation one and same collector renews without changing generation',()=>{
  assert.deepEqual(classifyLease(null,{uid:'A',workstationId:wsA,nowMs:10_000}),{action:'acquire',generation:1,reason:'vacant'});
  assert.deepEqual(classifyLease(lease(),{uid:'A',workstationId:wsA,nowMs:10_000}),{action:'renew',generation:4,reason:'same_collector'});
});

test('other collector is blocked before expiry and can take over only after expiry with incremented generation',()=>{
  const blocked=classifyLease(lease(),{uid:'B',workstationId:wsB,nowMs:19_999});
  assert.equal(blocked.action,'blocked');
  assert.equal(blocked.generation,4);
  assert.equal(blocked.holder.workstation_id,wsA);
  const takeover=classifyLease(lease(),{uid:'B',workstationId:wsB,nowMs:20_000});
  assert.deepEqual(takeover,{action:'takeover',generation:5,reason:'expired'});
});

test('same collector after expiry also reacquires through new generation instead of reviving stale fence',()=>{
  assert.deepEqual(classifyLease(lease(),{uid:'A',workstationId:wsA,nowMs:20_001}),{action:'takeover',generation:5,reason:'expired'});
});

test('fencing token binds exact line generation and workstation',()=>{
  assert.equal(fencingToken({line:'TAN10101',generation:7,workstationId:wsA}),`TAN10101:7:${wsA}`);
  const current={line_id:'TAN10101',generation:7,workstation_id:wsA};
  assert.equal(isStaleFence({...current},current),false);
  assert.equal(isStaleFence({...current,generation:6},current),true);
  assert.equal(isStaleFence({...current,workstation_id:wsB},current),true);
  assert.throws(()=>fencingToken({line:'TAN10101',generation:0,workstationId:wsA}),/Geração/);
});

test('contract is explicit groundwork and does not pretend MES heads are fenced already',()=>{
  const contract=leaseContract();
  assert.equal(contract.schema,COLLECTOR_LEASE_SCHEMA);
  assert.equal(contract.authority,'firestore_transaction_and_rules');
  assert.equal(contract.activation,'contract_only_not_enforced_on_mes_heads');
  assert.match(contract.semantics.fencing,/later require/);
});
