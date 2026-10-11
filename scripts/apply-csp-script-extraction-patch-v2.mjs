import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}
function replaceBounded(source,startText,endText,replacement,label){
  const start=source.indexOf(startText);
  if(start<0)throw new Error(`${label}: start anchor not found`);
  if(source.indexOf(startText,start+startText.length)>=0)throw new Error(`${label}: start anchor is not unique`);
  const end=source.indexOf(endText,start);
  if(end<0)throw new Error(`${label}: end anchor not found`);
  if(source.indexOf(endText,end+endText.length)>=0)throw new Error(`${label}: end anchor is not unique`);
  return source.slice(0,start)+replacement+source.slice(end+endText.length);
}

let index=fs.readFileSync('index.html','utf8');
const guardMatch=[...index.matchAll(/<script id="cora-build-guard">([\s\S]*?)<\/script>/g)];
if(guardMatch.length!==1)throw new Error(`Expected one cora-build-guard inline script, found ${guardMatch.length}`);
const guardBody=guardMatch[0][1].replace(/^\n/,'').replace(/\n$/,'')+'\n';
if(!guardBody.includes("const BUILD='15.1.13.48';")||!guardBody.includes('serviceWorker.getRegistrations'))throw new Error('Unexpected source build guard body');
fs.writeFileSync('cora-build-guard.js',guardBody);
index=replaceExactly(index,guardMatch[0][0],'<script id="cora-build-guard" src="/Central-de-Controle-/cora-build-guard.js?v=15.1.13.48"></script>','source build guard');
fs.writeFileSync('index.html',index);

const runtimeGuard=[
"(()=>{",
"  const form=document.querySelector('#loginForm');",
"  const status=document.querySelector('#authLoginStatus');",
"  const button=document.querySelector('#loginButton');",
"  if(!form)return;",
"  const fail=()=>{",
"    if(window.__centralLoginModuleReady)return false;",
"    if(status){status.textContent='A aplicação não carregou completamente neste preview. Recarregue a página ou use um deploy validado.';status.className='auth-status error';}",
"    if(button){button.disabled=true;button.textContent='Aplicação indisponível';}",
"    return true;",
"  };",
"  form.addEventListener('submit',event=>{if(fail()){event.preventDefault();event.stopImmediatePropagation();}},true);",
"  setTimeout(fail,5000);",
"})();",
""
].join('\n');
fs.writeFileSync('central-runtime-boot-guard.js',runtimeGuard);
fs.writeFileSync('root-entry.js',"location.replace('/Central-de-Controle-/'+location.search+location.hash);\n");

let build=fs.readFileSync('scripts/build-static.mjs','utf8');
build=replaceExactly(build,"const names=['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];","const names=['index.html','app.js','cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];",'static root assets');
const bootStart='  const bootGuard=`<script id="central-runtime-boot-guard">';
const bootEnd="  return source.replace(appTag,bootGuard+'\\n'+bootstrapTag);";
const bootStartIndex=build.indexOf(bootStart);
const bootEndIndex=build.indexOf(bootEnd,bootStartIndex);
if(bootStartIndex<0||bootEndIndex<0)throw new Error('deployed runtime guard structural anchors not found');
const bootSegment=build.slice(bootStartIndex,bootEndIndex+bootEnd.length);
for(const expected of ['window.__centralLoginModuleReady','setTimeout(fail,5000)','Aplicação indisponível'])if(!bootSegment.includes(expected))throw new Error('unexpected deployed runtime guard segment: '+expected);
build=replaceBounded(build,bootStart,bootEnd,"  const bootGuardTag='<script id=\"central-runtime-boot-guard\" src=\"/Central-de-Controle-/central-runtime-boot-guard.js?v=15.1.13.48\"></script>';\n  return source.replace(appTag,bootGuardTag+'\\n'+bootstrapTag);",'deployed runtime boot guard');
build=replaceExactly(build,"<script>location.replace('/Central-de-Controle-/'+location.search+location.hash);</script>",'<script src="/Central-de-Controle-/root-entry.js?v=15.1.13.48"></script>','root redirect script');
fs.writeFileSync('scripts/build-static.mjs',build);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(sw,"BASE+'index.html',BASE+'offline-bootstrap.mjs',BASE+'app.js',","BASE+'index.html',BASE+'offline-bootstrap.mjs',BASE+'app.js',BASE+'cora-build-guard.js',BASE+'central-runtime-boot-guard.js',BASE+'root-entry.js',",'service worker guard assets');
fs.writeFileSync('sw.js',sw);

const test=[
"import test from 'node:test';",
"import assert from 'node:assert/strict';",
"import fs from 'node:fs';",
"import os from 'node:os';",
"import path from 'node:path';",
"import {spawnSync} from 'node:child_process';",
"import {buildCspInventory} from './csp-inventory.mjs';",
"",
"const sourceIndex=fs.readFileSync('index.html','utf8');",
"const buildScript=fs.readFileSync('scripts/build-static.mjs','utf8');",
"const sw=fs.readFileSync('sw.js','utf8');",
"const inlineScripts=html=>[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)].filter(m=>!(/\\bsrc\\s*=/.test(m[1]||'')));",
"",
"test('source index has no inline script blocker and keeps parser-blocking external build guard',()=>{",
"  const inventory=buildCspInventory();",
"  assert.equal(inventory.inline_scripts,0);",
"  assert.equal(inventory.eval_like,0);",
"  assert.deepEqual(inventory.insecure_non_local_urls,[]);",
"  assert.equal(inventory.blocking_csp_ready,true);",
"  assert.equal(inlineScripts(sourceIndex).length,0);",
"  assert.match(sourceIndex,/<script id=\"cora-build-guard\" src=\"\\/Central-de-Controle-\\/cora-build-guard\\.js\\?v=15\\.1\\.13\\.48\"><\\/script>/);",
"});",
"",
"test('build and offline shell include all external guard scripts',()=>{",
"  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js']){",
"    assert.ok(fs.existsSync(name),name);",
"    assert.ok(buildScript.includes(\"'\"+name+\"'\"),'build missing '+name);",
"    assert.ok(sw.includes(\"BASE+'\"+name+\"'\"),'SW missing '+name);",
"  }",
"  assert.equal(buildScript.includes('const bootGuard='+String.fromCharCode(96)+'<script'),false);",
"  assert.equal(buildScript.includes('<script>location.replace'),false);",
"});",
"",
"test('built base page and root entry contain zero inline scripts',()=>{",
"  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-dist-'));",
"  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});",
"  assert.equal(run.status,0,run.stderr||run.stdout);",
"  const baseIndex=fs.readFileSync(path.join(out,'Central-de-Controle-','index.html'),'utf8');",
"  const rootIndex=fs.readFileSync(path.join(out,'index.html'),'utf8');",
"  assert.equal(inlineScripts(baseIndex).length,0);",
"  assert.equal(inlineScripts(rootIndex).length,0);",
"  assert.match(baseIndex,/central-runtime-boot-guard\\.js\\?v=15\\.1\\.13\\.48/);",
"  assert.match(rootIndex,/root-entry\\.js\\?v=15\\.1\\.13\\.48/);",
"  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js'])assert.ok(fs.existsSync(path.join(out,'Central-de-Controle-',name)),name);",
"  fs.rmSync(out,{recursive:true,force:true});",
"});",
""
].join('\n');
fs.writeFileSync('scripts/ames-csp-script-extraction.test.mjs',test);
console.log('PASS deterministic CSP script extraction patch V2');
