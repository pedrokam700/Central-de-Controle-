import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCspInventory} from './csp-inventory.mjs';

const files=[
  "csp-inline-01-central-inline-styles.css",
  "csp-inline-02-v1415-styles.css",
  "csp-inline-03-central-v14-16-ui.css",
  "csp-inline-04-v1421-ui-styles.css",
  "csp-inline-05-cora-v1505-definitive.css",
  "csp-inline-06-v1510-final-overrides.css",
  "csp-inline-07-v15-1-4-final-layout.css",
  "csp-inline-08-v15-1-6-final.css",
  "csp-inline-09-cora-final-layout-v1517.css",
  "csp-inline-10-v1511-authority.css",
  "csp-inline-11-v151313-final-authority.css",
  "csp-inline-12-daily-layout-v15-1-13-30.css",
  "csp-inline-13-cora-v1518-final-authority.css",
  "csp-inline-14-v1510-layout-authority.css",
  "csp-inline-15-cora-sidebar-structure-v15-1-13-21.css"
];
const ids=[
  "central-inline-styles",
  "v1415-styles",
  "central-v14-16-ui",
  "v1421-ui-styles",
  "cora-v1505-definitive",
  "v1510-final-overrides",
  "v15-1-4-final-layout",
  "v15-1-6-final",
  "cora-final-layout-v1517",
  "v1511-authority",
  "v151313-final-authority",
  "daily-layout-v15-1-13-30",
  "cora-v1518-final-authority",
  "v1510-layout-authority",
  "cora-sidebar-structure-v15-1-13-21"
];
const sourceIndex=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const links=[...sourceIndex.matchAll(/<link\b(?=[^>]*href="\/Central-de-Controle-\/(csp-inline-[^"?]+\.css)\?v=15\.1\.13\.48")(?=[^>]*data-extracted-style="([^"]+)")[^>]*>/gi)].map(match=>({id:match[2],file:match[1]}));

test('all former inline style blocks are externalized in original order',()=>{
  assert.equal(files.length,15);
  assert.deepEqual(links.map(item=>item.id),ids);
  assert.deepEqual(links.map(item=>item.file),files);
  assert.equal(new Set(files).size,15);
  assert.equal((sourceIndex.match(/<style\b/gi)||[]).length,0);
  for(const file of files){
    assert.ok(fs.existsSync(file),file);
    assert.ok(fs.readFileSync(file,'utf8').trim().length>0,file+' is empty');
    assert.ok(sw.includes("BASE+'"+file+"'"),'service worker missing '+file);
  }
});

test('CSP inventory keeps style attributes explicit after style-block extraction',()=>{
  const inventory=buildCspInventory();
  assert.equal(inventory.inline_scripts,0);
  assert.equal(inventory.inline_styles,0);
  assert.equal(typeof inventory.inline_style_attributes,'number');
  const expected=inventory.inline_style_attributes===0&&inventory.eval_like===0&&inventory.insecure_non_local_urls.length===0;
  assert.equal(inventory.blocking_csp_ready,expected);
});

test('static build publishes every extracted stylesheet and keeps base page style-block free',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-style-dist-'));
  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const base=path.join(out,'Central-de-Controle-');
  const builtIndex=fs.readFileSync(path.join(base,'index.html'),'utf8');
  assert.equal((builtIndex.match(/<style\b/gi)||[]).length,0);
  for(const file of files){
    assert.ok(fs.existsSync(path.join(base,file)),'build missing '+file);
    assert.equal(fs.readFileSync(path.join(base,file),'utf8'),fs.readFileSync(file,'utf8'),'build changed '+file);
  }
  fs.rmSync(out,{recursive:true,force:true});
});
