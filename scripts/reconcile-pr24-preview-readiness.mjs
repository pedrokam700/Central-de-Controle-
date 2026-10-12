import fs from 'node:fs';
import assert from 'node:assert/strict';

const readinessPath='hardening/production-readiness.json';
const evidencePath='hardening/published-preview-smoke-evidence.json';
const readiness=JSON.parse(fs.readFileSync(readinessPath,'utf8'));

assert.equal(readiness.schema,'central-production-readiness-v1');
assert.equal(readiness.physical_candidate?.sha,'5e45127d3b61b37968a4c2b05596919670b307cb');
assert.equal(readiness.physical_candidate?.frozen,true);
assert.equal(readiness.promotion?.stable_allowed,false);
assert.equal(readiness.promotion?.main_merge_allowed,false);
assert.equal(readiness.promotion?.production_rules_publish_allowed,false);

const preview=readiness.gates?.published_preview_smoke;
const csp=readiness.gates?.csp_inventory;
assert.ok(preview,'missing published_preview_smoke gate');
assert.ok(csp,'missing csp_inventory gate');
assert.notEqual(preview.status,'green');
assert.notEqual(csp.status,'green');

const evidence={
  schema:'central-published-preview-smoke-evidence-v1',
  status:'blocked_external_preview',
  branch:'hardening/p0-production-readiness',
  pull_request:24,
  validated_head:'5745bfe89eb6ea1994fbead20e6b32f9796ef09a',
  workflow_run:38244959294,
  internal_gates:{
    static_quality:'success',
    firestore_rules_cross_pc_e2e:'success',
    published_preview_smoke:'failure'
  },
  providers:{
    netlify:{
      preview_origin:'https://deploy-preview-24--productcontrolcenter.netlify.app',
      release_build_http_status:401,
      classification:'provider_access_protected'
    },
    vercel:{
      preview_origin:'https://central-cora-v2-git-hardening-p0-produc-30b354-pedrokam700-6477.vercel.app',
      project:'central-cora-v2',
      release_build_content_type:'text/html; charset=utf-8',
      release_build_classification:'html_unknown_not_central_release_build',
      connector_scope:'pedrokam700-6477',
      connector_project_inspection:'http_403',
      accessible_teams_in_current_connection:0
    }
  },
  conclusions:[
    'The Central static build contract remains fail-closed: release-build.json must be JSON and bind the exact SHA.',
    'Netlify preview is not externally usable by CI because release-build.json returns HTTP 401.',
    'The Vercel PR deployment is associated with project central-cora-v2 and does not expose the Central release-build.json artifact at the discovered alias.',
    'The current Vercel connection cannot inspect or repair that project/team because the deployment scope returns HTTP 403 and no accessible team context is available.',
    'No smoke assertion was weakened and no provider HTML was accepted as a valid Central build.'
  ],
  not_proven:[
    'externally reachable preview serving the exact Central static build',
    'external CSP Report-Only runtime observation',
    'published preview exact-SHA smoke GREEN'
  ]
};
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');

preview.status='partial_blocked_external_preview';
preview.evidence=[...new Set([...(preview.evidence||[]),evidencePath])];
preview.green=[...new Set([...(preview.green||[]),
  'PR #24 internal Static Quality and Firestore Rules/cross-PC E2E are GREEN on the exact hardening head while the preview-only gate remains external-blocked',
  'preview discovery keeps exact-SHA release-build.json validation fail-closed and sanitizes HTML diagnostics'
])];
preview.remaining=[
  'obtain an externally reachable PR preview that serves the Central static build and JSON release-build.json for the exact hardening SHA',
  'rerun Published preview smoke until exact SHA, canonical route, release identity and CSP Report-Only checks are GREEN on that Central preview'
];
preview.blocker='PR #24 external preview is not currently valid for Central smoke: Netlify release-build.json returns HTTP 401; the discovered Vercel deployment belongs to project central-cora-v2 and returns text/html instead of the Central release-build.json JSON artifact; the current Vercel connection cannot inspect/repair that team project because its scope returns HTTP 403.';
preview.pr=24;
preview.last_external_validation_run=38244959294;

const stale='create/use an explicitly authorized hardening preview PR before external CSP observation; no open PR currently uses hardening/p0-production-readiness as head';
assert.ok((csp.remaining||[]).includes(stale),'expected stale CSP PR blocker was not present; refusing blind rewrite');
csp.remaining=(csp.remaining||[]).filter(item=>item!==stale);
csp.remaining.unshift('PR #24 is open as the authorized hardening validation PR, but its current Netlify/Vercel previews do not expose a valid externally reachable Central static build; obtain a correct Central preview before CSP Report-Only runtime observation');
csp.evidence=[...new Set([...(csp.evidence||[]),evidencePath])];

assert.equal(readiness.promotion.stable_allowed,false);
assert.equal(readiness.promotion.main_merge_allowed,false);
assert.equal(readiness.promotion.production_rules_publish_allowed,false);
assert.notEqual(preview.status,'green');
assert.match(preview.status,/partial|blocked/);
assert.match(csp.status,/report_only|pending/);
assert.ok(preview.remaining.length>0);
assert.ok(csp.remaining.length>0);
assert.ok(csp.remaining.some(item=>/PR #24/.test(item)));
assert.ok(!csp.remaining.some(item=>/no open PR currently/.test(item)));

fs.writeFileSync(readinessPath,JSON.stringify(readiness,null,2)+'\n');
console.log('PR #24 preview blocker reconciled without promotion');
