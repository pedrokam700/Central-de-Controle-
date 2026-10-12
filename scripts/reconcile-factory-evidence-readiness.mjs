import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='hardening/production-readiness.json';
const r=JSON.parse(fs.readFileSync(path,'utf8'));
assert.equal(r.schema,'central-production-readiness-v1');
assert.equal(r.physical_candidate?.sha,'5e45127d3b61b37968a4c2b05596919670b307cb');
assert.equal(r.physical_candidate?.factory_9_of_9,'pending');
assert.equal(r.promotion?.stable_allowed,false);
assert.equal(r.promotion?.main_merge_allowed,false);
assert.equal(r.promotion?.production_rules_publish_allowed,false);

const gate=r.gates?.r12_engine_consolidation;
assert.ok(gate,'missing r12_engine_consolidation gate');
assert.equal(gate.status,'factory_gate_pending');
const requiredRemaining=['capture real R12','compare behavior','9/9','then remove process_r11 compatibility bridge'];
for(const item of requiredRemaining) assert.ok((gate.remaining||[]).includes(item),`required factory blocker missing: ${item}`);

gate.green=[...new Set([...(gate.green||[]),
  'sanitized factory validation evidence schema fixes the frozen physical candidate plus exact hardening SHA without collecting raw MES identifiers',
  'factory evidence manifest fixes all 9 canonical views and Gates A-I and fails closed on unknown/sensitive-shaped fields',
  'R12 capture evidence records only sanitized ZIP SHA-256 and file count',
  'all-pass manifest yields ready_for_promotion_review only and never automatic GREEN/promotion',
  'factory evidence validator ships as support tooling in the existing-install R12 bundle without entering agent runtime or changing launcher defaults',
  'factory evidence tooling passed Static Quality and Firestore Rules/cross-PC E2E'
])];
gate.evidence=[...new Set([...(gate.evidence||[]),
  'tools/ames-workstation/factory-validation-evidence.py',
  'scripts/ames-factory-validation-evidence.test.mjs',
  'scripts/agent-r12-bundle-v5.test.py',
  'docs/ames/FACTORY_GATE_R12.md',
  'hardening/factory-validation-evidence-tooling-evidence.json'
])];
gate.full_ci_runs=[...new Set([...(gate.full_ci_runs||[]),38247474565])];

assert.equal(gate.status,'factory_gate_pending');
for(const item of requiredRemaining) assert.ok(gate.remaining.includes(item));
assert.equal(r.physical_candidate.factory_9_of_9,'pending');
assert.equal(r.promotion.stable_allowed,false);
assert.equal(r.promotion.main_merge_allowed,false);
assert.equal(r.promotion.production_rules_publish_allowed,false);
fs.writeFileSync(path,JSON.stringify(r,null,2)+'\n');
console.log('factory evidence readiness reconciled without promotion');
