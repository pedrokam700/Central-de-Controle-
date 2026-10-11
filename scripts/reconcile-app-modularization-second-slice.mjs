import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/firestore-guarded-client-modularization-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));

if(readiness.promotion?.stable_allowed!==false||readiness.promotion?.main_merge_allowed!==false||readiness.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion must remain fail-closed');
const gate=readiness.gates?.app_modularization;
if(!gate)throw new Error('app_modularization gate missing');
if(gate.status!=='in_progress_first_slice_green')throw new Error(`unexpected modularization status: ${gate.status}`);
if(evidence.status!=='focused_green_full_ci_pending')throw new Error(`unexpected Firestore evidence status: ${evidence.status}`);
if(evidence.validated_parent!=='b8c3b6ab04a81df4a2c9a3e125d465eb2553e4e1')throw new Error('Firestore evidence parent changed');

const addUnique=(list,value)=>{if(!list.includes(value))list.push(value);};
gate.status='in_progress_two_slices_green';
for(const item of [
  'guarded Firestore client extracted from app.js into core/firestore-guarded-client.mjs',
  'self-profile bootstrap remains allowed before currentAccount capabilities exist',
  'capability checks execute before raw add/set/update/delete and batch mutations',
  'unknown collections remain fail-closed and actor/capabilities are read dynamically',
  'offline shell caches the extracted guarded Firestore client',
  'second modularization slice passed focused tests plus full Static Quality and Firestore Rules/cross-PC E2E'
])addUnique(gate.green,item);
for(const path of [
  'core/firestore-guarded-client.mjs',
  'scripts/ames-firestore-guarded-client.test.mjs',
  'scripts/ames-capability-write-ui.test.mjs',
  'hardening/firestore-guarded-client-modularization-evidence.json'
])addUnique(gate.evidence,path);
gate.full_ci_runs=Array.isArray(gate.full_ci_runs)?gate.full_ci_runs:[];
if(!gate.full_ci_runs.includes(38182776966))gate.full_ci_runs.push(38182776966);
gate.remaining=[
  'continue gradual extraction in small behavior-preserving slices without framework rewrite',
  'extract profile/auth services without moving listener/UI orchestration until each boundary is independently tested',
  'keep each extraction behind focused tests and full CI before starting the next slice'
];

evidence.status='green';
evidence.full_ci_run=38182776966;
evidence.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
evidence.remaining=['continue modularization only in small behavior-preserving slices'];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('reconciliation attempted promotion');
fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,second_slice_green:true,full_ci_run:38182776966},null,2));
