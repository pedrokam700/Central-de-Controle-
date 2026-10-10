import fs from 'node:fs';
import path from 'node:path';

const out=path.resolve(process.env.CENTRAL_STATIC_OUT||'dist');
const names=['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'];
const allowed=/\.(mjs|css|svg|png|json)$/;

function collect(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const name=path.posix.join(dir,entry.name);
    if(entry.isDirectory())collect(name);
    else if(allowed.test(entry.name))names.push(name);
  }
}

function deployedIndex(source){
  const appTag='<script type="module" src="/Central-de-Controle-/app.js?v=15.1.13.48"></script>';
  const bootstrapTag='<script type="module" src="/Central-de-Controle-/offline-bootstrap.mjs?v=15.1.13.48"></script>';
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
  if(name==='index.html')fs.writeFileSync(target,deployedIndex(fs.readFileSync(name,'utf8')));
  else if(name==='app.js')fs.writeFileSync(target,deployedApp(fs.readFileSync(name,'utf8')));
  else fs.copyFileSync(name,target);
}
// Entrada raiz é um arquivo real, não um redirect/rewrite do provedor. Isso evita
// conflitos com Pretty URLs/canonicalização e mantém a Central no base path único.
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),rootEntry());
const sha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.COMMIT||process.env.GITHUB_SHA||null;
const branch=process.env.VERCEL_GIT_COMMIT_REF||process.env.BRANCH||process.env.GITHUB_REF_NAME||null;
const provider=process.env.VERCEL?'vercel':process.env.NETLIFY?'netlify':process.env.GITHUB_ACTIONS?'github-actions':'unknown';
fs.writeFileSync(path.join(out,'release-build.json'),JSON.stringify({sha,branch,provider,build:'15.1.13.48',project:'central-cora-v2'}));
console.log('Native integrated static assets:',new Set(names).size,'deployment sha:',sha||'unavailable');