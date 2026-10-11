import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const sessionEvidencePath='hardening/session-admission-app-evidence.json';
const adminEvidencePath='hardening/admission-admin-ui-evidence.json';
const readinessTestPath='scripts/ames-production-readiness.test.mjs';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const sessionEvidence=JSON.parse(fs.readFileSync(sessionEvidencePath,'utf8'));
const adminEvidence=JSON.parse(fs.readFileSync(adminEvidencePath,'utf8'));
const add=(list,...values)=>[...new Set([...(Array.isArray(list)?list:[]),...values])];

const outbox=readiness.gates.offline_outbox_uid_idempotency;
outbox.status='green';
outbox.green=add(outbox.green,
  'typed compound routineExecution effect',
  'failure document plus routine link commit atomically in one Firestore batch',
  'routine link uses idempotent arrayUnion of business failure id',
  'missing routine fails the whole batch closed',
  'ACK only after the complete batch commits',
  'online routine-origin failure uses the same atomic domain contract'
);
outbox.evidence=add(outbox.evidence,
  'hardening/h2-compound-outbox-evidence.json',
  'core/offline-domain-write.mjs',
  'core/offline-outbox.mjs',
  'scripts/ames-offline-domain-write.test.mjs',
  'scripts/ames-offline-outbox.test.mjs',
  'scripts/ames-offline-central.test.mjs'
);
delete outbox.remaining;
outbox.full_ci_run=38153144329;

const rbac=readiness.gates.admission_rbac;
rbac.status='partial';
rbac.green=add(rbac.green,
  'actual app.js signup creates only V2 pending viewer profiles',
  'signup never auto-promotes an email to admin',
  'actual app.js login uses evaluateSessionAdmission fail-closed',
  'live profile changes revalidate the active session',
  'MES publication is gated by publish_mes capability',
  'admin UI authority uses capabilities.administer instead of currentAccount.role',
  'user-management UI supports explicit legacy migration, approve/reapprove, deny and access-level change',
  'user profile patch and admissionAudit append commit atomically in one Firestore batch',
  'admin UI blocks self-escalation and self-lockout'
);
rbac.evidence=add(rbac.evidence,
  'app.js',
  'scripts/ames-session-admission-app.test.mjs',
  'scripts/ames-admission-admin-app.test.mjs',
  'hardening/session-admission-app-evidence.json',
  'hardening/admission-admin-ui-evidence.json'
);
rbac.remaining=[
  'inventory and migrate active legacy accounts one-by-one with explicit administrator-selected access level',
  'make write controls capability-aware for viewer/operator/engineer UX while Rules remain server authority',
  'remove legacy fallback only after every active account is migrated and regression evidence is green'
];
rbac.full_ci_runs=[38154172207,38154816019];

sessionEvidence.status='full_green';
sessionEvidence.full_ci={
  run_id:38154172207,
  descendant_sha:'346422d8e3f5af46ed9a80ca289c7729ae9b23fd',
  static_quality:'success',
  firestore_e2e:'success'
};
sessionEvidence.promotion_note='Frontend session admission is GREEN internally. Legacy compatibility remains intentionally enabled until account-by-account migration is complete.';

adminEvidence.status='full_green';
adminEvidence.full_ci={
  run_id:38154816019,
  descendant_sha:'790c7eeaef2e4af95f950602f08e4abc8ee0717c',
  static_quality:'success',
  firestore_e2e:'success'
};
adminEvidence.promotion_note='Audited admission admin UI is GREEN internally. Do not auto-migrate legacy accounts and do not publish production Rules without explicit promotion authorization.';

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed){
  throw new Error('reconciliation must not relax promotion controls');
}
if(rbac.status==='green')throw new Error('RBAC cannot be fully green before legacy migration and UX capability gating');
if(readiness.gates.published_preview_smoke.status==='green')throw new Error('preview smoke must remain unproven until external evidence exists');

for(const [path,value] of [[readinessPath,readiness],[sessionEvidencePath,sessionEvidence],[adminEvidencePath,adminEvidence]]){
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}

let readinessTest=fs.readFileSync(readinessTestPath,'utf8');
const oldExpectation="  assert.match(readiness.gates.offline_outbox_uid_idempotency.remaining.join(' '),/routineExecution/i);";
const newExpectation="  assert.equal(readiness.gates.offline_outbox_uid_idempotency.status,'green');\n  assert.equal(readiness.gates.offline_outbox_uid_idempotency.full_ci_run,38153144329);";
if(!readinessTest.includes(oldExpectation))throw new Error('stale H2 readiness expectation not found exactly once');
if(readinessTest.indexOf(oldExpectation)!==readinessTest.lastIndexOf(oldExpectation))throw new Error('stale H2 readiness expectation duplicated');
readinessTest=readinessTest.replace(oldExpectation,newExpectation);
fs.writeFileSync(readinessTestPath,readinessTest);

console.log('PASS readiness reconciled without promotion');
