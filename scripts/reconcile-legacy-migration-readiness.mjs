import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='hardening/production-readiness.json';
const readiness=JSON.parse(fs.readFileSync(path,'utf8'));
const gate=readiness?.gates?.admission_rbac;

assert.equal(readiness.schema,'central-production-readiness-v1');
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
assert.equal(gate?.status,'partial');
assert.ok(Array.isArray(gate.green));
assert.ok(Array.isArray(gate.evidence));
assert.ok(Array.isArray(gate.remaining));
assert.ok(Array.isArray(gate.full_ci_runs));
assert.ok(gate.remaining.some(x=>/inventory and migrate active legacy accounts/i.test(x)),'expected legacy inventory remaining item missing');
assert.ok(gate.remaining.some(x=>/remove legacy fallback/i.test(x)),'expected fallback remaining item missing');

for(const item of [
  'admin UI exposes a live legacy-account migration inventory derived from the loaded users collection',
  'legacy inventory distinguishes V2, active legacy and disabled legacy accounts without exporting account PII',
  'legacy migration tooling never bulk-migrates, auto-migrates or infers an access level',
  'disabled legacy accounts and invalid/empty inventory keep fallback removal fail-closed'
]) if(!gate.green.includes(item))gate.green.push(item);

for(const item of [
  'core/legacy-account-migration.mjs',
  'scripts/ames-legacy-account-migration.test.mjs',
  'scripts/ames-legacy-account-migration-app.test.mjs',
  'hardening/legacy-account-migration-inventory-evidence.json'
]) if(!gate.evidence.includes(item))gate.evidence.push(item);

gate.remaining=[
  'use the live admin inventory to migrate every legacy account one-by-one with an explicit administrator-selected access level; no production account migration is proven yet',
  'remove the legacy fallback only after the live inventory reports zero legacy accounts, including disabled legacy accounts, and a separate regression/promotion gate is GREEN'
];
if(!gate.full_ci_runs.includes(38156414534))gate.full_ci_runs.push(38156414534);

assert.equal(gate.status,'partial');
assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
fs.writeFileSync(path,JSON.stringify(readiness,null,2)+'\n');
console.log('PASS legacy migration readiness reconciled fail-closed');
