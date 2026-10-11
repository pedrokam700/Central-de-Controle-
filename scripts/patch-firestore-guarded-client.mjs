import fs from 'node:fs';

let app=fs.readFileSync('app.js','utf8');
let sw=fs.readFileSync('sw.js','utf8');

const oldImport="    import {assertFirestoreWriteAllowed} from './core/firestore-write-policy.mjs';";
if((app.split(oldImport).length-1)!==1)throw new Error('firestore write policy import anchor changed');
app=app.replace(oldImport,"    import {createGuardedFirestoreClient} from './core/firestore-guarded-client.mjs';");

const startMarker='    function clientWriteActorUid(){';
const endMarker='    window.__centralLoginModuleReady = true;';
if((app.split(startMarker).length-1)!==1)throw new Error('inline guarded Firestore start marker changed');
if((app.split(endMarker).length-1)!==1)throw new Error('inline guarded Firestore end marker changed');
const start=app.indexOf(startMarker),end=app.indexOf(endMarker,start);
if(end<=start)throw new Error('inline guarded Firestore block order invalid');
const oldBlock=app.slice(start,end);
for(const required of ['assertFirestoreWriteAllowed','firebaseAddDoc','firebaseSetDoc','firebaseUpdateDoc','firebaseDeleteDoc','firebaseWriteBatch']){
  if(!oldBlock.includes(required))throw new Error(`inline guarded Firestore block missing ${required}`);
}
app=app.slice(0,start)+app.slice(end);

const stateAnchor="    let currentAuthUser = null;";
if((app.split(stateAnchor).length-1)!==1)throw new Error('currentAuthUser state anchor changed');
const clientBlock=`${stateAnchor}\n    const guardedFirestore=createGuardedFirestoreClient({\n      rawAddDoc:firebaseAddDoc,\n      rawSetDoc:firebaseSetDoc,\n      rawUpdateDoc:firebaseUpdateDoc,\n      rawDeleteDoc:firebaseDeleteDoc,\n      rawWriteBatch:firebaseWriteBatch,\n      getActorUid:()=>auth.currentUser?.uid || currentAuthUser?.uid || '',\n      getCapabilities:()=>currentAccount?.capabilities||null\n    });\n    const {addDoc,setDoc,updateDoc,deleteDoc,writeBatch}=guardedFirestore;`;
app=app.replace(stateAnchor,clientBlock);

if(app.includes('assertClientWrite(')||app.includes('clientWriteActorUid(')||app.includes('assertFirestoreWriteAllowed'))throw new Error('inline Firestore guard implementation remains in app.js');
if((app.match(/createGuardedFirestoreClient/g)||[]).length!==2)throw new Error('guarded Firestore import/initialization contract changed');
for(const name of ['addDoc','setDoc','updateDoc','deleteDoc','writeBatch']){
  if(!app.includes(name))throw new Error(`guarded Firestore alias missing: ${name}`);
}

const swAnchor="BASE+'core/firestore-write-policy.mjs',";
if((sw.split(swAnchor).length-1)!==1)throw new Error('service worker Firestore policy cache anchor changed');
if(sw.includes("core/firestore-guarded-client.mjs"))throw new Error('guarded Firestore client already cached');
sw=sw.replace(swAnchor,`${swAnchor}BASE+'core/firestore-guarded-client.mjs',`);

fs.writeFileSync('app.js',app);
fs.writeFileSync('sw.js',sw);

fs.writeFileSync('scripts/ames-capability-write-ui.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('toda escrita direta do app passa pelo cliente Firestore guardado extraído',()=>{\n  assert.match(app,/addDoc as firebaseAddDoc/);\n  assert.match(app,/deleteDoc as firebaseDeleteDoc/);\n  assert.match(app,/updateDoc as firebaseUpdateDoc/);\n  assert.match(app,/setDoc as firebaseSetDoc/);\n  assert.match(app,/writeBatch as firebaseWriteBatch/);\n  assert.match(app,/import \\{createGuardedFirestoreClient\\} from ['\"]\\.\\/core\\/firestore-guarded-client\\.mjs['\"]/);\n  assert.match(app,/const guardedFirestore=createGuardedFirestoreClient\\(\\{/);\n  assert.match(app,/rawAddDoc:firebaseAddDoc/);\n  assert.match(app,/rawSetDoc:firebaseSetDoc/);\n  assert.match(app,/rawUpdateDoc:firebaseUpdateDoc/);\n  assert.match(app,/rawDeleteDoc:firebaseDeleteDoc/);\n  assert.match(app,/rawWriteBatch:firebaseWriteBatch/);\n  assert.match(app,/getActorUid:\(\)=>auth\\.currentUser\\?\\.uid \\|\\| currentAuthUser\\?\\.uid \\|\\| ['\"]['\"]/);\n  assert.match(app,/getCapabilities:\(\)=>currentAccount\\?\\.capabilities\\|\\|null/);\n  assert.match(app,/const \\{addDoc,setDoc,updateDoc,deleteDoc,writeBatch\\}=guardedFirestore/);\n  assert.doesNotMatch(app,/function assertClientWrite|assertFirestoreWriteAllowed/);\n});\n\ntest('UI e formulários principais espelham capabilities sem substituir Rules',()=>{\n  assert.match(app,/CAPABILITY_FORM_MAP=Object\\.freeze/);\n  assert.match(app,/productForm:'write_technical'/);\n  assert.match(app,/failureForm:'write_operational'/);\n  assert.match(app,/dailyShiftForm:'administer'/);\n  assert.match(app,/CAPABILITY_CLICK_RULES/);\n  assert.match(app,/renderSafely\\('permissões da interface', applyCapabilityUi\\)/);\n  assert.match(app,/event\\.stopImmediatePropagation\\(\\);showSaveToast\\(capabilityDeniedMessage/);\n});\n\ntest('atalhos e modais de escrita são filtrados antes de abrir',()=>{\n  assert.match(app,/function openProductModal\\(\\) \\{ if\\(!requireCapability\\('write_technical'\\)\\)return;/);\n  assert.match(app,/function openOperationalFailureModal\\(prefill=\\{\\}\\)\\{\\n      if\\(!requireCapability\\('write_operational'\\)\\)return;/);\n  assert.match(app,/if\\(hasCapability\\('write_operational'\\)\\)add\\(t\\('Nova atividade'\\)/);\n  assert.match(app,/if\\(hasCapability\\('write_technical'\\)\\)add\\(t\\('Cadastrar produto'\\)/);\n});\n\ntest('write policy e cliente guardado ficam disponíveis no shell offline',()=>{\n  assert.match(sw,/core\\/firestore-write-policy\\.mjs/);\n  assert.match(sw,/core\\/firestore-guarded-client\\.mjs/);\n});\n`);

console.log(JSON.stringify({module:'core/firestore-guarded-client.mjs',inline_guard_removed:true,self_profile_bootstrap_preserved:true,behavior_change:false},null,2));
