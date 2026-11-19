import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha=process.env.COMMIT||process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null;
const out=path.resolve(process.env.CENTRAL_STATIC_OUT||'dist');
const names=['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];
// Nested HTML routes (e.g. the isolated AT viewer) are genuine application
// entrypoints and must survive a static/offline build as real files.
const allowed=/\.(mjs|css|svg|png|json|html)$/;

// Ship the SAME approved SDK/parser versions; only module locations change.
// No credential, Auth behavior or Firebase project is changed by this closure.
const browserRoot='vendor/browser';
const browserInputs=JSON.parse(fs.readFileSync(browserRoot+'/manifest.json','utf8'));
const expectedBrowserFiles=['firebase/10.8.0/firebase-app.js','firebase/10.8.0/firebase-auth.js','firebase/10.8.0/firebase-firestore.js','firebase/10.8.0/LICENSE.txt','sheetjs/0.20.3/xlsx.full.min.js','sheetjs/0.20.3/LICENSE.txt'];
if(JSON.stringify(browserInputs.files.map(x=>x.path))!==JSON.stringify(expectedBrowserFiles))throw Error('Browser dependency inventory changed without review');
function localBrowserImports(source){
  return source.replaceAll('https://www.gstatic.com/firebasejs/10.8.0/','/Central-de-Controle-/vendor/browser/firebase/10.8.0/')
    .replaceAll('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','/Central-de-Controle-/vendor/browser/sheetjs/0.20.3/xlsx.full.min.js');
}
const packagedBrowserFiles=browserInputs.files.map(entry=>{
  const file=browserRoot+'/'+entry.path,bytes=fs.readFileSync(file);
  if(!fs.lstatSync(file).isFile()||bytes.length!==entry.size||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Unverified browser dependency: '+entry.path);
  names.push(file);
  const output=entry.kind==='javascript'?Buffer.from(localBrowserImports(bytes.toString('utf8'))):bytes;
  return {...entry,source_sha256:entry.sha256,packaged_sha256:createHash('sha256').update(output).digest('hex'),transform:entry.kind==='javascript'?'SAME_ORIGIN_IMPORT_LOCATIONS_ONLY':'NONE'};
});
names.push(browserRoot+'/manifest.json');

function collect(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const name=path.posix.join(dir,entry.name);
    if(entry.isDirectory()&&!['agent','factory-engine'].includes(entry.name))collect(name);
    else if(allowed.test(entry.name))names.push(name);
  }
}

function deployedIndex(source){
  const appTag='<script type="module" src="/Central-de-Controle-/app.js?v=15.1.13.54"></script>';
  const bootstrapTag='<script type="module" src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.54"></script>';
  if(!source.includes(appTag))throw new Error('Tag canônica de app.js não encontrada no index.html');
  const bootGuard=`<script id="central-runtime-boot-guard">\n(()=>{\n  const form=document.querySelector('#loginForm');\n  const status=document.querySelector('#authLoginStatus');\n  const button=document.querySelector('#loginButton');\n  if(!form)return;\n  const fail=()=>{\n    if(window.__centralLoginModuleReady)return false;\n    if(status){status.textContent='A aplicação não carregou completamente neste preview. Recarregue a página ou use um deploy validado.';status.className='auth-status error';}\n    if(button){button.disabled=true;button.textContent='Aplicação indisponível';}\n    return true;\n  };\n  form.addEventListener('submit',event=>{if(fail()){event.preventDefault();event.stopImmediatePropagation();}},true);\n  setTimeout(fail,5000);\n})();\n</script>`;
  return source.replace(appTag,bootGuard+'\n'+bootstrapTag);
}

function deployedApp(source){
  const oldImport='import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";';
  const newImport='import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";';
  const oldInit='const app = initializeApp(firebaseConfig);';
  const newInit='const app = getApps().length ? getApp() : initializeApp(firebaseConfig);';
  if(!source.includes(oldImport)||!source.includes(oldInit))throw new Error('Bootstrap Firebase canônico não encontrado em app.js');
  return source.replace(oldImport,newImport).replace(oldInit,newInit);
}

function rootEntry(){
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex">\n<title>Central de Controle</title>\n<meta http-equiv="refresh" content="0; url=/Central-de-Controle-/">\n</head>\n<body>\n<p>Abrindo a Central… <a href="/Central-de-Controle-/">Continuar</a></p>\n<script>location.replace('/Central-de-Controle-/'+location.search+location.hash);</script>\n</body>\n</html>\n`;
}

collect('ames');
collect('core');
collect('icons');
for(const name of [...new Set(names)]){
  const target=path.join(out,'Central-de-Controle-',name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(name==='index.html')fs.writeFileSync(target,localBrowserImports(deployedIndex(fs.readFileSync(name,'utf8'))));
  else if(name==='app.js')fs.writeFileSync(target,localBrowserImports(deployedApp(fs.readFileSync(name,'utf8'))));
  else if(name==='sw.js'){
    const source=fs.readFileSync(name,'utf8');
    if(!/^const CACHE_REVISION=[^;]+;/m.test(source))throw new Error('Service worker sem revisão de cache');
    let output=localBrowserImports(source.replace(/^const CACHE_REVISION=[^;]+;/m,'const CACHE_REVISION='+JSON.stringify(sha||'integration-20261019-pr38')+';'));
    const end='\n]);\n\nasync function precache';
    if(!output.includes(end))throw Error('Firebase worker dependency boundary changed');
    output=output.replace(end,'\n].map(url=>new URL(url,self.location.origin).href));\n\nasync function precache');
    output=output.replace('const FIREBASE_SDK=Object.freeze([',"ASSETS.push(BASE+'vendor/browser/sheetjs/0.20.3/xlsx.full.min.js');\nconst FIREBASE_SDK=Object.freeze([");
    fs.writeFileSync(target,output);
  }
  else if(/\.(?:js|mjs)$/.test(name))fs.writeFileSync(target,localBrowserImports(fs.readFileSync(name,'utf8')));
  else fs.copyFileSync(name,target);
}
fs.writeFileSync(path.join(out,'Central-de-Controle-',browserRoot,'manifest.json'),JSON.stringify({...browserInputs,files:packagedBrowserFiles},null,2));
// Entrada raiz é um arquivo real, não um redirect/rewrite do provedor. Isso evita
// conflitos com Pretty URLs/canonicalização e mantém a Central no base path único.
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),rootEntry());
const branch=process.env.VERCEL_GIT_COMMIT_REF||process.env.BRANCH||process.env.GITHUB_REF_NAME||null;
const provider=process.env.VERCEL?'vercel':process.env.NETLIFY?'netlify':process.env.GITHUB_ACTIONS?'github-actions':'unknown';
fs.writeFileSync(path.join(out,'release-build.json'),JSON.stringify({sha,branch,provider,build:'15.1.13.54',project:'central-cora-v2'}));
console.log('Native integrated static assets:',new Set(names).size,'deployment sha:',sha||'unavailable');
