import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/capability-write-ui-evidence.json';
const reconciledPath='hardening/rbac-readiness-reconciled.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const reconciled=JSON.parse(fs.readFileSync(reconciledPath,'utf8'));
const add=(list,...values)=>[...new Set([...(Array.isArray(list)?list:[]),...values])];

const rbac=readiness.gates.admission_rbac;
rbac.status='partial';
rbac.green=add(rbac.green,
  'client Firestore write policy mirrors operational, technical and admin Rules capability classes',
  'direct Firestore writes and write batches are capability-guarded client-side before network submission',
  'unknown client write collections fail closed instead of inheriting permission',
  'viewer write controls are read-only/hidden or blocked with capability feedback',
  'operator UX permits operational writes but blocks technical/admin writes',
  'engineer UX permits operational plus technical writes but blocks admin writes',
  'command palette and primary write modals are capability-filtered',
  'Firestore Rules remain final server authority'
);
rbac.evidence=add(rbac.evidence,
  'core/firestore-write-policy.mjs',
  'scripts/ames-firestore-write-policy.test.mjs',
  'scripts/ames-capability-write-ui.test.mjs',
  'hardening/capability-write-ui-evidence.json'
);
rbac.remaining=[
  'inventory and migrate active legacy accounts one-by-one with explicit administrator-selected access level',
  'remove legacy fallback only after every active account is migrated and regression evidence is green'
];
rbac.full_ci_runs=add(rbac.full_ci_runs,38155936063);

evidence.status='full_green';
evidence.full_ci={
  run_id:38155936063,
  descendant_sha:'558b1c4760ff524f1d94921c863d55ba98083a38',
  static_quality:'success',
  firestore_e2e:'success',
  preview_smoke:'skipped_push'
};
evidence.promotion_note='Capability-aware client UX and write guards are GREEN internally. Firestore Rules remain final authority and were not published. RBAC stays partial until legacy-account migration is completed and the compatibility fallback can be removed safely.';

reconciled.status='full_ci_superseded_by_capability_stage_green';
reconciled.capability_write_ui_full_ci_run=38155936063;
reconciled.remaining_admission_work=[...rbac.remaining];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('promotion controls must remain false');
if(readiness.gates.published_preview_smoke.status==='green')throw new Error('published preview must remain unproven');
if(rbac.status==='green')throw new Error('RBAC cannot be fully green before legacy migration/fallback removal');
if(rbac.remaining.length!==2)throw new Error('unexpected RBAC remaining set');

fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
fs.writeFileSync(reconciledPath,JSON.stringify(reconciled,null,2)+'\n');
console.log('PASS capability UX readiness reconciled without promotion');
