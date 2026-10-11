import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));

const pkg=json('package.json');
const latest=json('ames/releases/latest/release.json');
const hardened=read('ames/agent/agent_hardened_entry.py');
const launcher=read('tools/ames-workstation/START_AGENT_CANONICAL.ps1');
const build=read('scripts/build-static.mjs');
const index=read('index.html');
const offline=read('offline-bootstrap.mjs');

function capture(text,regex,label){
  const match=text.match(regex);
  assert.ok(match,`${label} ausente`);
  return match[1];
}

test('release candidata do agente coincide com manifesto latest',()=>{
  const candidate=capture(hardened,/HARDENED_CANDIDATE_VERSION\s*=\s*["']([^"']+)["']/,'HARDENED_CANDIDATE_VERSION');
  assert.equal(candidate,latest.version,'versão do agente hardened divergiu do release latest');
  assert.match(launcher,/agent_hardened_entry\.py/i,'launcher deixou de usar o entrypoint hardened');
});

test('identidade do produto e release permanecem explicitamente separadas',()=>{
  assert.equal(pkg.version,'2.0.0-preview');
  assert.equal(latest.minimum_central_version,'2.0.0');
  assert.equal(latest.candidate_status,'code_ready_factory_package_pending');
});

test('build do frontend é único entre shell, bootstrap e artefato estático',()=>{
  const shellBuild=capture(index,/const\s+BUILD\s*=\s*["']([^"']+)["']/,'index BUILD');
  const bootstrapBuild=capture(offline,/const\s+BUILD\s*=\s*["']([^"']+)["']/,'offline bootstrap BUILD');
  assert.equal(bootstrapBuild,shellBuild,'offline bootstrap usa build diferente do shell');
  assert.ok(build.includes(`build:'${shellBuild}'`)||build.includes(`build: '${shellBuild}'`),'build-static não publica o BUILD canônico');
});

test('package root não introduz dependências de runtime',()=>{
  assert.equal(pkg.private,true);
  assert.ok(!pkg.dependencies||Object.keys(pkg.dependencies).length===0,'dependências de runtime inesperadas no root');
  assert.ok(!pkg.devDependencies||Object.keys(pkg.devDependencies).length===0,'testes root devem continuar sem npm install obrigatório');
});
