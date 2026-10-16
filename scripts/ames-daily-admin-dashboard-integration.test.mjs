import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const core=fs.readFileSync('core/daily-admin-insights.mjs','utf8');

const syntax=spawnSync(process.execPath,['--check','app.js'],{encoding:'utf8'});
assert.equal(syntax.status,0,`app.js deve permanecer sintaticamente válido: ${syntax.stderr||syntax.stdout}`);

const importNeedle="import { buildDailyAdminInsights } from './core/daily-admin-insights.mjs';";
assert.equal(app.split(importNeedle).length-1,1,'o núcleo administrativo deve ser importado exatamente uma vez');
assert.ok(app.includes("function renderDailyAdminDashboard()"),'deve continuar usando o Dashboard Administrativo existente');
assert.ok(app.includes("insightHost.id='dailyDashInsights'"),'a leitura cruzada deve ser inserida dentro do dashboard existente');
assert.ok(app.includes('buildDailyAdminInsights({'),'o dashboard deve consumir o núcleo de correlação testável');
assert.ok(app.includes('operationalFailures:state.operationalFailures'),'deve cruzar as falhas operacionais já carregadas pela Central');
assert.ok(app.includes('reports:dashboardProductReports()'),'deve respeitar a fonte única de Reports de produto');
assert.ok(app.includes('activities:state.activities'),'deve cruzar atividades ligadas às execuções');
assert.ok(app.includes('adminHistory:insightHistory'),'deve incluir histórico administrativo no período filtrado');
assert.ok(app.includes("currentLanguage==='en-US'?en:pt"),'a nova superfície deve preservar PT/EN');
assert.ok(app.includes("'Leitura cruzada da operação','Cross-operational view'"),'a leitura cruzada deve ter rótulo humano nos dois idiomas');
assert.ok(app.includes("'Governança e histórico','Governance and history'"),'governança/histórico devem permanecer visíveis');
assert.ok(app.includes("'Rastreabilidade vinculada','Linked traceability'"),'falhas, Reports e atividades vinculados devem permanecer rastreáveis');

assert.ok(sw.includes("BASE+'core/daily-admin-insights.mjs'"),'o módulo novo deve fazer parte do shell offline/CLEAN');
assert.ok(!core.includes("./ames/dashboard-view.mjs")&&!core.includes("./ames/data/dashboard.mjs"),'o dashboard administrativo não pode depender do Dashboard MES');
assert.equal(fs.existsSync('.github/workflows/admin-dashboard-patch-once.yml'),false,'workflow temporário de patch não pode permanecer no produto');
assert.equal(fs.existsSync('scripts/apply-daily-admin-dashboard-integration.mjs'),false,'helper temporário de patch não pode permanecer no produto');

console.log('ames-daily-admin-dashboard-integration: ok');
