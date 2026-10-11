import fs from 'node:fs';
import assert from 'node:assert/strict';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/cora-mes-egress-runtime-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const gate=readiness?.gates?.cora_external_data_policy;

assert.equal(readiness.schema,'central-production-readiness-v1');
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
assert.ok(gate,'missing cora_external_data_policy gate');
assert.notEqual(gate.status,'green');
assert.ok(Array.isArray(gate.green));
assert.ok(Array.isArray(gate.evidence));
assert.ok(Array.isArray(gate.remaining));
assert.equal(evidence.schema,'central-cora-mes-egress-runtime-evidence-v1');
assert.equal(evidence.promotion.cora_external_data_policy_fully_green,false);

for(const item of [
  'all known CORA /api routes have an explicit fail-closed client egress classification; unknown routes and methods are blocked by contract',
  'failure-analysis external eligibility requires an explicitly sanitized structured technical payload',
  'MES external projection removes PCBA SN, Material SN, operator, raw 2114/3074/3022 history, evidence refs and occurrence identifiers',
  'MES external projection preserves exact CPH identity and absence semantics',
  'runtime CORA payload builders replace only centralData.mes with the sanitized MES projection while retaining the full MES context locally',
  'CORA egress policy, route transport and MES projection modules are available in the offline shell',
  'runtime MES egress boundary passed Static Quality and Firestore Rules/cross-PC E2E'
]) if(!gate.green.includes(item))gate.green.push(item);

for(const item of [
  'core/cora-egress-transport.mjs',
  'ames/data/cora-external.mjs',
  'scripts/ames-cora-egress-transport.test.mjs',
  'scripts/ames-cora-external-projection.test.mjs',
  'scripts/ames-cora-mes-egress-app.test.mjs',
  'hardening/cora-mes-egress-runtime-evidence.json'
]) if(!gate.evidence.includes(item))gate.evidence.push(item);

gate.status='partial_runtime_enforcement';
gate.remaining=[
  'define route-specific local-only or sanitized external projections for free-form context, conversation, images, audio, documents, memory and audit metadata without weakening required CORA features',
  'apply the route/payload guard to every actual external CORA request builder only after each route has an approved projection or an explicit local-only path',
  'keep the backend version/health compatibility work separate and blocked until the authoritative CORA backend scope is accessible'
];
gate.full_ci_runs=[...new Set([...(gate.full_ci_runs||[]),38157245123,38157402697,38157683195])];

evidence.status='green_mes_boundary_full_ci_routes_pending';
evidence.full_ci={
  run_id:38157683195,
  static_quality:'success',
  firestore_rules_cross_pc_e2e:'success',
  published_preview_smoke:'skipped_on_push'
};
evidence.promotion.cora_external_data_policy_fully_green=false;
evidence.scope_limit='The real runtime MES block is sanitized before known external CORA payload construction. Full CORA egress enforcement remains pending for free-form conversation, images, audio, documents, memory, audit metadata and other local-only content.';

assert.equal(gate.status,'partial_runtime_enforcement');
assert.ok(gate.remaining.length>0);
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
assert.equal(evidence.promotion.cora_external_data_policy_fully_green,false);

fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log('PASS CORA MES egress readiness reconciled without promotion');
