import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractVercelPreview,normalizeVercelPreview,discoverVercelPreview} from './preview-origin-discovery.mjs';

const valid='https://central-cora-v2-git-hardening-p0-produc-30b354-pedrokam700-6477.vercel.app';

test('trusted vercel bot comment yields exact vercel.app origin',()=>{
  const comments=[{user:{login:'vercel[bot]'},body:`| Project | Deployment | Actions |\n| x | Ready | [Preview](${valid}) |`}];
  assert.equal(extractVercelPreview(comments),valid);
});

test('ordinary users and lookalike or insecure hosts are ignored',()=>{
  const comments=[
    {user:{login:'someone'},body:`[Preview](${valid})`},
    {user:{login:'vercel[bot]'},body:'https://preview.vercel.app.evil.example'},
    {user:{login:'vercel[bot]'},body:'http://preview.vercel.app'}
  ];
  assert.equal(extractVercelPreview(comments),null);
  assert.equal(normalizeVercelPreview('https://preview.vercel.app.evil.example'),null);
  assert.equal(normalizeVercelPreview('http://preview.vercel.app'),null);
});

test('credentials query hash and non-root paths are rejected',()=>{
  for(const value of [
    'https://user:pass@preview.vercel.app',
    'https://preview.vercel.app?token=x',
    'https://preview.vercel.app#fragment',
    'https://preview.vercel.app/private/path'
  ])assert.equal(normalizeVercelPreview(value),null,value);
});

test('newest trusted vercel comment wins',()=>{
  const older='https://old-preview.vercel.app';
  const newest='https://new-preview.vercel.app';
  assert.equal(extractVercelPreview([
    {user:{login:'vercel[bot]'},body:`[Preview](${older})`},
    {user:{login:'vercel[bot]'},body:`[Preview](${newest})`}
  ]),newest);
});

test('GitHub comment discovery returns only validated bot origin and fails soft',async()=>{
  const fetcher=async(url,options)=>{
    assert.match(String(url),/\/issues\/24\/comments\?per_page=100$/);
    assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>[
      {user:{login:'pedrokam700'},body:`[Preview](https://spoof.vercel.app)`},
      {user:{login:'vercel[bot]'},body:`[Preview](${valid})`}
    ]};
  };
  assert.equal(await discoverVercelPreview({repository:'pedrokam700/Central-de-Controle-',pr:24,fetcher,token:'test'}),valid);
  assert.equal(await discoverVercelPreview({repository:'pedrokam700/Central-de-Controle-',pr:24,fetcher:async()=>({ok:false})}),null);
});

test('PR workflow discovers trusted Vercel origin and passes both providers to unchanged smoke contract',()=>{
  const workflow=fs.readFileSync('.github/workflows/quality-gate.yml','utf8');
  assert.match(workflow,/preview-origin-discovery\.mjs/);
  assert.match(workflow,/--origin "https:\/\/deploy-preview-\$\{PR_NUMBER\}--productcontrolcenter\.netlify\.app"/);
  assert.match(workflow,/--origin "\$VERCEL_ORIGIN"/);
  assert.match(workflow,/post-deploy-smoke\.mjs/);
  assert.match(workflow,/--sha "\$EXPECTED_SHA"/);
});
