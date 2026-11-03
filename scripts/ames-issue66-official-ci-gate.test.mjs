import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const qualityGate=readFileSync(new URL('.github/workflows/quality-gate.yml',root),'utf8');
const officialPublish=readFileSync(new URL('.github/workflows/publish-github-pages.yml',root),'utf8');

test('Pull request quality gate runs all three internal suites without obsolete preview hosting',()=>{
  assert.match(qualityGate,/name: Central Quality Gate/);
  assert.match(qualityGate,/\n  static-quality:\n/);
  assert.match(qualityGate,/\n  sync-emulator:\n/);
  assert.match(qualityGate,/\n  console-experience:\n/);
  assert.doesNotMatch(qualityGate,/post-deploy-smoke|Published preview smoke|deploy-preview-|netlify\.app/i);
  assert.match(qualityGate,/node --test --test-isolation=none .*ames-\*\.test\.mjs/);
  assert.match(qualityGate,/run: python3 scripts\/agent-individual-assembly\.test\.py/);
});

test('Official publication remains exclusively GitHub Pages from verified GitHub Release SHA',()=>{
  assert.match(officialPublish,/name: Publish Official Central on GitHub Pages/);
  assert.match(officialPublish,/gh api "\/repos\/\$GITHUB_REPOSITORY\/releases\/latest"/);
  assert.match(officialPublish,/ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(officialPublish,/test "\$\(git rev-parse HEAD\)" = "\$COMMIT"/);
  assert.match(officialPublish,/uses: actions\/deploy-pages@/);
  assert.doesNotMatch(officialPublish,/netlify\.app|deploy-preview-/i);
});
