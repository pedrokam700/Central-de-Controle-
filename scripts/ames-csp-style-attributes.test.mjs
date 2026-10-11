import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCspInventory} from './csp-inventory.mjs';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('csp-inline-16-style-attributes.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const map=JSON.parse(fs.readFileSync('hardening/csp-inline-style-attribute-map.json','utf8'));
const appFiles=['app.js',...['ames','core'].flatMap(root=>fs.existsSync(root)?fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&/\.m?js$/i.test(entry.name)).map(entry=>path.join(entry.parentPath||entry.path,entry.name)):[])];

test('all 45 static style attributes are externalized with one-to-one tokens',()=>{
  assert.equal(map.count,45);
  assert.equal(map.rows.length,45);
  assert.equal((html.match(/\sstyle\s*=\s*(["']).*?\1/gis)||[]).length,0);
  assert.equal((html.match(/data-csp-inline-style=/g)||[]).length,45);
  assert.ok(html.includes('csp-inline-16-style-attributes.css?v=15.1.13.48'));
  for(const row of map.rows){
    assert.ok(html.includes('data-csp-inline-style="'+row.token+'"'),row.token+' missing from HTML');
    assert.ok(css.includes('[data-csp-inline-style="'+row.token+'"]{'+row.style+'}'),row.token+' mapping changed');
  }
});

test('runtime has no CSP-blocked style attribute/cssText write APIs',()=>{
  let joined='';
  for(const file of appFiles){if(fs.existsSync(file))joined+='\n'+fs.readFileSync(file,'utf8');}
  assert.doesNotMatch(joined,/\.setAttribute\s*\(\s*['"]style['"]/i);
  assert.doesNotMatch(joined,/\.style\.cssText\s*=/i);
  assert.doesNotMatch(joined,/\.style\s*=\s*['"]/i);
  assert.match(joined,/\.style\.width\s*=/i,'expected direct runtime style width updates to remain');
});

test('CSP inventory is free of inline script/style forms after attribute extraction',()=>{
  const inventory=buildCspInventory();
  assert.equal(inventory.inline_scripts,0);
  assert.equal(inventory.inline_styles,0);
  assert.equal(inventory.inline_style_attributes,0);
  assert.equal(inventory.eval_like,0);
  assert.deepEqual(inventory.insecure_non_local_urls,[]);
  assert.equal(inventory.blocking_csp_ready,true);
});

test('offline shell and immutable build include extracted style-attribute stylesheet',()=>{
  assert.ok(sw.includes("BASE+'csp-inline-16-style-attributes.css'"));
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-attr-dist-'));
  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const built=path.join(out,'Central-de-Controle-','csp-inline-16-style-attributes.css');
  assert.ok(fs.existsSync(built),'immutable build missing csp-inline-16-style-attributes.css');
  assert.equal(fs.readFileSync(built,'utf8'),css);
  fs.rmSync(out,{recursive:true,force:true});
});
