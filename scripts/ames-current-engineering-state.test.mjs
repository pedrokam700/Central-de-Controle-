import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEngineeringState} from './current-engineering-state.mjs';

const sha='9'.repeat(40);

test('engineering state is derived from release/readiness contracts',()=>{
  const state=buildEngineeringState({headSha:sha});
  assert.equal(state.schema,'central-engineering-state-v1');
  assert.equal(state.head_sha,sha);
  assert.equal(state.central.version,'2.0.0-preview');
  assert.equal(state.agent.candidate_version,'0.5.25-rc1');
  assert.equal(state.physical_candidate.sha,'5e45127d3b61b37968a4c2b05596919670b307cb');
  assert.equal(state.physical_candidate.frozen,true);
  assert.equal(state.cora.status,'frontend_contract_only_backend_identity_pending');
  assert.ok(state.cora.route_count>0);
});

test('derived state stays fail-closed for promotion',()=>{
  const state=buildEngineeringState({headSha:sha});
  assert.equal(state.promotion.stable_allowed,false);
  assert.equal(state.promotion.main_merge_allowed,false);
  assert.equal(state.promotion.production_rules_publish_allowed,false);
  assert.equal(state.invariants.stable_allowed,false);
  assert.equal(state.invariants.factory_gate_required,true);
  const blockerIds=new Set(state.hardening.blockers.map(row=>row.id));
  for(const expected of ['admission_rbac','cora_backend_version_contract','published_preview_smoke','multi_collector_authority','r12_engine_consolidation']){
    assert.ok(blockerIds.has(expected),`missing known blocker ${expected}`);
  }
});

test('green/blocker counts cover every readiness gate exactly once',()=>{
  const state=buildEngineeringState({headSha:sha});
  assert.equal(state.hardening.green_count+state.hardening.blockers.length,state.hardening.gate_count);
  const green=new Set(state.hardening.green);
  const blockers=new Set(state.hardening.blockers.map(row=>row.id));
  for(const id of green)assert.equal(blockers.has(id),false,`${id} cannot be green and blocker simultaneously`);
});
