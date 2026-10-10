import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=path.resolve('.');

test('build estático grava SHA/branch/provider reais do deploy sem depender da Vercel',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-release-build-'));
  const sha='0123456789abcdef0123456789abcdef01234567';
  try{
    const result=spawnSync(process.execPath,['scripts/build-static.mjs'],{
      cwd:ROOT,
      encoding:'utf8',
      env:{
        ...process.env,
        CENTRAL_STATIC_OUT:out,
        COMMIT:sha,
        BRANCH:'v2/console-parity-r12',
        NETLIFY:'true',
        VERCEL:'',
        VERCEL_GIT_COMMIT_SHA:'',
        VERCEL_GIT_COMMIT_REF:'',
        GITHUB_SHA:'',
        GITHUB_REF_NAME:'',
        GITHUB_ACTIONS:''
      }
    });
    assert.equal(result.status,0,result.stderr||result.stdout);
    const manifest=JSON.parse(fs.readFileSync(path.join(out,'release-build.json'),'utf8'));
    assert.deepEqual(manifest,{
      sha,
      branch:'v2/console-parity-r12',
      provider:'netlify',
      build:'15.1.13.48',
      project:'central-cora-v2'
    });
    assert.ok(fs.existsSync(path.join(out,'Central-de-Controle-','index.html')));
    assert.match(result.stdout,/deployment sha:/);
    assert.match(result.stdout,new RegExp(sha));
  } finally {
    fs.rmSync(out,{recursive:true,force:true});
  }
});
