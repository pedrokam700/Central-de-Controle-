import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/user-profile-service-modularization-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));

if(readiness.promotion?.stable_allowed!==false||readiness.promotion?.main_merge_allowed!==false||readiness.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion must remain fail-closed');
const gate=readiness.gates?.app_modularization;
if(!gate)throw new Error('app_modularization gate missing');
if(gate.status!=='in_progress_two_slices_green')throw new Error(`unexpected modularization status: ${gate.status}`);
if(evidence.status!=='focused_green_full_ci_pending')throw new Error(`unexpected profile evidence status: ${evidence.status}`);
if(evidence.validated_parent!=='c1f5e73fe18d667f93bbb0afa9856ebd50239cad')throw new Error('profile evidence parent changed');

const addUnique=(list,value)=>{if(!list.includes(value))list.push(value);};
gate.status='in_progress_three_slices_green';
for(const item of [
  'user profile load/create service extracted from app.js into core/user-profile-service.mjs',
  'existing-profile normalization and legacy admin compatibility preserved',
  'missing profiles still use buildSignupProfile and start as V2 viewer pending',
  'profile creation continues through the guarded Firestore setDoc path and self-profile bootstrap policy',
  'finishLogin, auth listeners and signup orchestration remain in app.js unchanged',
  'third modularization slice passed focused tests plus full Static Quality and Firestore Rules/cross-PC E2E'
])addUnique(gate.green,item);
for(const path of [
  'core/user-profile-service.mjs',
  'scripts/ames-user-profile-service.test.mjs',
  'scripts/ames-session-admission-app.test.mjs',
  'hardening/user-profile-service-modularization-evidence.json'
])addUnique(gate.evidence,path);
gate.full_ci_runs=Array.isArray(gate.full_ci_runs)?gate.full_ci_runs:[];
if(!gate.full_ci_runs.includes(38183041134))gate.full_ci_runs.push(38183041134);
gate.remaining=[
  'pause further extraction unless the next slice materially improves production readiness; do not modularize for its own sake',
  'keep finishLogin/listener/UI orchestration in app.js until a separately justified boundary exists',
  'continue to require focused tests and full CI for any future extraction'
];

evidence.status='green';
evidence.full_ci_run=38183041134;
evidence.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
evidence.remaining=['future auth/listener extraction requires a separately justified slice'];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('reconciliation attempted promotion');
fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,third_slice_green:true,full_ci_run:38183041134},null,2));
