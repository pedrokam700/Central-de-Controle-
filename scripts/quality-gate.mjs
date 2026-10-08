import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];
const passed = [];

function filePath(name) {
  return path.join(root, name);
}

function read(name) {
  return fs.readFileSync(filePath(name), 'utf8');
}

function assertCheck(condition, okMessage, failMessage = okMessage) {
  if (!condition) errors.push(failMessage);
  else passed.push(okMessage);
}

function syntaxCheck(name) {
  const result = spawnSync(process.execPath, ['--check', name], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    errors.push(name + ': sintaxe inválida\n' + (result.stderr || result.stdout || ''));
  } else {
    passed.push(name + ': sintaxe JS válida');
  }
}

const requiredFiles = [
  'index.html',
  'app.js',
  'sw.js',
  'mobile.css',
  'manifest.webmanifest',
  'firestore.rules',
  'firebase.json',
  'ames/data/contract.mjs',
  'ames/data/store.mjs',
  'ames/data/dashboard.mjs',
  'ames/dashboard-view.mjs',
  'ames/dashboard.css',
  'scripts/ames-dashboard.test.mjs',
  'scripts/ames-dashboard.browser.mjs',
  'scripts/ames-fixtures.mjs',
  'scripts/ames-data.test.mjs'
];

for (const name of requiredFiles) {
  assertCheck(
    fs.existsSync(filePath(name)),
    name + ': arquivo ativo presente',
    name + ': arquivo ativo ausente'
  );
}

if (errors.length) {
  console.error('QUALITY GATE — falha estrutural inicial');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

const index = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const firestoreRules = read('firestore.rules');
const firebaseConfigFile = read('firebase.json');

syntaxCheck('app.js');
syntaxCheck('sw.js');
syntaxCheck('ames/data/contract.mjs');
syntaxCheck('ames/data/store.mjs');
syntaxCheck('ames/data/dashboard.mjs');
syntaxCheck('ames/dashboard-view.mjs');
syntaxCheck('scripts/ames-dashboard.browser.mjs');

// Native data invariants are behavioral tests, not just source-string checks.
{
  const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', 'scripts/ames-data.test.mjs', 'scripts/ames-dashboard.test.mjs'], {
    cwd: root, encoding: 'utf8'
  });
  assertCheck(result.status === 0,
    'A-MES: testes de contrato/store/sessão/Dashboard passaram',
    'A-MES: falha nos testes\n' + (result.stdout || '') + (result.stderr || ''));
}

// 1) IDs duplicados no HTML ativo.
{
  const ids = [...index.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  assertCheck(
    duplicates.length === 0,
    'index.html: nenhum ID duplicado',
    'index.html: IDs duplicados encontrados: ' +
      duplicates.map(([id, count]) => id + '×' + count).join(', ')
  );
}

// 2) Declarações function duplicadas no app ativo.
{
  const names = [...app.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  assertCheck(
    duplicates.length === 0,
    'app.js: nenhuma declaração function duplicada',
    'app.js: funções nomeadas duplicadas: ' +
      duplicates.map(([name, count]) => name + '×' + count).join(', ')
  );
}

// 3) Versão/runtime sincronizada entre index, assets, app e Service Worker.
const buildMatch = index.match(/\bconst\s+BUILD\s*=\s*['"]([^'"]+)['"]/);
const build = buildMatch && buildMatch[1];
assertCheck(Boolean(build), 'index.html: BUILD detectado', 'index.html: BUILD não detectado');

if (build) {
  const escaped = build.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

  const assetChecks = [
    ['manifest.webmanifest', new RegExp('manifest\\.webmanifest\\?v=' + escaped)],
    ['mobile.css', new RegExp('mobile\\.css\\?v=' + escaped)],
    ['ames/dashboard.css', new RegExp('ames/dashboard\\.css\\?v=' + escaped)],
    ['app.js', new RegExp('app\\.js\\?v=' + escaped)]
  ];

  for (const [asset, regex] of assetChecks) {
    assertCheck(
      regex.test(index),
      'index.html: ' + asset + ' usa BUILD ' + build,
      'index.html: ' + asset + ' não está sincronizado com BUILD ' + build
    );
  }

  assertCheck(
    app.includes("version==='" + build + "'") || app.includes("version === '" + build + "'"),
    'app.js: listener do Service Worker usa BUILD ' + build,
    'app.js: listener do Service Worker não usa BUILD ' + build
  );

  assertCheck(
    app.includes("localStorage.getItem('cora.sw.loaded')!=='" + build + "'") ||
      app.includes('localStorage.getItem("cora.sw.loaded")!=="' + build + '"'),
    'app.js: guard de reload usa BUILD ' + build,
    'app.js: guard de reload não usa BUILD ' + build
  );

  assertCheck(
    sw.includes("version:'" + build + "'") || sw.includes("version: '" + build + "'"),
    'sw.js: mensagem de cache usa BUILD ' + build,
    'sw.js: mensagem de cache não usa BUILD ' + build
  );

  const normalized = build.replace(/\./g, '-');
  assertCheck(
    sw.includes(normalized),
    'sw.js: nome do cache contém versão normalizada ' + normalized,
    'sw.js: nome do cache não contém versão normalizada ' + normalized
  );
}

// 4) Contrato visual atual.
assertCheck(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'][^"']*mobile\.css/i.test(index),
  'index.html: mobile.css permanece carregado',
  'index.html: mobile.css deixou de ser carregado'
);

assertCheck(
  !/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'][^"']*styles\.css/i.test(index),
  'index.html: styles.css não foi religado diretamente',
  'index.html: styles.css foi ligado diretamente sem auditoria'
);

