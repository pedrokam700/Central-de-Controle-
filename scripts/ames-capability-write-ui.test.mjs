import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

test('toda escrita direta do app passa por wrapper de capability',()=>{
  assert.match(app,/addDoc as firebaseAddDoc/);
  assert.match(app,/deleteDoc as firebaseDeleteDoc/);
  assert.match(app,/updateDoc as firebaseUpdateDoc/);
  assert.match(app,/setDoc as firebaseSetDoc/);
  assert.match(app,/writeBatch as firebaseWriteBatch/);
  assert.match(app,/function assertClientWrite\(reference,operation\)/);
  assert.match(app,/assertFirestoreWriteAllowed\(\{/);
  assert.match(app,/function addDoc\(reference,data\)\{ assertClientWrite\(reference,'create'\)/);
  assert.match(app,/function updateDoc\(reference,\.\.\.args\)\{ assertClientWrite\(reference,'update'\)/);
  assert.match(app,/function deleteDoc\(reference\)\{ assertClientWrite\(reference,'delete'\)/);
  assert.match(app,/const raw=firebaseWriteBatch\(database\)/);
});

test('UI e formulários principais espelham capabilities sem substituir Rules',()=>{
  assert.match(app,/CAPABILITY_FORM_MAP=Object\.freeze/);
  assert.match(app,/productForm:'write_technical'/);
  assert.match(app,/failureForm:'write_operational'/);
  assert.match(app,/dailyShiftForm:'administer'/);
  assert.match(app,/CAPABILITY_CLICK_RULES/);
  assert.match(app,/renderSafely\('permissões da interface', applyCapabilityUi\)/);
  assert.match(app,/event\.stopImmediatePropagation\(\);showSaveToast\(capabilityDeniedMessage/);
});

test('atalhos e modais de escrita são filtrados antes de abrir',()=>{
  assert.match(app,/function openProductModal\(\) \{ if\(!requireCapability\('write_technical'\)\)return;/);
  assert.match(app,/function openOperationalFailureModal\(prefill=\{\}\)\{\n      if\(!requireCapability\('write_operational'\)\)return;/);
  assert.match(app,/if\(hasCapability\('write_operational'\)\)add\(t\('Nova atividade'\)/);
  assert.match(app,/if\(hasCapability\('write_technical'\)\)add\(t\('Cadastrar produto'\)/);
});

test('write policy fica disponível no shell offline',()=>{
  assert.match(sw,/core\/firestore-write-policy\.mjs/);
});
