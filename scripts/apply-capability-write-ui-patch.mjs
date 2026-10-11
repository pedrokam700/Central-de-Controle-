import fs from 'node:fs';

function replaceExactly(source,oldText,newText,label){
  const first=source.indexOf(oldText);
  if(first<0)throw new Error(`${label}: anchor not found`);
  if(source.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor is not unique`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
}

let app=fs.readFileSync('app.js','utf8');
app=replaceExactly(
  app,
  "    import {migrateLegacyProfile,approveV2Profile,denyV2Profile,changeV2AccessLevel} from './core/admission-admin.mjs';",
  "    import {migrateLegacyProfile,approveV2Profile,denyV2Profile,changeV2AccessLevel} from './core/admission-admin.mjs';\n    import {assertFirestoreWriteAllowed} from './core/firestore-write-policy.mjs';",
  'write policy import'
);
app=replaceExactly(
  app,
  '      getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, setDoc, getDoc, getDocs, query, where, writeBatch, runTransaction, arrayUnion',
  '      getFirestore, collection, addDoc as firebaseAddDoc, onSnapshot, doc, deleteDoc as firebaseDeleteDoc, updateDoc as firebaseUpdateDoc, setDoc as firebaseSetDoc, getDoc, getDocs, query, where, writeBatch as firebaseWriteBatch, runTransaction, arrayUnion',
  'Firestore write aliases'
);

const authAnchor=`    const app = initializeApp(firebaseConfig);\n    const db = getFirestore(app);\n    const auth = getAuth(app);`;
const authReplacement=`    const app = initializeApp(firebaseConfig);\n    const db = getFirestore(app);\n    const auth = getAuth(app);\n\n    function clientWriteActorUid(){ return auth.currentUser?.uid || currentAuthUser?.uid || ''; }\n    function assertClientWrite(reference,operation){\n      return assertFirestoreWriteAllowed({\n        path:reference?.path||'',\n        operation,\n        actorUid:clientWriteActorUid(),\n        capabilities:currentAccount?.capabilities||null\n      });\n    }\n    function addDoc(reference,data){ assertClientWrite(reference,'create'); return firebaseAddDoc(reference,data); }\n    function setDoc(reference,data,options){\n      assertClientWrite(reference,'set');\n      return options===undefined?firebaseSetDoc(reference,data):firebaseSetDoc(reference,data,options);\n    }\n    function updateDoc(reference,...args){ assertClientWrite(reference,'update'); return firebaseUpdateDoc(reference,...args); }\n    function deleteDoc(reference){ assertClientWrite(reference,'delete'); return firebaseDeleteDoc(reference); }\n    function writeBatch(database){\n      const raw=firebaseWriteBatch(database);\n      const guarded={\n        set(reference,data,options){ assertClientWrite(reference,'set'); options===undefined?raw.set(reference,data):raw.set(reference,data,options); return guarded; },\n        update(reference,...args){ assertClientWrite(reference,'update'); raw.update(reference,...args); return guarded; },\n        delete(reference){ assertClientWrite(reference,'delete'); raw.delete(reference); return guarded; },\n        commit(){ return raw.commit(); }\n      };\n      return guarded;\n    }`;
app=replaceExactly(app,authAnchor,authReplacement,'guarded Firestore writes');

app=replaceExactly(
  app,
  "    function canAdminister(){ return currentAccount?.capabilities?.administer === true; }",
  `    function hasCapability(name){ return currentAccount?.capabilities?.active === true && currentAccount.capabilities?.[name] === true; }\n    function canAdminister(){ return hasCapability('administer'); }\n    function capabilityDeniedMessage(name){\n      const labels={write_operational:'operacional',write_technical:'técnica',administer:'administrativa'};\n      return currentLanguage==='en-US'\n        ? 'Your access level does not allow this action.'\n        : 'Seu nível de acesso não permite esta ação '+(labels[name]||'')+'.';\n    }\n    function requireCapability(name){\n      if(hasCapability(name))return true;\n      showSaveToast(capabilityDeniedMessage(name),'error');\n      return false;\n    }\n    const CAPABILITY_FORM_MAP=Object.freeze({\n      productForm:'write_technical',componentForm:'write_technical',\n      failureForm:'write_operational',operationalFailureForm:'write_operational',activityForm:'write_operational',flowForm:'write_operational',routineExecutionForm:'write_operational',\n      dailyShiftForm:'administer',dailyScopeForm:'administer',dailyProductionContextForm:'administer',dailyAllocationForm:'administer',dailyRoutineForm:'administer',familyRenameForm:'administer'\n    });\n    const CAPABILITY_CLICK_RULES=Object.freeze([\n      {capability:'write_technical',hide:true,selector:'#newProduct,#headerNewProduct,#newComponent,#aiSaveInvestigation'},\n      {capability:'write_operational',hide:true,selector:'#newFailure,#newOperationalFailure,#headerNewOperationalFailure,#quickOperationalFailure,#newActivity,#newFlow,#quickActivity,#quickFailure,#quickFlow'},\n      {capability:'write_operational',hide:false,selector:'#saveArtifacts,#saveAnalysis,#saveQuantity,#saveDetailPage,#editFailureName,#saveFailureName,#addUpdate,#saveOperationalEvidence,#saveOperationalDetail,#deleteOperationalDetail,#convertOperationalToProductReport,#saveActivityChanges,#saveActivityEvidence,#structureActivity,#activitySteps input,#saveFlowChanges,#saveRoutineExecutionButton,#saveShiftHandover'},\n      {capability:'administer',hide:false,selector:'#deleteReport,#deleteActivity,#cancelActivity,#deleteFlow,.delete-family-btn'}\n    ]);\n    function applyCapabilityControl(rule){\n      const allowed=hasCapability(rule.capability);\n      document.querySelectorAll(rule.selector).forEach(el=>{\n        if(rule.hide){\n          if(!allowed){el.dataset.capabilityHidden='1';el.style.setProperty('display','none','important');}\n          else if(el.dataset.capabilityHidden==='1'){el.style.removeProperty('display');delete el.dataset.capabilityHidden;}\n        }else if('disabled' in el){\n          if(!allowed){if(el.dataset.capabilityDisabled!=='1')el.dataset.capabilityWasDisabled=el.disabled?'1':'0';el.dataset.capabilityDisabled='1';el.disabled=true;el.title=capabilityDeniedMessage(rule.capability);}\n          else if(el.dataset.capabilityDisabled==='1'){el.disabled=el.dataset.capabilityWasDisabled==='1';delete el.dataset.capabilityDisabled;delete el.dataset.capabilityWasDisabled;if(el.title===capabilityDeniedMessage(rule.capability))el.removeAttribute('title');}\n        }\n      });\n    }\n    function applyCapabilityUi(){\n      if(!currentAccount)return;\n      CAPABILITY_CLICK_RULES.forEach(applyCapabilityControl);\n      document.documentElement.dataset.centralAccessLevel=currentAccount.accessLevel||currentAccount.generation||'unknown';\n    }\n    document.addEventListener('submit',event=>{\n      const capability=CAPABILITY_FORM_MAP[event.target?.id];\n      if(!capability||hasCapability(capability))return;\n      event.preventDefault();event.stopImmediatePropagation();showSaveToast(capabilityDeniedMessage(capability),'error');\n    },true);\n    document.addEventListener('click',event=>{\n      for(const rule of CAPABILITY_CLICK_RULES){\n        if(!event.target?.closest?.(rule.selector)||hasCapability(rule.capability))continue;\n        event.preventDefault();event.stopImmediatePropagation();showSaveToast(capabilityDeniedMessage(rule.capability),'error');return;\n      }\n    },true);`,
  'capability UI helpers'
);

for(const [oldText,newText,label] of [
  ["    function openProductModal() {","    function openProductModal() { if(!requireCapability('write_technical'))return;",'product modal guard'],
  ["    function openComponentModal(returnToFailure = false) { if (!activeData()) return openProductModal();","    function openComponentModal(returnToFailure = false) { if(!requireCapability('write_technical'))return; if (!activeData()) return openProductModal();",'component modal guard'],
  ["    function openFailureModal() {\n      if (!activeData()) return openProductModal();","    function openFailureModal() {\n      if(!requireCapability('write_operational'))return;\n      if (!activeData()) return openProductModal();",'report modal guard'],
  ["    function openOperationalFailureModal(prefill={}){\n      updateOwnerDropdowns();","    function openOperationalFailureModal(prefill={}){\n      if(!requireCapability('write_operational'))return;\n      updateOwnerDropdowns();",'operational modal guard'],
  ["    function openActivityModal(prefill={}) {fillActivityProducts();","    function openActivityModal(prefill={}) {if(!requireCapability('write_operational'))return;fillActivityProducts();",'activity modal guard'],
  ["    function openFlowModal() { fillFlowProducts();","    function openFlowModal() { if(!requireCapability('write_operational'))return; fillFlowProducts();",'flow modal guard']
]) app=replaceExactly(app,oldText,newText,label);

app=replaceExactly(
  app,
  "      add(t('Nova atividade'),currentLanguage==='en-US'?'Create a task or structured activity':'Criar tarefa ou atividade estruturada',t('Ação'),()=>openActivityModal(),'atividade tarefa');\n      add(t('Registrar falha'),currentLanguage==='en-US'?'Register an operational occurrence':'Registrar ocorrência operacional',t('Ação'),()=>openOperationalFailureModal(),'falha ocorrência');\n      add(t('Cadastrar produto'),currentLanguage==='en-US'?'Add product / CPH':'Adicionar produto / CPH',t('Ação'),()=>openProductModal(),'produto cph');",
  "      if(hasCapability('write_operational'))add(t('Nova atividade'),currentLanguage==='en-US'?'Create a task or structured activity':'Criar tarefa ou atividade estruturada',t('Ação'),()=>openActivityModal(),'atividade tarefa');\n      if(hasCapability('write_operational'))add(t('Registrar falha'),currentLanguage==='en-US'?'Register an operational occurrence':'Registrar ocorrência operacional',t('Ação'),()=>openOperationalFailureModal(),'falha ocorrência');\n      if(hasCapability('write_technical'))add(t('Cadastrar produto'),currentLanguage==='en-US'?'Add product / CPH':'Adicionar produto / CPH',t('Ação'),()=>openProductModal(),'produto cph');",
  'command palette capability filtering'
);

app=replaceExactly(
  app,
  "      renderSafely('tradução', translatePage);\n\n      // Reaplica no final",
  "      renderSafely('tradução', translatePage);\n      renderSafely('permissões da interface', applyCapabilityUi);\n\n      // Reaplica no final",
  'render capability UI'
);

for(const required of [
  "assertFirestoreWriteAllowed",
  "addDoc as firebaseAddDoc",
  "function assertClientWrite(reference,operation)",
  "function writeBatch(database)",
  "function hasCapability(name)",
  "CAPABILITY_FORM_MAP",
  "CAPABILITY_CLICK_RULES",
  "renderSafely('permissões da interface', applyCapabilityUi)",
  "if(hasCapability('write_operational'))add(t('Nova atividade')",
  "if(hasCapability('write_technical'))add(t('Cadastrar produto')"
]) if(!app.includes(required))throw new Error('capability integration missing: '+required);
fs.writeFileSync('app.js',app);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(
  sw,
  "BASE+'core/admission-admin.mjs',BASE+'ames/data/store.mjs'",
  "BASE+'core/admission-admin.mjs',BASE+'core/firestore-write-policy.mjs',BASE+'ames/data/store.mjs'",
  'write policy offline dependency'
);
fs.writeFileSync('sw.js',sw);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('toda escrita direta do app passa por wrapper de capability',()=>{\n  assert.match(app,/addDoc as firebaseAddDoc/);\n  assert.match(app,/deleteDoc as firebaseDeleteDoc/);\n  assert.match(app,/updateDoc as firebaseUpdateDoc/);\n  assert.match(app,/setDoc as firebaseSetDoc/);\n  assert.match(app,/writeBatch as firebaseWriteBatch/);\n  assert.match(app,/function assertClientWrite\\(reference,operation\\)/);\n  assert.match(app,/assertFirestoreWriteAllowed\\(\\{/);\n  assert.match(app,/function addDoc\\(reference,data\\)\\{ assertClientWrite\\(reference,'create'\\)/);\n  assert.match(app,/function updateDoc\\(reference,\\.\\.\\.args\\)\\{ assertClientWrite\\(reference,'update'\\)/);\n  assert.match(app,/function deleteDoc\\(reference\\)\\{ assertClientWrite\\(reference,'delete'\\)/);\n  assert.match(app,/const raw=firebaseWriteBatch\\(database\\)/);\n});\n\ntest('UI e formulários principais espelham capabilities sem substituir Rules',()=>{\n  assert.match(app,/CAPABILITY_FORM_MAP=Object\\.freeze/);\n  assert.match(app,/productForm:'write_technical'/);\n  assert.match(app,/failureForm:'write_operational'/);\n  assert.match(app,/dailyShiftForm:'administer'/);\n  assert.match(app,/CAPABILITY_CLICK_RULES/);\n  assert.match(app,/renderSafely\\('permissões da interface', applyCapabilityUi\\)/);\n  assert.match(app,/event\\.stopImmediatePropagation\\(\\);showSaveToast\\(capabilityDeniedMessage/);\n});\n\ntest('atalhos e modais de escrita são filtrados antes de abrir',()=>{\n  assert.match(app,/function openProductModal\\(\\) \\{ if\\(!requireCapability\\('write_technical'\\)\\)return;/);\n  assert.match(app,/function openOperationalFailureModal\\(prefill=\\{\\}\\)\\{\\n      if\\(!requireCapability\\('write_operational'\\)\\)return;/);\n  assert.match(app,/if\\(hasCapability\\('write_operational'\\)\\)add\\(t\\('Nova atividade'\\)/);\n  assert.match(app,/if\\(hasCapability\\('write_technical'\\)\\)add\\(t\\('Cadastrar produto'\\)/);\n});\n\ntest('write policy fica disponível no shell offline',()=>{\n  assert.match(sw,/core\\/firestore-write-policy\\.mjs/);\n});\n`;
fs.writeFileSync('scripts/ames-capability-write-ui.test.mjs',test);
console.log('PASS deterministic capability write/UI patch');
