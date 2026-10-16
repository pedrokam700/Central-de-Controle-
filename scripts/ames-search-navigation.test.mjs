import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const app=fs.readFileSync('app.js','utf8');
const workflow=fs.readFileSync('.github/workflows/ames-integrated-quality.yml','utf8');

const syntax=spawnSync(process.execPath,['--check','app.js'],{encoding:'utf8'});
assert.equal(syntax.status,0,`app.js deve permanecer sintaticamente válido: ${syntax.stderr||syntax.stdout}`);

assert.ok(app.includes('function navigateSearchRoutine(routine)'),'a busca deve navegar para rotinas sem depender de patch temporário');
assert.ok(app.includes('function navigateSearchPerson(user)'),'a busca deve navegar para pessoas sem depender de patch temporário');
assert.ok(app.includes("users.filter(u=>u.disabled!==true&&match(u.name,u.email,u.role))"),'pessoas ativas devem continuar pesquisáveis');
assert.ok(app.includes("const routines=state.routineTemplates.filter(r=>match(r.name,r.description,r.checklistTemplate));"),'rotinas devem continuar na busca global');
assert.ok(app.includes("show('flow');openFlowDetail(f.id)"),'resultados de fluxo devem abrir a área correta');

assert.ok(!workflow.includes('search-navigation-patch-once'),'o Full Quality não pode manter job temporário que autoedita a branch');
assert.ok(!workflow.includes('apply-central-search-navigation.mjs'),'o workflow definitivo não pode depender do helper temporário');
assert.ok(workflow.includes('contents: read'),'o workflow definitivo deve operar com permissão mínima de leitura do repositório');
assert.equal(fs.existsSync('scripts/apply-central-search-navigation.mjs'),false,'o helper temporário de patch deve ser removido do produto');

console.log('ames-search-navigation: ok');