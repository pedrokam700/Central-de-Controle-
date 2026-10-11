import fs from 'node:fs';

const path='hardening/production-readiness.json';
const readiness=JSON.parse(fs.readFileSync(path,'utf8'));
const gate=readiness.gates?.csp_inventory;
if(!gate||gate.priority!=='P1')throw new Error('csp_inventory gate missing or changed');
if(readiness.promotion?.stable_allowed!==false||readiness.promotion?.main_merge_allowed!==false||readiness.promotion?.production_rules_publish_allowed!==false)throw new Error('promotion baseline changed');

gate.status='green_report_only_candidate_external_observation_pending';
gate.green=[...new Set([...(gate.green||[]),
  'directive-specific CSP Report-Only candidate derived from runtime-proven dependencies',
  'Netlify and Vercel carry the same Content-Security-Policy-Report-Only header',
  'candidate policy excludes unsafe-inline and unsafe-eval',
  'browser connect-src includes only same-origin, Firebase Auth/Firestore services and local loopback agent',
  'factory A-MES host remains agent-side and is not exposed as a browser connect-src origin',
  'test/example/unresolved origins remain excluded from the candidate allowlist',
  'CSP Report-Only candidate passed Static Quality and Firestore Rules/cross-PC E2E'
])];
gate.evidence=[...new Set([...(gate.evidence||[]),
  'hardening/csp-report-only-plan.json',
  'hardening/csp-report-only-evidence.json',
  'scripts/ames-csp-report-only.test.mjs',
  'netlify.toml',
  'vercel.json'
])];
gate.full_ci_runs=[...new Set([...(gate.full_ci_runs||[]),38180774012])];
gate.remaining=[
  'create/use an explicitly authorized hardening preview PR before external CSP observation; no open PR currently uses hardening/p0-production-readiness as head',
  'observe Content-Security-Policy-Report-Only violations on the externally reachable preview',
  'add only origins proven necessary by report-only runtime evidence',
  'exercise Firebase Auth, Firestore, same-origin CORA routes and local-agent connectivity under the report-only candidate',
  'promote to blocking Content-Security-Policy only through a separate gated change after external observation is GREEN'
];

if(readiness.promotion.stable_allowed||readiness.promotion.main_merge_allowed||readiness.promotion.production_rules_publish_allowed)throw new Error('CSP reconciliation attempted promotion');
fs.writeFileSync(path,JSON.stringify(readiness,null,2)+'\n');
console.log(JSON.stringify({status:gate.status,full_ci_runs:gate.full_ci_runs,remaining:gate.remaining},null,2));
