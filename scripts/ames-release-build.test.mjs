import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=path.resolve('.');
const sha256=text=>crypto.createHash('sha256').update(text).digest('hex');

test('build estático grava SHA/branch/provider reais e identidade completa do release',()=>{
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
    assert.equal(manifest.sha,sha);
    assert.equal(manifest.branch,'v2/console-parity-r12');
    assert.equal(manifest.provider,'netlify');
    assert.equal(manifest.build,'15.1.13.48');
    assert.equal(manifest.project,'central-cora-v2');
    assert.equal(manifest.release_identity_schema,'central-release-identity-v1');
    assert.match(manifest.release_identity_sha256,/^[a-f0-9]{64}$/);

    const rootIdentityText=fs.readFileSync(path.join(out,'release-identity.json'),'utf8');
    const appIdentityText=fs.readFileSync(path.join(out,'Central-de-Controle-','release-identity.json'),'utf8');
    assert.equal(appIdentityText,rootIdentityText,'root e base path devem servir a mesma identidade imutável');
    assert.equal(manifest.release_identity_sha256,sha256(rootIdentityText),'release-build deve apontar para os bytes exatos da identidade');
    const identity=JSON.parse(rootIdentityText);
    assert.equal(identity.frontend_sha,sha);
    assert.equal(identity.central_build,manifest.build);
    assert.equal(identity.schema,manifest.release_identity_schema);
    assert.equal(identity.factory_gate_required,true);
    assert.equal(identity.canonical_schema,'central-ames-v2');
    assert.match(identity.firestore_rules_sha256,/^[a-f0-9]{64}$/);
    assert.match(identity.r12_bridge_sha256,/^[a-f0-9]{64}$/);
    assert.match(identity.collector_3028_source?.sha256||'',/^[a-f0-9]{64}$/);

    assert.ok(fs.existsSync(path.join(out,'Central-de-Controle-','index.html')));
    assert.match(result.stdout,/deployment sha:/);
    assert.match(result.stdout,new RegExp(sha));
    assert.match(result.stdout,/release identity:/);
  } finally {
    fs.rmSync(out,{recursive:true,force:true});
  }
});
