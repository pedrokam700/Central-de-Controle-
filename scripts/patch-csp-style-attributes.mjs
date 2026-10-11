import fs from 'node:fs';

const INDEX='index.html';
const SW='sw.js';
const CSS='csp-inline-16-style-attributes.css';
const MAP='hardening/csp-inline-style-attribute-map.json';
const TEST='scripts/ames-csp-style-attributes.test.mjs';
const BUILD='15.1.13.48';

const read=file=>fs.readFileSync(file,'utf8');
const write=(file,text)=>fs.writeFileSync(file,text);
const replaceOnce=(text,from,to,label)=>{
  const first=text.indexOf(from);
  if(first<0)throw new Error(`missing anchor: ${label}`);
  if(text.indexOf(from,first+from.length)>=0)throw new Error(`duplicate anchor: ${label}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
};

if(fs.existsSync(CSS))throw new Error(`${CSS} already exists`);
if(fs.existsSync(MAP))throw new Error(`${MAP} already exists`);
if(fs.existsSync(TEST))throw new Error(`${TEST} already exists`);

let html=read(INDEX);
const attrRe=/\sstyle\s*=\s*(["'])(.*?)\1/gis;
const matches=[...html.matchAll(attrRe)];
if(matches.length!==45)throw new Error(`expected 45 inline style attributes, found ${matches.length}`);

const rows=[];
let cursor=0;
let out='';
for(let i=0;i<matches.length;i++){
  const match=matches[i];
  const token=`csp-${String(i+1).padStart(3,'0')}`;
  const style=match[2];
  if(!style.trim())throw new Error(`empty style attribute at ${token}`);
  out+=html.slice(cursor,match.index)+` data-csp-inline-style="${token}"`;
  cursor=match.index+match[0].length;
  const line=html.slice(0,match.index).split('\n').length;
  rows.push({token,line,style});
}
out+=html.slice(cursor);
html=out;
if(/\sstyle\s*=\s*(["']).*?\1/is.test(html))throw new Error('inline style attribute remained after extraction');
if((html.match(/data-csp-inline-style=/g)||[]).length!==45)throw new Error('unexpected extracted style token count');

const link=`  <link rel="stylesheet" href="/Central-de-Controle-/${CSS}?v=${BUILD}" data-extracted-style="inline-style-attributes">\n`;
const headAnchor=`<link rel="stylesheet" href="./ames/product.css?v=${BUILD}">\n</head>`;
html=replaceOnce(html,headAnchor,`<link rel="stylesheet" href="./ames/product.css?v=${BUILD}">\n${link}</head>`,'CSP attribute stylesheet insertion');
write(INDEX,html);

// Four impossible-ID :is() sentinels contribute high author-selector specificity without
// !important. Runtime element.style.property assignments still outrank this stylesheet,
// preserving current dynamic widths/positions/visibility updates.
const authority=':is(#__csp_inline_authority_a__, *):is(#__csp_inline_authority_b__, *):is(#__csp_inline_authority_c__, *):is(#__csp_inline_authority_d__, *)';
const css=rows.map(row=>`${authority}[data-csp-inline-style="${row.token}"]{${row.style}}`).join('\n')+'\n';
write(CSS,css);
write(MAP,JSON.stringify({schema:'central-csp-inline-style-attribute-map-v1',count:rows.length,stylesheet:CSS,build:BUILD,rows},null,2)+'\n');

let sw=read(SW);
const swAnchor="BASE+'styles.css'";
sw=replaceOnce(sw,swAnchor,`BASE+'${CSS}',${swAnchor}`,'service worker inline-attribute stylesheet precache');
write(SW,sw);

write(TEST,`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCspInventory} from './csp-inventory.mjs';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('${CSS}','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const map=JSON.parse(fs.readFileSync('${MAP}','utf8'));
const appFiles=['app.js',...['ames','core'].flatMap(root=>fs.existsSync(root)?fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&/\\.m?js$/i.test(entry.name)).map(entry=>path.join(entry.parentPath||entry.path,entry.name)):[])];

test('all 45 static style attributes are externalized with one-to-one tokens',()=>{
  assert.equal(map.count,45);
  assert.equal(map.rows.length,45);
  assert.equal((html.match(/\\sstyle\\s*=\\s*([\"']).*?\\1/gis)||[]).length,0);
  assert.equal((html.match(/data-csp-inline-style=/g)||[]).length,45);
  assert.ok(html.includes('${CSS}?v=${BUILD}'));
  for(const row of map.rows){
    assert.ok(html.includes('data-csp-inline-style="'+row.token+'"'),row.token+' missing from HTML');
    assert.ok(css.includes('[data-csp-inline-style="'+row.token+'"]{'+row.style+'}'),row.token+' mapping changed');
  }
});

test('runtime has no CSP-blocked style attribute/cssText write APIs',()=>{
  let joined='';
  for(const file of appFiles){if(fs.existsSync(file))joined+='\\n'+fs.readFileSync(file,'utf8');}
  assert.doesNotMatch(joined,/\\.setAttribute\\s*\\(\\s*['\"]style['\"]/i);
  assert.doesNotMatch(joined,/\\.style\\.cssText\\s*=/i);
  assert.doesNotMatch(joined,/\\.style\\s*=\\s*['\"]/i);
  assert.match(joined,/\\.style\\.width\\s*=/i,'expected direct runtime style width updates to remain');
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
  assert.ok(sw.includes("BASE+'${CSS}'"));
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-attr-dist-'));
  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const built=path.join(out,'Central-de-Controle-','${CSS}');
  assert.ok(fs.existsSync(built),'immutable build missing ${CSS}');
  assert.equal(fs.readFileSync(built,'utf8'),css);
  fs.rmSync(out,{recursive:true,force:true});
});
`);

console.log(JSON.stringify({inline_style_attributes_before:45,inline_style_attributes_after:0,stylesheet:CSS,map:MAP},null,2));
