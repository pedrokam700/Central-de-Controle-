import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd(),stager=path.join(root,'scripts/stage-vercel.mjs');
test('prebuilt publishes the complete canonical login/offline shell from committed sources only',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'central-prebuilt-'));
  const repo=path.join(temp,'repo'),stage=path.join(temp,'stage');
  fs.mkdirSync(repo);
  const git=(...args)=>{
    const result=spawnSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,...args],{cwd:repo,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return result.stdout.trim();
  };
  try{
    for(const name of ['index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest','scripts/build-static.mjs']){
      fs.mkdirSync(path.dirname(path.join(repo,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(repo,name));
    }
    for(const name of ['ames','core','icons'])fs.cpSync(path.join(root,name),path.join(repo,name),{recursive:true,filter:source=>!source.includes(`${path.sep}agent${path.sep}`)&&!source.includes('__pycache__')});
    fs.writeFileSync(path.join(repo,'.gitignore'),'ames/private-runtime.json\n');
    git('init');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','Synthetic stage fixture');
    const sha=git('rev-parse','HEAD');
    fs.writeFileSync(path.join(repo,'ames/private-runtime.json'),'SYNTHETIC_SECRET_NEVER_PUBLISH');
    const run=spawnSync(process.execPath,[stager,stage],{cwd:repo,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const output=path.join(stage,'.vercel/output/static'),base=path.join(output,'Central-de-Controle-');
    for(const name of ['offline-bootstrap.mjs','core/login-navigation.mjs','core/auth-hardening.mjs','ames/console-view.mjs'])assert(fs.existsSync(path.join(base,name)),name);
    assert.match(fs.readFileSync(path.join(base,'index.html'),'utf8'),/central-runtime-boot-guard/);
    assert.match(fs.readFileSync(path.join(base,'index.html'),'utf8'),/src="\/Central-de-Controle-\/offline-bootstrap\.mjs\?v=/);
    assert.match(fs.readFileSync(path.join(base,'app.js'),'utf8'),/getApps\(\)\.length\s*\?\s*getApp\(\)/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output,'release-build.json'),'utf8')).sha,sha);
    assert(!fs.existsSync(path.join(base,'ames/private-runtime.json')));
    assert(!fs.existsSync(path.join(base,'ames/agent/agent.py')));
    assert(!fs.existsSync(path.join(base,'scripts/build-static.mjs')));
    // Verify every relative static import in the published browser modules resolves.
    for(const file of fs.readdirSync(base,{recursive:true}).filter(f=>/\.(mjs|js)$/.test(f))){
      const absolute=path.join(base,file),source=fs.readFileSync(absolute,'utf8');
      for(const [,specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))assert(fs.existsSync(path.resolve(path.dirname(absolute),specifier.split('?')[0])),`${file} imports missing ${specifier}`);
    }
    fs.appendFileSync(path.join(repo,'app.js'),'\n// uncommitted');
    const dirty=spawnSync(process.execPath,[stager,path.join(temp,'dirty-stage')],{cwd:repo,encoding:'utf8'});
    assert.notEqual(dirty.status,0);assert.match(dirty.stderr,/Commit pending work/);
  }finally{
    // temp was created directly by mkdtemp above, outside the source checkout.
    assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
