import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

test('admin vê inventário de migração derivado dos usuários já carregados',()=>{
  assert.match(app,/\.\/core\/legacy-account-migration\.mjs/);
  assert.match(app,/legacyAccountMigrationInventory\(users\)/);
  assert.match(app,/legacyMigrationProgress\(inventory\)/);
  assert.match(app,/adminLegacyMigrationStatus/);
  assert.match(app,/inventory\.legacy_active/);
  assert.match(app,/inventory\.legacy_disabled/);
  assert.match(app,/inventory\.v2_invalid/);
});

test('UI não oferece migração automática nem recomenda nível',()=>{
  assert.match(app,/Sem migração automática · sem nível sugerido · decisão por conta/);
  assert.doesNotMatch(app,/migrateAllLegacy/i);
  assert.doesNotMatch(app,/autoMigrateLegacy/i);
  assert.doesNotMatch(app,/recommendedAccessLevel/i);
  assert.match(app,/renderLegacyMigrationStatus\(adminSection\)/);
});

test('mensagem conserva fallback até inventário realmente seguro',()=>{
  assert.match(app,/O fallback legado continua obrigatório/);
  assert.match(app,/remover o fallback continua exigindo regressão GREEN e promoção separada/);
  assert.match(app,/inventory\.fallback_removal_allowed\?'done':'waiting'/);
});

test('inventário fica disponível no shell offline',()=>{
  assert.match(sw,/core\/legacy-account-migration\.mjs/);
});
