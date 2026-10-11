import fs from 'node:fs';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/cora-direct-fetch-boundary-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));

if(readiness.promotion?.stable_allowed!==false||readiness.promotion?.main_merge_allowed!==false||readiness.promotion?.production_rules_publish_allowed!==false){
  throw new Error('promotion must remain fail-closed');
}
const gate=readiness.gates?.cora_external_data_policy;
if(!gate)throw new Error('cora_external_data_policy gate missing');
if(gate.status!=='partial_runtime_enforcement')throw new Error(`unexpected CORA egress status: ${gate.status}`);
if(evidence.status!=='focused_green_full_ci_pending')throw new Error(`unexpected direct-fetch evidence status: ${evidence.status}`);
if(evidence.validated_parent!=='6dc09bb906d550497b753dcb237ac7c28009e9dc')throw new Error('direct-fetch evidence parent changed');

const addUnique=(list,value)=>{if(!list.includes(value))list.push(value);};
for(const item of [
  'same-origin CORA application requests pass a destination boundary before browser network submission',
  'all 11 formerly direct CORA browser fetches now use coraAppFetch and prepareCoraNetworkRequest',
  'window.FAILURE_AI_ENDPOINT cannot redirect browser traffic to an external provider because browser approvedExternalOrigins is immutable and empty',
  'audit, memory, chat, failure intake, image, slides, investigation artifact and audio routes remain local-only by route policy',
  'AI metrics remains no-payload and failure-analysis routes remain structured-external candidates only at policy level; browser direct provider egress is disabled',
  'only the two reviewed boundary helpers retain raw fetch primitives in app.js',
  'CORA client destination boundary passed Static Quality and Firestore Rules/cross-PC E2E'
])addUnique(gate.green,item);
for(const path of [
  'core/cora-network-boundary.mjs',
  'scripts/ames-cora-network-boundary.test.mjs',
  'scripts/ames-cora-network-boundary-app.test.mjs',
  'scripts/ames-cora-direct-fetch-boundary-app.test.mjs',
  'hardening/cora-network-boundary-app-evidence.json',
  'hardening/cora-direct-fetch-boundary-evidence.json'
])addUnique(gate.evidence,path);
gate.status='partial_client_boundary_green_backend_governance_pending';
gate.remaining=[
  'inspect the authoritative CORA backend egress path when project/source access is available and prove that local-only routes are never forwarded to external model providers',
  'prove server-side sanitization/allowlist enforcement for any failure-analysis payload that the backend sends to an external provider',
  'keep backend /api/health, /api/version and frontend/backend compatibility as the separate P0 backend-contract blocker'
];
gate.full_ci_runs=Array.isArray(gate.full_ci_runs)?gate.full_ci_runs:[];
for(const run of [38181467837,38181784611])if(!gate.full_ci_runs.includes(run))gate.full_ci_runs.push(run);

evidence.status='green';
evidence.full_ci_run=38181784611;
evidence.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
evidence.remaining=[
  'authoritative CORA backend provider egress remains outside the proven client boundary',
  'backend version/health compatibility and server-side egress governance remain separate blockers'
];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('reconciliation attempted promotion');
fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,client_boundary_green:true,backend_governance_pending:true,full_ci_run:38181784611},null,2));
