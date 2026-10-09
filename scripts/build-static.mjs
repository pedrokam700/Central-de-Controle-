import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve('dist');
const names=['index.html','app.js','styles.css','mobile.css','sw.js','manifest.webmanifest','ames/releases/latest/release.json'];
for(const dir of ['ames','ames/data','icons'])for(const name of fs.readdirSync(dir))if(/\.(mjs|css|svg|png)$/.test(name))names.push(dir+'/'+name);
for(const name of names){const target=path.join(out,'Central-de-Controle-',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(name,target);}
fs.writeFileSync(path.join(out,'release-build.json'),JSON.stringify({sha:process.env.VERCEL_GIT_COMMIT_SHA||null,build:'15.1.13.48',project:'central-cora-v2'}));
console.log('Native static assets:',names.length);
