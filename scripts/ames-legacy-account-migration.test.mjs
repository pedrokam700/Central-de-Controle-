import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyAccountMigrationInventory,legacyMigrationProgress} from '../core/legacy-account-migration.mjs';

test('inventário separa legado ativo/desativado de perfis V2 sem inferir nível',()=>{
  const inventory=legacyAccountMigrationInventory([
    {uid:'l1',role:'user',disabled:false},
    {uid:'l2',role:'admin',disabled:true},
    {uid:'v1',admission_version:2,access_level:'viewer',approval_state:'pending',disabled:false},
    {uid:'v2',admission_version:2,access_level:'engineer',approval_state:'approved',disabled:false},
    {uid:'v3',admission_version:2,access_level:'operator',approval_state:'denied',disabled:true}
  ]);
  assert.equal(inventory.total,5);
  assert.equal(inventory.legacy_total,2);
  assert.equal(inventory.legacy_active,1);
  assert.equal(inventory.legacy_disabled,1);
  assert.equal(inventory.v2_total,3);
  assert.equal(inventory.v2_approved,1);
  assert.equal(inventory.v2_pending,1);
  assert.equal(inventory.v2_disabled,1);
  assert.equal(inventory.fallback_removal_allowed,false);
  assert.equal(inventory.auto_migration_allowed,false);
  assert.equal(inventory.bulk_migration_allowed,false);
  assert.equal(inventory.access_level_inference_allowed,false);
  assert.equal(legacyMigrationProgress(inventory),60);
});

test('conta legada desativada também bloqueia remoção do fallback',()=>{
  const inventory=legacyAccountMigrationInventory([{uid:'legacy-disabled',disabled:true}]);
  assert.equal(inventory.legacy_total,1);
  assert.equal(inventory.legacy_active,0);
  assert.equal(inventory.legacy_disabled,1);
  assert.equal(inventory.migration_complete,false);
  assert.equal(inventory.fallback_removal_allowed,false);
});

test('fallback só pode ser considerado quando não há legado nem V2 inválido',()=>{
  const green=legacyAccountMigrationInventory([
    {uid:'a',admission_version:2,access_level:'admin',approval_state:'approved'},
    {uid:'o',admission_version:2,access_level:'operator',approval_state:'approved'}
  ]);
  assert.equal(green.legacy_total,0);
  assert.equal(green.v2_invalid,0);
  assert.equal(green.migration_complete,true);
  assert.equal(green.fallback_removal_allowed,true);
  assert.equal(legacyMigrationProgress(green),100);

  const invalid=legacyAccountMigrationInventory([
    {uid:'broken',admission_version:2,access_level:'future-level',approval_state:'approved'}
  ]);
  assert.equal(invalid.legacy_total,0);
  assert.equal(invalid.v2_invalid,1);
  assert.equal(invalid.migration_complete,true);
  assert.equal(invalid.fallback_removal_allowed,false);
});

test('inventário vazio falha fechado para remoção do fallback',()=>{
  const inventory=legacyAccountMigrationInventory([]);
  assert.equal(inventory.total,0);
  assert.equal(inventory.fallback_removal_allowed,false);
  assert.equal(legacyMigrationProgress(inventory),0);
});

test('contrato não produz recomendação nem mutação de perfil',()=>{
  const source={uid:'legacy',role:'admin',disabled:false};
  const before=structuredClone(source);
  const inventory=legacyAccountMigrationInventory([source]);
  assert.deepEqual(source,before);
  const serialized=JSON.stringify(inventory).toLowerCase();
  assert.equal(serialized.includes('recommended'),false);
  assert.equal(serialized.includes('suggested'),false);
  assert.equal(serialized.includes('target_access_level'),false);
});
