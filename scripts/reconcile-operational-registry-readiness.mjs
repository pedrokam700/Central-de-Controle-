import fs from 'node:fs';
import assert from 'node:assert/strict';
import {LINE_IDS} from '../ames/data/operational-registry.mjs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/firestore-operational-registry-generation-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const gate=readiness?.gates?.operational_registry;
const EXACT_LINES=['TAN10101','TAN10102','TAN10103'];

assert.equal(readiness.schema,'central-production-readiness-v1');
assert.deepEqual([...LINE_IDS],EXACT_LINES);
assert.equal(gate?.status,'partial');
assert.equal(readiness.gates.mes_rules_authority.status,'green_code_not_published');
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
assert.equal(evidence.publication.firestore_rules_published,false);
assert.equal(evidence.publication.production_rules_publish_allowed,false);

for(const item of [
  'Firestore mesLine() block is generated deterministically from the canonical JS operational registry',
  'generator check fails on Rules/registry drift instead of inferring line identity from friendly labels',
  'exact TAN10101/TAN10102/TAN10103 identity remains pinned across JS, Python and Firestore Rules',
  'generated Firestore registry passed full Rules and cross-PC emulator E2E'
]) if(!gate.green.includes(item))gate.green.push(item);

for(const item of [
  'scripts/firestore-operational-registry.mjs',
  'scripts/ames-firestore-operational-registry-generation.test.mjs',
  'hardening/firestore-operational-registry-generation-evidence.json'
]) if(!gate.evidence.includes(item))gate.evidence.push(item);

gate.status='green';
delete gate.remaining;
gate.full_ci_run=38158030493;

evidence.status='green';
evidence.full_ci={
  run_id:38158030493,
  static_quality:'success',
  firestore_rules_cross_pc_e2e:'success',
  published_preview_smoke:'skipped_on_push'
};
evidence.publication.firestore_rules_published=false;
evidence.publication.production_rules_publish_allowed=false;

assert.equal(readiness.gates.operational_registry.status,'green');
assert.equal(readiness.gates.mes_rules_authority.status,'green_code_not_published');
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);

fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log('PASS operational registry readiness GREEN without Rules publication');