// 5) Views essenciais continuam presentes.
{
  const requiredViewIds = [
    'homeView',
    'dailyView',
    'dashboardView',
    'allReportsView',
    'operationsView',
    'workView',
    'flowView',
    'aiAnalysisView',
    'profileView'
  ];

  for (const id of requiredViewIds) {
    const found = new RegExp('\\bid=["\\\']' + id + '["\\\']').test(index);
    assertCheck(
      found,
      'index.html: view essencial #' + id + ' presente',
      'index.html: view essencial #' + id + ' ausente'
    );
  }
}

// 6) Smoke test do i18n global + CORA.
assertCheck(
  app.includes('const LANGUAGE_KEY') && app.includes('function setInterfaceLanguage'),
  'app.js: infraestrutura principal de idioma presente',
  'app.js: infraestrutura principal de idioma incompleta'
);

assertCheck(
  app.includes("'pt-BR','en-US'") || app.includes('"pt-BR","en-US"'),
  'app.js: pt-BR e en-US continuam suportados',
  'app.js: lista de idiomas suportados mudou'
);

assertCheck(
  /\bid=["']languageSelect["']/.test(index) && /\bid=["']aiLanguageSelect["']/.test(index),
  'index.html: seletores de idioma da Central e CORA presentes',
  'index.html: seletor de idioma da Central ou CORA ausente'
);

assertCheck(
  app.includes('RESPONSE LANGUAGE:') &&
    app.includes("'English'") &&
    app.includes("'Brazilian Portuguese'"),
  'app.js: CORA recebe diretiva explícita de idioma',
  'app.js: diretiva explícita de idioma da CORA ausente'
);

// 7) Firestore versionado: todas as coleções ativas precisam estar cobertas.
{
  const activeCollections = [
    'users','products','reports','operationalFailures','activities','flows',
    'failureAnalyses','aiKnowledge','aiConversations','workShifts',
    'operationalScopes','workAllocations','routineTemplates','routineExecutions'
  ];
  for (const name of activeCollections) {
    assertCheck(
      firestoreRules.includes('match /' + name + '/{documentId}') || firestoreRules.includes('match /' + name + '/{userId}'),
      'firestore.rules: coleção ' + name + ' coberta',
      'firestore.rules: coleção ' + name + ' sem regra explícita'
    );
  }
  assertCheck(
    /"rules"\s*:\s*"firestore\.rules"/.test(firebaseConfigFile),
    'firebase.json: aponta para firestore.rules',
    'firebase.json: não aponta para firestore.rules'
  );
}

// 8) Assets operacionais esperados continuam no cache do SW.
for (const asset of [
  "BASE+'index.html'",
  "BASE+'app.js'",
  "BASE+'ames/data/store.mjs'",
  "BASE+'ames/data/contract.mjs'",
  "BASE+'ames/data/dashboard.mjs'",
  "BASE+'ames/dashboard-view.mjs'",
  "BASE+'ames/dashboard.css'",
  "BASE+'styles.css'",
  "BASE+'mobile.css'",
  "BASE+'manifest.webmanifest'"
]) {
  assertCheck(
    sw.includes(asset),
    'sw.js: asset ' + asset + ' permanece na lista de cache',
    'sw.js: asset ' + asset + ' ausente da lista de cache'
  );
}

// Avisos não bloqueantes para dívida técnica conhecida.
{
  const hardcodedLocales = [
    ...app.matchAll(/toLocale(?:Date|Time)?String\(\s*['"]pt-BR['"]/g)
  ].length;

  if (hardcodedLocales > 0) {
    warnings.push(
      'app.js: ' + hardcodedLocales +
        ' uso(s) de locale pt-BR hardcoded detectado(s); revisar gradualmente para currentLanguage.'
    );
  }
}

console.log('\nCENTRAL QUALITY GATE');
console.log('BUILD: ' + (build || 'não detectado'));
console.log('Checks OK: ' + passed.length);
for (const item of passed) console.log('✓ ' + item);

if (warnings.length) {
  console.log('\nAvisos:');
  for (const warning of warnings) console.log('⚠ ' + warning);
}

if (errors.length) {
  console.error('\nFalhas: ' + errors.length);
  for (const error of errors) console.error('✗ ' + error);
  process.exit(1);
}

console.log('\nResultado: PASS (checks estáticos e contratos). V2/V0.5.23/3022 dependem de validação real em fábrica.');
