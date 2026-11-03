import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const quality=readFileSync(resolve(root,'.github/workflows/quality-gate.yml'),'utf8');
const pages=readFileSync(resolve(root,'.github/workflows/publish-github-pages.yml'),'utf8');

test('PR tests use GitHub source; no external Netlify preview gate',()=>{
  assert.match(quality,/pull_request:/);
  assert.match(quality,/name: Static quality checks/);
  assert.match(quality,/name: Agent and sync E2E with Firestore Rules/);
  assert.match(quality,/name: Console themes, languages and mobile/);
  assert.doesNotMatch(quality,/post-deploy-smoke\s*:/);
  assert.doesNotMatch(quality,/deploy-preview-\$\{PR_NUMBER\}/);
});

test('official release and Pages prove exact SHA and entry assets',()=>{
  assert.match(pages,/Resolve immutable latest GitHub Release/);
  assert.match(pages,/gh api "\/repos\/\$GITHUB_REPOSITORY\/releases\/latest"/);
  assert.match(pages,/Checkout EXACT official GitHub Release commit/);
  assert.match(pages,/Publish GitHub Pages/);
  assert.match(pages,/pedrokam700\.github\.io\/Central-de-Controle-\//);
  assert.match(pages,/Public GitHub Pages verified: SHA=\$EXPECTED_SHA home=200 index=200 bootstrap=200/);
});
