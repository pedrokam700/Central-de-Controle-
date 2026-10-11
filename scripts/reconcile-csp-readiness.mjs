import fs from 'node:fs';

const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const writeJson=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');

const block=readJson('hardening/csp-style-extraction-evidence.json');
block.status='green';
block.full_ci_run=38179802958;
block.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
block.remaining=[
  'derive and validate final CSP directives and required Firebase/CORA/A-MES origins before enforcing a blocking policy',
  'exercise the resulting CSP in report-only mode on an externally reachable preview before blocking enforcement'
];
writeJson('hardening/csp-style-extraction-evidence.json',block);

const attr=readJson('hardening/csp-style-attribute-extraction-evidence.json');
attr.status='green';
attr.full_ci_run=38180353061;
attr.gates={static_quality:'success',firestore_rules_cross_pc_e2e:'success',published_preview_smoke:'skipped_on_push'};
attr.remaining=[
  'derive and validate final CSP directives/origin allowlist for Firebase, CORA, A-MES and local dependencies',
  'exercise CSP in report-only mode on an externally reachable preview before blocking enforcement'
];
writeJson('hardening/csp-style-attribute-extraction-evidence.json',attr);

const readiness=readJson('hardening/production-readiness.json');
const gate=readiness.gates.csp_inventory;
if(!gate||gate.priority!=='P1')throw new Error('csp_inventory readiness gate missing or changed');
gate.status='green_source_inventory_policy_pending';
gate.green=[
  'frontend source inventory',
  'approved A-MES intranet HTTP classified explicitly',
  'unknown non-loopback HTTP remains blocking',
  'inline script blocks eliminated: 0',
  'inline style blocks eliminated: 0',
  'inline style attributes eliminated: 0',
  'eval/new Function blockers eliminated: 0',
  'dynamic script element creation inventory: 0',
  '15 former inline style blocks externalized with cascade order preserved and offline/build coverage',
  '45 former static style attributes externalized with one-to-one mapping and direct runtime style-property updates preserved',
  'source inventory now reports blocking_csp_ready only when scripts/styles/style-attributes/eval/insecure HTTP are all clean',
  'CSP source-form cleanup passed Static Quality and Firestore Rules/cross-PC E2E'
];
gate.evidence=[
  'scripts/csp-inventory.mjs',
  'scripts/ames-csp-inventory.test.mjs',
  'scripts/ames-csp-style-extraction.test.mjs',
  'scripts/ames-csp-style-attributes.test.mjs',
  'hardening/csp-style-extraction-evidence.json',
  'hardening/csp-style-attribute-extraction-evidence.json',
  'hardening/csp-inline-style-attribute-map.json'
];
gate.full_ci_runs=[38179802958,38180353061];
gate.remaining=[
  'derive a directive-specific CSP allowlist from runtime dependencies; do not promote test/example origins such as central.invalid or https://... into policy',
  'validate Firebase, CORA, local agent and factory A-MES origins by resource type instead of using one generic origin list',
  'exercise the candidate policy in Content-Security-Policy-Report-Only on an externally reachable preview',
  'enforce a blocking CSP only after report-only evidence is GREEN and no required Central/CORA/A-MES path is broken'
];
writeJson('hardening/production-readiness.json',readiness);

console.log(JSON.stringify({csp_status:gate.status,full_ci_runs:gate.full_ci_runs,promotion:readiness.promotion},null,2));
