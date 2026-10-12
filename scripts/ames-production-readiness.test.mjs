import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const readiness=json('hardening/production-readiness.json');
const release=json('ames/releases/latest/release.json');

const promotionBlockers=['admission_rbac','cora_backend_version_contract','published_preview_smoke','r12_engine_consolidation'];

test('production readiness can never silently promote the current candidate',()=>{
  assert.equal(readiness.schema,'central-production-readiness-v1');
  assert.equal(readiness.physical_candidate.sha,'5e45127d3b61b37968a4c2b05596919670b307cb');
  assert.equal(readiness.physical_candidate.frozen,true);
  assert.equal(readiness.physical_candidate.factory_9_of_9,'pending');
  assert.equal(readiness.promotion.stable_allowed,false);
  assert.equal(readiness.promotion.main_merge_allowed,false);
  assert.equal(readiness.promotion.production_rules_publish_allowed,false);
  assert.equal(release.package_available,false);
  assert.notEqual(release.candidate_status,'stable');
});

test('known promotion blockers remain explicit until evidence changes them',()=>{
  for(const key of promotionBlockers){
    const gate=readiness.gates[key];
    assert.ok(gate,`missing readiness gate ${key}`);
    assert.notEqual(gate.status,'green',`${key} cannot be GREEN without new evidence`);
  }
  assert.equal(readiness.gates.r12_engine_consolidation.status,'factory_gate_pending');
  assert.equal(readiness.gates.mes_rules_authority.status,'green_code_not_published');
});

test('completed hardening claims point at evidence that exists in the repository',()=>{
  const gates=readiness.gates;
  for(const [key,gate] of Object.entries(gates)){
    for(const evidence of gate.evidence||[]){
      assert.ok(fs.existsSync(evidence),`${key} references missing evidence: ${evidence}`);
    }
  }
  for(const required of ['transactional_snapshots','local_agent_pairing','legacy_browser_password_authority','sqlite_migrations','operational_calendar_semantics','release_identity','typed_cloud_allowlist','support_diagnostics']){
    assert.equal(gates[required].status,'green',`${required} should remain GREEN only while its evidence is present`);
  }
});

test('partial gates explain what remains instead of being treated as done',()=>{
  for(const [key,gate] of Object.entries(readiness.gates)){
    if(['partial','pending','blocked','factory_gate_pending'].includes(gate.status)||String(gate.status).includes('partial')||String(gate.status).includes('pending')){
      assert.ok(Array.isArray(gate.remaining)&&gate.remaining.length>0,`${key} needs an explicit remaining list`);
    }
  }
  assert.equal(readiness.gates.offline_outbox_uid_idempotency.status,'green');
  assert.equal(readiness.gates.offline_outbox_uid_idempotency.full_ci_run,38153144329);
  assert.match(readiness.gates.disaster_recovery.remaining.join(' '),/off-machine/i);
  assert.match(readiness.gates.multi_collector_authority.remaining.join(' '),/lease/i);
});
