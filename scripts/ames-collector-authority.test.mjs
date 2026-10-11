import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTOR_LEASE_SCHEMA,COLLECTOR_LEASE_TTL_MS,
  validateCollectorIdentity,validateLeaseLine,leasePath,leaseExpiryMs,classifyLease,
  fencingToken,isStaleFence,leaseContract
} from '../ames/data/collector-authority.mjs';

const wsA='ws_'+'a'.repeat(32),wsB='ws_'+'b'.repeat(32);
const lease=(overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:'TAN10101',owner_uid:'A',workstation_id:wsA,generation:4,renewed_at_ms:10_000,...overrides});
const EXPIRES=10_000+COLLECTOR_LEASE_TTL_MS;

test('collector identity and line are explicit and exact',()=>{
  assert.equal(validateCollectorIdentity(wsA.toUpperCase()),wsA);
  assert.equal(validateLeaseLine('tan10102'),'TAN10102');
  assert.deepEqual(leasePath('TAN10103'),['amesLineLeases','TAN10103']);
  assert.throws(()=>validateCollectorIdentity('not-a-workstation'),/workstation_id/);
  assert.throws(()=>validateLeaseLine('Linha 2'),/Linha MES/);
});

test('lease expiry is derived from renewed_at plus fixed TTL, never from a client-proposed expiry',()=>{
  assert.equal(leaseExpiryMs(lease()),EXPIRES);
  assert.throws(()=>leaseExpiryMs({...lease(),renewed_at_ms:'not-a-clock'}),/renewed_at/);
});

test('vacant line acquires generation one and same collector renews without changing generation',()=>{
  assert.deepEqual(classifyLease(null,{uid:'A',workstationId:wsA,nowMs:10_000}),{action:'acquire',generation:1,reason:'vacant'});
  assert.deepEqual(classifyLease(lease(),{uid:'A',workstationId:wsA,nowMs:20_000}),{action:'renew',generation:4,reason:'same_collector',expires_at_ms:EXPIRES});
});

test('other collector is blocked before server-derived expiry and can take over only after expiry',()=>{
  const blocked=classifyLease(lease(),{uid:'B',workstationId:wsB,nowMs:EXPIRES-1});
  assert.equal(blocked.action,'blocked');
  assert.equal(blocked.generation,4);
  assert.equal(blocked.holder.workstation_id,wsA);
  assert.equal(blocked.holder.expires_at_ms,EXPIRES);
  const takeover=classifyLease(lease(),{uid:'B',workstationId:wsB,nowMs:EXPIRES});
  assert.deepEqual(takeover,{action:'takeover',generation:5,reason:'expired',expired_at_ms:EXPIRES});
});

test('same collector after expiry gets new generation instead of reviving a stale fence',()=>{
  assert.deepEqual(classifyLease(lease(),{uid:'A',workstationId:wsA,nowMs:EXPIRES+1}),{action:'takeover',generation:5,reason:'expired',expired_at_ms:EXPIRES});
});

test('fencing token binds exact line generation and workstation',()=>{
  assert.equal(fencingToken({line:'TAN10101',generation:7,workstationId:wsA}),`TAN10101:7:${wsA}`);
  const current={line_id:'TAN10101',generation:7,workstation_id:wsA};
  assert.equal(isStaleFence({...current},current),false);
  assert.equal(isStaleFence({...current,generation:6},current),true);
  assert.equal(isStaleFence({...current,workstation_id:wsB},current),true);
  assert.throws(()=>fencingToken({line:'TAN10101',generation:0,workstationId:wsA}),/Geração/);
});

test('contract states server-time authority and does not pretend MES heads are fenced already',()=>{
  const contract=leaseContract();
  assert.equal(contract.schema,COLLECTOR_LEASE_SCHEMA);
  assert.equal(contract.authority,'firestore_request_time_plus_fixed_ttl');
  assert.equal(contract.activation,'contract_only_not_enforced_on_mes_heads');
  assert.match(contract.semantics.expiry,/server/);
  assert.match(contract.semantics.fencing,/later require/);
});
