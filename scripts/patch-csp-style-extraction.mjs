import fs from 'node:fs';

const INDEX='index.html';
const BUILD='scripts/build-static.mjs';
const SW='sw.js';
const INVENTORY='scripts/csp-inventory.mjs';
const INVENTORY_TEST='scripts/ames-csp-inventory.test.mjs';
const SCRIPT_TEST='scripts/ames-csp-script-extraction.test.mjs';
const STYLE_TEST='scripts/ames-csp-style-extraction.test.mjs';
const BUILD_VERSION='15.1.13.48';

const read=file=>fs.readFileSync(file,'utf8');
const write=(file,text)=>fs.writeFileSync(file,text);
const replaceOnce=(text,from,to,label)=>{
  const first=text.indexOf(from);
  if(first<0)throw new Error(`missing anchor: ${label}`);
  if(text.indexOf(from,first+from.length)>=0)throw new Error(`duplicate anchor: ${label}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
};
const slug=value=>String(value||'style').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'style';

let html=read(INDEX);
const styleMatches=[...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
if(styleMatches.length!==15)throw new Error(`expected 15 inline style blocks, found ${styleMatches.length}`);

const extracted=[];
for(let i=0;i<styleMatches.length;i++){
  const match=styleMatches[i];
  const attrs=match[1]||'';
  const css=match[2]||'';
  const idMatch=attrs.match(/\bid\s*=\s*(["'])(.*?)\1/i);
  const id=idMatch?.[2]||`style-${i+1}`;
  const filename=`csp-inline-${String(i+1).padStart(2,'0')}-${slug(id)}.css`;
  if(fs.existsSync(filename))throw new Error(`refusing to overwrite existing extracted stylesheet: ${filename}`);
  if(!css.trim())throw new Error(`empty inline stylesheet: ${id}`);
  extracted.push({id,filename,css});
}
if(new Set(extracted.map(item=>item.id)).size!==extracted.length)throw new Error('inline style ids are not unique');
if(new Set(extracted.map(item=>item.filename)).size!==extracted.length)throw new Error('extracted stylesheet filenames are not unique');

// Replace from the end so the original offsets remain valid. Each external stylesheet
// stays at the exact DOM position of the inline block it replaces, preserving cascade order.
for(let i=styleMatches.length-1;i>=0;i--){
  const match=styleMatches[i];
  const item=extracted[i];
  const link=`<link rel="stylesheet" href="/Central-de-Controle-/${item.filename}?v=${BUILD_VERSION}" data-extracted-style="${item.id}">`;
  html=html.slice(0,match.index)+link+html.slice(match.index+match[0].length);
}
if(/<style\b[^>]*>[\s\S]*?<\/style>/i.test(html))throw new Error('inline style block remained after extraction');
for(const item of extracted)write(item.filename,item.css.endsWith('\n')?item.css:item.css+'\n');
write(INDEX,html);

let build=read(BUILD);
const buildAnchor="const names=['index.html','app.js','cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];\n";
const buildReplacement=buildAnchor+"for(const entry of fs.readdirSync('.')){if(/^csp-inline-\\d{2}-[a-z0-9-]+\\.css$/i.test(entry))names.push(entry);}\n";
build=replaceOnce(build,buildAnchor,buildReplacement,'build root extracted styles discovery');
write(BUILD,build);

let sw=read(SW);
const swAnchor="BASE+'styles.css'";
const swStyles=extracted.map(item=>`BASE+'${item.filename}'`).join(',')+','+swAnchor;
sw=replaceOnce(sw,swAnchor,swStyles,'service worker extracted style precache');
write(SW,sw);

let inventory=read(INVENTORY);
inventory=replaceOnce(
  inventory,
  'let inlineScripts=0,inlineStyles=0,evalLike=0,dynamicScripts=0;\n  const evalFiles=[],inlineScriptFiles=[],inlineStyleFiles=[];',
  'let inlineScripts=0,inlineStyles=0,inlineStyleAttributes=0,evalLike=0,dynamicScripts=0;\n  const evalFiles=[],inlineScriptFiles=[],inlineStyleFiles=[],inlineStyleAttributeFiles=[];',
  'inventory style attribute counters'
);
inventory=replaceOnce(
  inventory,
  "      const styles=[...text.matchAll(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi)].length;\n      if(styles){inlineStyles+=styles;inlineStyleFiles.push({file,count:styles});}",
  "      const styles=[...text.matchAll(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi)].length;\n      if(styles){inlineStyles+=styles;inlineStyleFiles.push({file,count:styles});}\n      const styleAttrs=[...text.matchAll(/\\sstyle\\s*=\\s*(?:\"[^\"]*\"|'[^']*')/gi)].length;\n      if(styleAttrs){inlineStyleAttributes+=styleAttrs;inlineStyleAttributeFiles.push({file,count:styleAttrs});}",
  'inventory HTML style attributes'
);
inventory=replaceOnce(
  inventory,
  '    inline_styles:inlineStyles,\n    inline_style_files:inlineStyleFiles,',
  '    inline_styles:inlineStyles,\n    inline_style_files:inlineStyleFiles,\n    inline_style_attributes:inlineStyleAttributes,\n    inline_style_attribute_files:inlineStyleAttributeFiles,',
  'inventory style attribute output'
);
inventory=replaceOnce(
  inventory,
  '    blocking_csp_ready:inlineScripts===0&&evalLike===0&&insecureNonLocal.size===0,',
  '    blocking_csp_ready:inlineScripts===0&&inlineStyles===0&&inlineStyleAttributes===0&&evalLike===0&&insecureNonLocal.size===0,',
  'inventory blocking readiness predicate'
);
write(INVENTORY,inventory);

let inventoryTest=read(INVENTORY_TEST);
inventoryTest=replaceOnce(
  inventoryTest,
  "  const expected=inventory.inline_scripts===0&&inventory.eval_like===0&&inventory.insecure_non_local_urls.length===0;",
  "  const expected=inventory.inline_scripts===0&&inventory.inline_styles===0&&inventory.inline_style_attributes===0&&inventory.eval_like===0&&inventory.insecure_non_local_urls.length===0;",
  'inventory test readiness predicate'
);
inventoryTest=replaceOnce(
  inventoryTest,
  "      inventory.inline_scripts>0||inventory.eval_like>0||inventory.insecure_non_local_urls.length>0,",
  "      inventory.inline_scripts>0||inventory.inline_styles>0||inventory.inline_style_attributes>0||inventory.eval_like>0||inventory.insecure_non_local_urls.length>0,",
  'inventory test blocker predicate'
);
write(INVENTORY_TEST,inventoryTest);

let scriptTest=read(SCRIPT_TEST);
scriptTest=replaceOnce(
  scriptTest,
  "const inlineScripts=html=>[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)].filter(m=>!(/\\bsrc\\s*=/.test(m[1]||'')));",
  "const inlineScripts=html=>[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)].filter(m=>!(/\\bsrc\\s*=/.test(m[1]||'')));\nconst inlineStyles=html=>[...html.matchAll(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi)];",
  'script extraction inline style helper'
);
scriptTest=replaceOnce(
  scriptTest,
  "  assert.equal(inventory.eval_like,0);\n  assert.deepEqual(inventory.insecure_non_local_urls,[]);\n  assert.equal(inventory.blocking_csp_ready,true);",
  "  assert.equal(inventory.inline_styles,0);\n  assert.equal(inventory.eval_like,0);\n  assert.deepEqual(inventory.insecure_non_local_urls,[]);\n  assert.equal(inventory.blocking_csp_ready,inventory.inline_style_attributes===0);",
  'script extraction source readiness assertions'
);
scriptTest=replaceOnce(
  scriptTest,
  "  assert.equal(inlineScripts(baseIndex).length,0);\n  assert.equal(inlineScripts(rootIndex).length,0);",
  "  assert.equal(inlineScripts(baseIndex).length,0);\n  assert.equal(inlineScripts(rootIndex).length,0);\n  assert.equal(inlineStyles(baseIndex).length,0);\n  assert.equal(inlineStyles(rootIndex).length,0);",
  'script extraction built inline style assertions'
);
write(SCRIPT_TEST,scriptTest);

const styleFiles=JSON.stringify(extracted.map(item=>item.filename),null,2);
const styleIds=JSON.stringify(extracted.map(item=>item.id),null,2);
write(STYLE_TEST,`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCspInventory} from './csp-inventory.mjs';

const files=${styleFiles};
const ids=${styleIds};
const sourceIndex=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const links=[...sourceIndex.matchAll(/<link\\b[^>]*data-extracted-style=\"([^\"]+)\"[^>]*href=\"\\/Central-de-Controle-\\/(csp-inline-[^\"?]+\\.css)\\?v=15\\.1\\.13\\.48\"[^>]*>/gi)].map(match=>({id:match[1],file:match[2]}));

test('all former inline style blocks are externalized in original order',()=>{
  assert.equal(files.length,15);
  assert.deepEqual(links.map(item=>item.id),ids);
  assert.deepEqual(links.map(item=>item.file),files);
  assert.equal(new Set(files).size,15);
  assert.equal((sourceIndex.match(/<style\\b/gi)||[]).length,0);
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
  assert.equal((builtIndex.match(/<style\\b/gi)||[]).length,0);
  for(const file of files){
    assert.ok(fs.existsSync(path.join(base,file)),'build missing '+file);
    assert.equal(fs.readFileSync(path.join(base,file),'utf8'),fs.readFileSync(file,'utf8'),'build changed '+file);
  }
  fs.rmSync(out,{recursive:true,force:true});
});
`);

console.log(JSON.stringify({extracted_styles:extracted.map(({id,filename})=>({id,filename})),inline_style_blocks_after:0},null,2));
