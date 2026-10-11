import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const canonical='/Central-de-Controle-/';
const inlineScripts=html=>[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]||'')));

test('Netlify não usa redirect HTTP nem Pretty URLs no preview',()=>{
  const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const netlify=fs.readFileSync('netlify.toml','utf8');
  assert.equal(vercel.outputDirectory,'dist');
  assert(vercel.redirects.some(r=>r.source==='/'&&r.destination===canonical));
  assert.match(netlify,/publish\s*=\s*"dist"/);
  assert.match(netlify,/\[build\.processing\.html\][\s\S]*pretty_urls\s*=\s*false/);
  assert.doesNotMatch(netlify,/\[\[redirects\]\]/);
});

test('build estático publica entrada raiz real e Central no base path',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'central-static-'));
  try{
    const run=spawnSync(process.execPath,['scripts/build-static.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,CENTRAL_STATIC_OUT:out,COMMIT:'TEST-SHA',BRANCH:'test'}});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const base=path.join(out,'Central-de-Controle-');
    assert.equal(fs.existsSync(path.join(out,'index.html')),true);
    assert.equal(fs.existsSync(path.join(base,'index.html')),true);
    assert.equal(fs.existsSync(path.join(base,'app.js')),true);
    assert.equal(fs.existsSync(path.join(base,'offline-bootstrap.mjs')),true);
    assert.equal(fs.existsSync(path.join(base,'root-entry.js')),true);
    assert.equal(fs.existsSync(path.join(base,'central-runtime-boot-guard.js')),true);
    const root=fs.readFileSync(path.join(out,'index.html'),'utf8');
    const rootEntry=fs.readFileSync(path.join(base,'root-entry.js'),'utf8');
    const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
    const runtimeGuard=fs.readFileSync(path.join(base,'central-runtime-boot-guard.js'),'utf8');
    const bootstrap=fs.readFileSync(path.join(base,'offline-bootstrap.mjs'),'utf8');
    assert.match(root,/src="\/Central-de-Controle-\/root-entry\.js\?v=15\.1\.13\.48"/);
    assert.match(root,/http-equiv="refresh" content="0; url=\/Central-de-Controle-\/"/);
    assert.equal(inlineScripts(root).length,0,'entrada raiz não pode voltar a injetar script inline');
    assert.match(rootEntry,/location\.replace\('\/Central-de-Controle-\/'\+location\.search\+location\.hash\)/);
    assert.match(html,/id="central-runtime-boot-guard"/);
    assert.match(html,/src="\/Central-de-Controle-\/central-runtime-boot-guard\.js\?v=15\.1\.13\.48"/);
    assert.equal(inlineScripts(html).length,0,'Central publicada não pode voltar a injetar script inline');
    assert.match(runtimeGuard,/window\.__centralLoginModuleReady/);
    assert.match(runtimeGuard,/form\.addEventListener\('submit'/);
    assert.match(runtimeGuard,/event\.preventDefault\(\)/);
    assert.match(html,/src="\/Central-de-Controle-\/offline-bootstrap\.mjs\?v=15\.1\.13\.48"/);
    assert.doesNotMatch(html,/src="\/Central-de-Controle-\/app\.js\?v=15\.1\.13\.48"/);
    assert.match(bootstrap,/initializeFirestore/);
    assert.match(bootstrap,/persistentLocalCache/);
    assert.match(bootstrap,/await import\(`\.\/app\.js\?v=\$\{BUILD\}`\)/);
    const release=JSON.parse(fs.readFileSync(path.join(out,'release-build.json'),'utf8'));
    assert.equal(release.sha,'TEST-SHA');
  }finally{
    fs.rmSync(out,{recursive:true,force:true});
  }
});
