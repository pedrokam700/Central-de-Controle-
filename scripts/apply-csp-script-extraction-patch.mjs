import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let index=fs.readFileSync('index.html','utf8');
const guardMatch=[...index.matchAll(/<script id="cora-build-guard">([\s\S]*?)<\/script>/g)];
if(guardMatch.length!==1)throw new Error(`Expected one cora-build-guard inline script, found ${guardMatch.length}`);
const guardBody=guardMatch[0][1].replace(/^\n/,'').replace(/\n$/,'')+'\n';
fs.writeFileSync('cora-build-guard.js',guardBody);
index=replaceExactly(
  index,
  guardMatch[0][0],
  '<script id="cora-build-guard" src="/Central-de-Controle-/cora-build-guard.js?v=15.1.13.48"></script>',
  'source build guard'
);
fs.writeFileSync('index.html',index);

const runtimeGuard=`(()=>{\n  const form=document.querySelector('#loginForm');\n  const status=document.querySelector('#authLoginStatus');\n  const button=document.querySelector('#loginButton');\n  if(!form)return;\n  const fail=()=>{\n    if(window.__centralLoginModuleReady)return false;\n    if(status){status.textContent='A aplicação não carregou completamente neste preview. Recarregue a página ou use um deploy validado.';status.className='auth-status error';}\n    if(button){button.disabled=true;button.textContent='Aplicação indisponível';}\n    return true;\n  };\n  form.addEventListener('submit',event=>{if(fail()){event.preventDefault();event.stopImmediatePropagation();}},true);\n  setTimeout(fail,5000);\n})();\n`;
fs.writeFileSync('central-runtime-boot-guard.js',runtimeGuard);
fs.writeFileSync('root-entry.js',"location.replace('/Central-de-Controle-/'+location.search+location.hash);\n");

let build=fs.readFileSync('scripts/build-static.mjs','utf8');
build=replaceExactly(
  build,
  "const names=['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];",
  "const names=['index.html','app.js','cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];",
  'static root assets'
);
const oldBoot=`  const bootGuard=\`<script id="central-runtime-boot-guard">\\n(()=>{\\n  const form=document.querySelector('#loginForm');\\n  const status=document.querySelector('#authLoginStatus');\\n  const button=document.querySelector('#loginButton');\\n  if(!form)return;\\n  const fail=()=>{\\n    if(window.__centralLoginModuleReady)return false;\\n    if(status){status.textContent='A aplicação não carregou completamente neste preview. Recarregue a página ou use um deploy validado.';status.className='auth-status error';}\\n    if(button){button.disabled=true;button.textContent='Aplicação indisponível';}\\n    return true;\\n  };\\n  form.addEventListener('submit',event=>{if(fail()){event.preventDefault();event.stopImmediatePropagation();}},true);\\n  setTimeout(fail,5000);\\n})();\\n</script>\`;\n  return source.replace(appTag,bootGuard+'\\n'+bootstrapTag);`;
const newBoot=`  const bootGuardTag='<script id="central-runtime-boot-guard" src="/Central-de-Controle-/central-runtime-boot-guard.js?v=15.1.13.48"></script>';\n  return source.replace(appTag,bootGuardTag+'\\n'+bootstrapTag);`;
build=replaceExactly(build,oldBoot,newBoot,'deployed runtime boot guard');
build=replaceExactly(
  build,
  "<script>location.replace('/Central-de-Controle-/'+location.search+location.hash);</script>",
  '<script src="/Central-de-Controle-/root-entry.js?v=15.1.13.48"></script>',
  'root redirect script'
);
fs.writeFileSync('scripts/build-static.mjs',build);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(
  sw,
  "BASE+'index.html',BASE+'offline-bootstrap.mjs',BASE+'app.js',",
  "BASE+'index.html',BASE+'offline-bootstrap.mjs',BASE+'app.js',BASE+'cora-build-guard.js',BASE+'central-runtime-boot-guard.js',BASE+'root-entry.js',",
  'service worker guard assets'
);
fs.writeFileSync('sw.js',sw);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\nimport {spawnSync} from 'node:child_process';\nimport {buildCspInventory} from './csp-inventory.mjs';\n\nconst sourceIndex=fs.readFileSync('index.html','utf8');\nconst buildScript=fs.readFileSync('scripts/build-static.mjs','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\nconst inlineScripts=html=>[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)].filter(m=>!(/\\bsrc\\s*=/.test(m[1]||'')));\n\ntest('source index has no inline script blocker and keeps parser-blocking external build guard',()=>{\n  const inventory=buildCspInventory();\n  assert.equal(inventory.inline_scripts,0);\n  assert.equal(inventory.eval_like,0);\n  assert.deepEqual(inventory.insecure_non_local_urls,[]);\n  assert.equal(inventory.blocking_csp_ready,true);\n  assert.equal(inlineScripts(sourceIndex).length,0);\n  assert.match(sourceIndex,/<script id="cora-build-guard" src="\\/Central-de-Controle-\\/cora-build-guard\\.js\\?v=15\\.1\\.13\\.48"><\\/script>/);\n});\n\ntest('build and offline shell include all external guard scripts',()=>{\n  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js']){\n    assert.ok(fs.existsSync(name),name);\n    assert.ok(buildScript.includes(\`'\${name}'\`),\`build missing \${name}\`);\n    assert.ok(sw.includes(\`BASE+'\${name}'\`),\`SW missing \${name}\`);\n  }\n  assert.doesNotMatch(buildScript,/const bootGuard=\\`<script/);\n  assert.doesNotMatch(buildScript,/<script>location\\.replace/);\n});\n\ntest('built base page and root entry contain zero inline scripts',()=>{\n  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-csp-dist-'));\n  const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,GITHUB_SHA:'0123456789abcdef0123456789abcdef01234567',GITHUB_REF_NAME:'hardening/p0-production-readiness'}});\n  assert.equal(run.status,0,run.stderr||run.stdout);\n  const baseIndex=fs.readFileSync(path.join(out,'Central-de-Controle-','index.html'),'utf8');\n  const rootIndex=fs.readFileSync(path.join(out,'index.html'),'utf8');\n  assert.equal(inlineScripts(baseIndex).length,0);\n  assert.equal(inlineScripts(rootIndex).length,0);\n  assert.match(baseIndex,/central-runtime-boot-guard\\.js\\?v=15\\.1\\.13\\.48/);\n  assert.match(rootIndex,/root-entry\\.js\\?v=15\\.1\\.13\\.48/);\n  for(const name of ['cora-build-guard.js','central-runtime-boot-guard.js','root-entry.js'])assert.ok(fs.existsSync(path.join(out,'Central-de-Controle-',name)),name);\n  fs.rmSync(out,{recursive:true,force:true});\n});\n`;
fs.writeFileSync('scripts/ames-csp-script-extraction.test.mjs',test);

console.log('PASS deterministic CSP script extraction patch');
