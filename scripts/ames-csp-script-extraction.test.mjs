import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCspInventory} from './csp-inventory.mjs';

const sourceIndex=fs.readFileSync('index.html','utf8');
const buildScript=fs.readFileSync('scripts/build-static.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const inlineScripts=html=>[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]||'')));
const inlineStyles=html=>[...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)];

test('source index has no inline script blocker and keeps parser-blocking external build guard',()=>{
  const inventory=buildCspInventory();
  assert.equal(inventory.inline_scripts,0);
  assert.equal(inventory.inline_styles,0);
  assert.equal(inventory.eval_like,0);
  assert.deepEqual(inventory.insecure_non_local_urls,[]);
  assert.equal(inventory.blocking_csp_ready,inventory.inline_style_attributes===0);
  assert.equal(inlineScripts(sourceIndex).length,0);
  assert.match(sourceIndex,/<script id="cora-build-guard" src="\/Central-de-Controle-\/cora-build-guard\.js\?v=15\.1\.13\.48"><\/script>/);
});

test('build and offline shell include all external guard scripts',()=>{
  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js']){
    assert.ok(fs.existsSync(name),name);
    assert.ok(buildScript.includes("'"+name+"'"),'build missing '+name);
    assert.ok(sw.includes("BASE+'"+name+"'"),'SW missing '+name);
  }
  assert.equal(buildScript.includes('const bootGuard='+String.fromCharCode(96)+'<script'),false);
  assert.equal(buildScript.includes('<script>location.replace'),false);
});

test('built base page and root entry contain zero inline scripts',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-dist-'));
  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const baseIndex=fs.readFileSync(path.join(out,'Central-de-Controle-','index.html'),'utf8');
  const rootIndex=fs.readFileSync(path.join(out,'index.html'),'utf8');
  assert.equal(inlineScripts(baseIndex).length,0);
  assert.equal(inlineScripts(rootIndex).length,0);
  assert.equal(inlineStyles(baseIndex).length,0);
  assert.equal(inlineStyles(rootIndex).length,0);
  assert.match(baseIndex,/central-runtime-boot-guard\.js\?v=15\.1\.13\.48/);
  assert.match(rootIndex,/root-entry\.js\?v=15\.1\.13\.48/);
  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js'])assert.ok(fs.existsSync(path.join(out,'Central-de-Controle-',name)),name);
  fs.rmSync(out,{recursive:true,force:true});
});
