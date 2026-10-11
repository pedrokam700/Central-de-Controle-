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
  "    import {assertFirestoreWriteAllowed} from './core/firestore-write-policy.mjs';",
  "    import {assertFirestoreWriteAllowed} from './core/firestore-write-policy.mjs';\n    import {legacyAccountMigrationInventory,legacyMigrationProgress} from './core/legacy-account-migration.mjs';",
  'legacy migration inventory import'
);

const helperAnchor=`    function adminUserAccessMeta(user){`;
const helper=`    function renderLegacyMigrationStatus(adminSection){\n      if(!adminSection)return;\n      let host=adminSection.querySelector('#adminLegacyMigrationStatus');\n      if(!host){\n        host=document.createElement('div');\n        host.id='adminLegacyMigrationStatus';\n        host.className='panel';\n        host.style.marginBottom='12px';\n        adminSection.querySelector('.section-head')?.after(host);\n      }\n      const inventory=legacyAccountMigrationInventory(users);\n      const progress=legacyMigrationProgress(inventory);\n      let tone='var(--muted)',statusTitle,statusBody;\n      if(inventory.total===0){\n        statusTitle=adminUiText('Inventário ainda vazio','Inventory not loaded yet');\n        statusBody=adminUiText('Nenhuma conta foi carregada. A remoção do fallback permanece bloqueada.','No accounts are loaded. Fallback removal remains blocked.');\n      }else if(inventory.legacy_total>0){\n        tone='var(--warning, #9a6b00)';\n        statusTitle=adminUiText('Migração de acesso em andamento','Access migration in progress');\n        statusBody=currentLanguage==='en-US'\n          ? inventory.legacy_total+' legacy account(s) still require an explicit administrator decision ('+inventory.legacy_active+' active, '+inventory.legacy_disabled+' disabled). The legacy fallback remains required.'\n          : inventory.legacy_total+' conta(s) legada(s) ainda exigem decisão explícita do administrador ('+inventory.legacy_active+' ativa(s), '+inventory.legacy_disabled+' desativada(s)). O fallback legado continua obrigatório.';\n      }else if(inventory.v2_invalid>0){\n        tone='var(--danger)';\n        statusTitle=adminUiText('Perfis V2 inválidos encontrados','Invalid V2 profiles found');\n        statusBody=currentLanguage==='en-US'\n          ? inventory.v2_invalid+' invalid V2 profile(s) must be corrected before fallback removal can even be considered.'\n          : inventory.v2_invalid+' perfil(is) V2 inválido(s) precisam ser corrigidos antes de sequer considerar remover o fallback.';\n      }else{\n        tone='var(--success, #197244)';\n        statusTitle=adminUiText('Inventário sem contas legadas','No legacy accounts in inventory');\n        statusBody=adminUiText('Todas as contas carregadas estão em V2. Isso apenas libera a próxima validação; remover o fallback continua exigindo regressão GREEN e promoção separada.','All loaded accounts are V2. This only unlocks the next validation; removing the fallback still requires GREEN regression evidence and a separate promotion decision.');\n      }\n      host.innerHTML='<div style="padding:14px 16px;display:grid;gap:10px">'\n        +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">'\n          +'<div><strong>'+esc(statusTitle)+'</strong><div class="muted" style="font-size:11px;margin-top:4px">'+esc(statusBody)+'</div></div>'\n          +'<span class="status '+(inventory.fallback_removal_allowed?'done':'waiting')+'">'+esc(adminUiText('V2 '+inventory.v2_total+'/'+inventory.total,'V2 '+inventory.v2_total+'/'+inventory.total))+'</span>'\n        +'</div>'\n        +'<div style="height:7px;background:var(--soft);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+progress+'%;background:'+tone+';transition:width .2s ease"></div></div>'\n        +'<div class="muted" style="font-size:10px">'+esc(adminUiText('Sem migração automática · sem nível sugerido · decisão por conta','No automatic migration · no suggested level · per-account decision'))+'</div>'\n      +'</div>';\n    }\n\n    function adminUserAccessMeta(user){`;
app=replaceExactly(app,helperAnchor,helper,'legacy migration status helper');

app=replaceExactly(
  app,
  "      if (isAdmin) {\n        document.querySelector('#adminUserRows').innerHTML = users.map(adminUserRowHtml).join('');\n      }",
  "      if (isAdmin) {\n        renderLegacyMigrationStatus(adminSection);\n        document.querySelector('#adminUserRows').innerHTML = users.map(adminUserRowHtml).join('');\n      }",
  'render legacy migration inventory'
);

for(const required of [
  'legacyAccountMigrationInventory,legacyMigrationProgress',
  'function renderLegacyMigrationStatus(adminSection)',
  "host.id='adminLegacyMigrationStatus'",
  'inventory.legacy_total>0',
  'inventory.legacy_disabled',
  'inventory.v2_invalid',
  'inventory.fallback_removal_allowed',
  'Sem migração automática · sem nível sugerido · decisão por conta',
  'renderLegacyMigrationStatus(adminSection)'
]) if(!app.includes(required))throw new Error('legacy migration inventory UI missing: '+required);
fs.writeFileSync('app.js',app);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(
  sw,
  "BASE+'core/firestore-write-policy.mjs',BASE+'ames/data/store.mjs'",
  "BASE+'core/firestore-write-policy.mjs',BASE+'core/legacy-account-migration.mjs',BASE+'ames/data/store.mjs'",
  'legacy migration inventory offline dependency'
);
fs.writeFileSync('sw.js',sw);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('admin vê inventário de migração derivado dos usuários já carregados',()=>{\n  assert.match(app,/\\.\\/core\\/legacy-account-migration\\.mjs/);\n  assert.match(app,/legacyAccountMigrationInventory\\(users\\)/);\n  assert.match(app,/legacyMigrationProgress\\(inventory\\)/);\n  assert.match(app,/adminLegacyMigrationStatus/);\n  assert.match(app,/inventory\\.legacy_active/);\n  assert.match(app,/inventory\\.legacy_disabled/);\n  assert.match(app,/inventory\\.v2_invalid/);\n});\n\ntest('UI não oferece migração automática nem recomenda nível',()=>{\n  assert.match(app,/Sem migração automática · sem nível sugerido · decisão por conta/);\n  assert.doesNotMatch(app,/migrateAllLegacy/i);\n  assert.doesNotMatch(app,/autoMigrateLegacy/i);\n  assert.doesNotMatch(app,/recommendedAccessLevel/i);\n  assert.match(app,/renderLegacyMigrationStatus\\(adminSection\\)/);\n});\n\ntest('mensagem conserva fallback até inventário realmente seguro',()=>{\n  assert.match(app,/O fallback legado continua obrigatório/);\n  assert.match(app,/remover o fallback continua exigindo regressão GREEN e promoção separada/);\n  assert.match(app,/inventory\\.fallback_removal_allowed\\?'done':'waiting'/);\n});\n\ntest('inventário fica disponível no shell offline',()=>{\n  assert.match(sw,/core\\/legacy-account-migration\\.mjs/);\n});\n`;
fs.writeFileSync('scripts/ames-legacy-account-migration-app.test.mjs',test);
console.log('PASS deterministic legacy migration inventory UI patch');
