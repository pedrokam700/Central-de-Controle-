import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

test('toda escrita direta do app passa pelo cliente Firestore guardado extraído',()=>{
  assert.match(app,/addDoc as firebaseAddDoc/);
  assert.match(app,/deleteDoc as firebaseDeleteDoc/);
  assert.match(app,/updateDoc as firebaseUpdateDoc/);
  assert.match(app,/setDoc as firebaseSetDoc/);
  assert.match(app,/writeBatch as firebaseWriteBatch/);
  assert.match(app,/import \{createGuardedFirestoreClient\} from ['"]\.\/core\/firestore-guarded-client\.mjs['"]/);
  assert.match(app,/const guardedFirestore=createGuardedFirestoreClient\(\{/);
  assert.match(app,/rawAddDoc:firebaseAddDoc/);
  assert.match(app,/rawSetDoc:firebaseSetDoc/);
  assert.match(app,/rawUpdateDoc:firebaseUpdateDoc/);
  assert.match(app,/rawDeleteDoc:firebaseDeleteDoc/);
  assert.match(app,/rawWriteBatch:firebaseWriteBatch/);
  assert.match(app,/getActorUid:\(\)=>auth\.currentUser\?\.uid \|\| currentAuthUser\?\.uid \|\| ['"]['"]/);
  assert.match(app,/getCapabilities:\(\)=>currentAccount\?\.capabilities\|\|null/);
  assert.match(app,/const \{addDoc,setDoc,updateDoc,deleteDoc,writeBatch\}=guardedFirestore/);
  assert.doesNotMatch(app,/function assertClientWrite|assertFirestoreWriteAllowed/);
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

test('write policy e cliente guardado ficam disponíveis no shell offline',()=>{
  assert.match(sw,/core\/firestore-write-policy\.mjs/);
  assert.match(sw,/core\/firestore-guarded-client\.mjs/);
});
