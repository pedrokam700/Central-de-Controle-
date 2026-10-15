import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');

const syntax=spawnSync(process.execPath,['--check','app.js'],{encoding:'utf8'});
assert.equal(syntax.status,0,`app.js deve permanecer sintaticamente válido: ${syntax.stderr||syntax.stdout}`);

assert.ok(app.includes('function dailyTourSteps()'),'o tour da Central do Dia deve continuar existindo');
assert.ok(html.includes('data-page="mesConsole"'),'o alvo canônico do A-MES deve continuar sendo o Console MES existente');

const expectedAdminSequence=[
  "#dailyConfigShiftsCard",
  "#dailyConfigScopesCard",
  "#dailyProductionContextCard",
  "#dailyAllocationMatrixCard",
  "#dailyAllocationAdvancedCard",
  "#dailyRoutineConfigCard",
  "#dailyAdminHistoryPanel",
  "#dailyAdminDashboard"
];
let previous=-1;
for(const selector of expectedAdminSequence){
  const pos=app.indexOf(selector);
  assert.ok(pos>previous,`o tour deve preservar a ordem administrativa até ${selector}`);
  previous=pos;
}

const amesStep=app.indexOf("title:t('Continue no A-MES')");
const helpStep=app.indexOf("title:t('Ajuda sempre disponível')",amesStep);
assert.ok(amesStep>previous,'o A-MES deve vir depois do Dashboard operacional');
assert.ok(helpStep>amesStep,'a ajuda/reabertura deve continuar encerrando o guia depois do A-MES');
assert.ok(app.includes("selector:'button[data-page=\\\"mesConsole\\\"]'"),'desktop deve destacar o item real Console MES');
assert.ok(app.includes("mobileSelector:'#mobileMenuToggle'"),'mobile deve destacar o menu sem forçar a sidebar aberta');
assert.ok(app.includes("const selector=mobile&&step.mobileSelector?step.mobileSelector:step.selector"),'o resolvedor do tour deve respeitar alvo mobile quando definido');

assert.ok(app.includes('"Continue no A-MES":"Continue in A-MES"'),'o passo A-MES deve manter tradução PT/EN');
assert.ok(app.includes('"Abra o Console MES pela própria Central; o contexto operacional continua compartilhado.":"Open the MES Console from the Work Center; the operational context remains shared."'),'a orientação de contexto compartilhado deve manter tradução PT/EN');

assert.ok(app.includes("t('Pular tour')")||html.includes('Pular tour'),'o tour deve continuar permitindo pular');
assert.ok(app.includes('dailyTourDisableKey'),'o opt-out de exibição automática deve continuar por usuário');
assert.ok(app.includes("#dailyTourButton"),'o guia deve continuar reabrível manualmente');
assert.equal(fs.existsSync('scripts/apply-central-tour-ames-step.mjs'),false,'helper temporário de patch não pode permanecer no produto');

console.log('ames-central-tour: ok');
