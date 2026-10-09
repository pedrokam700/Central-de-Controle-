import fs from 'node:fs';
import path from 'node:path';

const out=path.resolve('dist');
const names=['index.html','app.js','styles.css','mobile.css','sw.js','manifest.webmanifest','ames/releases/latest/release.json'];
const allowed=/\.(?:mjs|css|svg|png|b64)$/;

function collect(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) collect(full);
    else if(allowed.test(entry.name)) names.push(full.replaceAll('\\','/'));
  }
}

for(const dir of ['ames','icons']) collect(dir);
for(const name of [...new Set(names)]){
  const target=path.join(out,'Central-de-Controle-',name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(name,target);
}
fs.writeFileSync(path.join(out,'release-build.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA||null,build:'15.1.13.48',project:'central-cora-v2'}));
console.log('Native static assets:',new Set(names).size);
