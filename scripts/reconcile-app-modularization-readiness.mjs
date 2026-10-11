import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/cora-browser-transport-modularization-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));

if(readiness.promotion?.stable_allowed!==false||readiness.promotion?.main_merge_allowed!==false||readiness.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion must remain fail-closed');
const gate=readiness.gates?.app_modularization;
if(!gate)throw new Error('app_modularization gate missing');
if(gate.status!=='pending')throw new Error(`unexpected app_modularization status: ${gate.status}`);
if(evidence.status!=='focused_green_full_ci_pending')throw new Error(`unexpected modularization evidence status: ${evidence.status}`);
if(evidence.validated_parent!=='b4a8719a80babbf8653d7575e85e2f1e3e628ff9')throw new Error('modularization evidence parent changed');

const addUnique=(list,value)=>{if(!list.includes(value))list.push(value);};
gate.status='in_progress_first_slice_green';
gate.green=Array.isArray(gate.green)?gate.green:[];
for(const item of [
  'CORA browser transport extracted from app.js into core/cora-browser-transport.mjs',
  'app.js delegates aiPostJSON and guarded CORA fetches to the extracted transport',
  'destination policy remains centralized in core/cora-network-boundary.mjs',
  'app.js contains zero unqualified raw fetch primitives after extraction',
  'offline shell caches the extracted browser transport',
  'extraction preserved routes, auth token handling, GET/POST semantics, abort signals and backend error behavior',
  'first modularization slice passed focused tests plus full Static Quality and Firestore Rules/cross-PC E2E'
])addUnique(gate.green,item);
gate.evidence=Array.isArray(gate.evidence)?gate.evidence:[];
for(const path of [
  'core/cora-browser-transport.mjs',
  'scripts/ames-cora-browser-transport.test.mjs',
  'scripts/ames-cora-network-boundary-app.test.mjs',
  'scripts/ames-cora-direct-fetch-boundary-app.test.mjs',
  'hardening/cora-browser-transport-modularization-evidence.json'
])addUnique(gate.evidence,path);
gate.full_ci_runs=Array.isArray(gate.full_ci_runs)?gate.full_ci_runs:[];
if(!gate.full_ci_runs.includes(38182402337))gate.full_ci_runs.push(38182402337);
gate.remaining=[
  'continue gradual extraction in small behavior-preserving slices without framework rewrite',
  'prefer already-stabilized boundaries such as guarded Firestore client and auth/session orchestration before feature-heavy UI extraction',
  'keep each extraction behind focused tests and full CI before starting the next slice'
];

evidence.status='green';
evidence.full_ci_run=38182402337;
evidence.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
evidence.remaining=['continue modularization only in small behavior-preserving slices'];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('reconciliation attempted promotion');
fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,first_slice_green:true,full_ci_run:38182402337,promotion:readiness.promotion},null,2));
