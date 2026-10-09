// Publish only committed browser assets; never package agent/data/credentials.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const repo=process.cwd(),stage=path.resolve(process.argv[2]||'../production-native-v2');
if(fs.existsSync(stage))throw Error('Use a new staging directory');
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,...args],{cwd:repo});
if(git('status','--porcelain').toString().trim())throw Error('Commit pending work before staging');
const sha=git('rev-parse','HEAD').toString().trim();
const names=git('ls-tree','-r','--name-only',sha).toString().trim().split('\n').filter(f=>['index.html','app.js','styles.css','mobile.css','sw.js','manifest.webmanifest'].includes(f)||f.startsWith('icons/')||/^ames\/.+\.(mjs|css)$/.test(f)||f==='ames/releases/latest/release.json');
const out=path.join(stage,'.vercel/output'),overrides={};
for(const name of names){const file=path.join(out,'static/Central-de-Controle-',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,git('show',`${sha}:${name}`));if(name.endsWith('.mjs'))overrides['Central-de-Controle-/'+name]={contentType:'text/javascript; charset=utf-8'};}
fs.writeFileSync(path.join(out,'static/release-build.json'),JSON.stringify({sha,build:'15.1.13.48',project:'central-cora-v2'}));
fs.writeFileSync(path.join(out,'config.json'),JSON.stringify({version:3,routes:[
 {src:'/(.*)',headers:{'X-Central-Commit':sha,'X-Central-Build':'15.1.13.48'},continue:true},
 {src:'/',status:307,headers:{Location:'/Central-de-Controle-/'}},
 {src:'/Central-de-Controle-',status:307,headers:{Location:'/Central-de-Controle-/'}},
 {src:'/Central-de-Controle-/',dest:'/Central-de-Controle-/index.html'},
 {src:'/Central-de-Controle-/(?:sw\\.js|index\\.html)',headers:{'Cache-Control':'no-cache'},continue:true},
 {handle:'filesystem'}],overrides},null,2));
fs.writeFileSync(path.join(stage,'.vercel/project.json'),JSON.stringify({projectId:'prj_SQUu2HXxyrtxAC8jv8wgnxZsbDJI',orgId:'team_UINddVtp80E0jYfiE2vbIhx6',projectName:'central-cora-v2'}));
console.log(JSON.stringify({stage,sha,files:names.length}));
