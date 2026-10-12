import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCspInventory} from './csp-inventory.mjs';

const plan=JSON.parse(fs.readFileSync('hardening/csp-report-only-plan.json','utf8'));
const netlify=fs.readFileSync('netlify.toml','utf8');
const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const app=fs.readFileSync('app.js','utf8');
const agentContract=fs.readFileSync('ames/data/agent-contract.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const header=Object.entries(plan.directives).map(([name,values])=>`${name} ${values.join(' ')}`).join('; ');

const flat=()=>Object.values(plan.directives).flat().join(' ');

test('report-only CSP candidate remains non-enforcing and promotion-safe',()=>{
  assert.equal(plan.schema,'central-csp-report-only-plan-v1');
  assert.equal(plan.mode,'report_only_candidate');
  assert.equal(plan.enforcement,false);
  assert.equal(plan.header_name,'Content-Security-Policy-Report-Only');
  assert.equal(plan.promotion.blocking_csp_enforced,false);
  assert.equal(plan.promotion.stable_allowed,false);
  assert.equal(plan.promotion.main_merge_allowed,false);
  assert.equal(plan.promotion.production_rules_publish_allowed,false);
});

test('candidate policy is strict on inline code/styles and object/base embedding',()=>{
  assert.deepEqual(plan.directives['default-src'],["'self'"]);
  assert.deepEqual(plan.directives['style-src'],["'self'"]);
  assert.deepEqual(plan.directives['style-src-attr'],["'none'"]);
  assert.deepEqual(plan.directives['object-src'],["'none'"]);
  assert.deepEqual(plan.directives['base-uri'],["'none'"]);
  assert.deepEqual(plan.directives['frame-ancestors'],["'none'"]);
  assert.doesNotMatch(flat(),/unsafe-inline|unsafe-eval/i);
});

test('runtime-proven Firebase and local-agent dependencies are directive-specific',()=>{
  assert.ok(plan.directives['script-src'].includes('https://www.gstatic.com'));
  assert.ok(plan.directives['connect-src'].includes('http://127.0.0.1:8765'));
  assert.ok(plan.directives['connect-src'].includes('https://identitytoolkit.googleapis.com'));
  assert.ok(plan.directives['connect-src'].includes('https://securetoken.googleapis.com'));
  assert.ok(plan.directives['connect-src'].includes('https://firestore.googleapis.com'));
  assert.ok(plan.directives['frame-src'].includes('https://central-de-controle-88962.firebaseapp.com'));
  assert.match(sw,/https:\/\/www\.gstatic\.com\/firebasejs\/10\.8\.0\/firebase-app\.js/);
  assert.match(app,/https:\/\/www\.gstatic\.com\/firebasejs\/10\.8\.0\/firebase-auth\.js/);
  assert.match(app,/authDomain:\s*"central-de-controle-88962\.firebaseapp\.com"/);
  assert.match(agentContract,/AGENT_URL\s*=\s*'http:\/\/127\.0\.0\.1:8765\/api\/v1'/);
});

test('CORA remains same-origin and unproven/test origins never enter the allowlist',()=>{
  assert.match(app,/['"]\/api\/failure-analysis['"]/);
  assert.ok(plan.directives['connect-src'].includes("'self'"));
  for(const forbidden of [
    'http://172.29.185.215',
    'https://cdn.sheetjs.com',
    'https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app',
    'https://central.invalid',
    'https://...',
    'https://deploy-preview-23--productcontrolcenter.netlify.app'
  ]){
    assert.ok(!flat().includes(forbidden),`unproven/test origin leaked into CSP: ${forbidden}`);
    assert.ok(Object.hasOwn(plan.excluded_or_unresolved,forbidden),`missing explicit exclusion reason: ${forbidden}`);
  }
});

test('source-form inventory is clean enough to begin report-only observation',()=>{
  const inventory=buildCspInventory();
  assert.equal(inventory.inline_scripts,0);
  assert.equal(inventory.inline_styles,0);
  assert.equal(inventory.inline_style_attributes,0);
  assert.equal(inventory.eval_like,0);
  assert.deepEqual(inventory.insecure_non_local_urls,[]);
  assert.equal(inventory.blocking_csp_ready,true);
});

test('both preview providers carry the exact same report-only candidate header',()=>{
  const netlifyLine=`Content-Security-Policy-Report-Only = "${header}"`;
  assert.ok(netlify.includes(netlifyLine),'Netlify report-only CSP differs from plan');
  const global=vercel.headers.find(x=>x.source==='/(.*)');
  assert.ok(global,'missing Vercel global headers');
  const csp=global.headers.find(x=>x.key==='Content-Security-Policy-Report-Only');
  assert.equal(csp?.value,header);
});
