import fs from 'node:fs';
import path from 'node:path';

const out=path.resolve('dist');
const names=['index.html','app.js','styles.css','mobile.css','sw.js','manifest.webmanifest'];
const allowed=/\.(mjs|css|svg|png|json)$/;

function collect(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const name=path.posix.join(dir,entry.name);
    if(entry.isDirectory())collect(name);
    else if(allowed.test(entry.name))names.push(name);
  }
}

collect('ames');
collect('icons');
for(const name of [...new Set(names)]){
  const target=path.join(out,'Central-de-Controle-',name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(name,target);
}
fs.writeFileSync(path.join(out,'release-build.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA||null,build:'15.1.13.48',project:'central-cora-v2'}));
console.log('Native integrated static assets:',new Set(names).size);
