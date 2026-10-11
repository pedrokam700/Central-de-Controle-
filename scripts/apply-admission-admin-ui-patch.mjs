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
  "    import {buildSignupProfile,evaluateSessionAdmission} from './core/session-admission.mjs';",
  "    import {buildSignupProfile,evaluateSessionAdmission} from './core/session-admission.mjs';\n    import {migrateLegacyProfile,approveV2Profile,denyV2Profile,changeV2AccessLevel} from './core/admission-admin.mjs';",
  'admission admin import'
);

const helperAnchor=`      integrationView.render();\n    }\n    function renderProfile() {`;
const helperBlock=`      integrationView.render();\n    }\n\n    const ADMIN_ACCESS_LEVELS = ['viewer','operator','engineer','supervisor','admin'];\n    function canAdminister(){ return currentAccount?.capabilities?.administer === true; }\n    function adminUiText(pt,en){ return currentLanguage==='en-US' ? en : pt; }\n    function adminAccessLevelLabel(level){\n      const labels=currentLanguage==='en-US'\n        ? {viewer:'Viewer',operator:'Operator',engineer:'Engineer',supervisor:'Supervisor',admin:'Admin'}\n        : {viewer:'Viewer',operator:'Operador',engineer:'Engenheiro',supervisor:'Supervisor',admin:'Administrador'};\n      return labels[String(level||'').toLowerCase()] || String(level||'—');\n    }\n    function accountAccessLabel(account){\n      if(account?.generation==='v2')return adminAccessLevelLabel(account.accessLevel);\n      return canAdminister()?adminUiText('Administrador','Administrator'):adminUiText('Usuário legado','Legacy user');\n    }\n    function adminUserAccessMeta(user){\n      const v2=Number(user?.admission_version)===2;\n      if(!v2){\n        const state=user?.disabled?adminUiText('Desativado','Disabled'):(user?.role==='admin'?adminUiText('Administrador','Administrator'):adminUiText('Usuário legado','Legacy user'));\n        return {v2:false,label:adminUiText('Legado','Legacy')+' · '+state,className:user?.disabled?'waiting':'done'};\n      }\n      const level=adminAccessLevelLabel(user?.access_level);\n      const approval=String(user?.approval_state||'pending');\n      let state=adminUiText('Pendente','Pending'),className='waiting';\n      if(approval==='denied')state=adminUiText('Negado','Denied');\n      else if(user?.disabled)state=adminUiText('Desativado','Disabled');\n      else if(approval==='approved'){state=adminUiText('Aprovado','Approved');className='done';}\n      return {v2:true,label:state+' · '+level,className};\n    }\n    function adminAccessSelectHtml(user){\n      const encoded=encodeURIComponent(String(user?.docId||''));\n      const v2=Number(user?.admission_version)===2;\n      const current=v2&&ADMIN_ACCESS_LEVELS.includes(user?.access_level)?user.access_level:'';\n      const placeholder='<option value="" '+(current?'':'selected')+'>'+esc(adminUiText('Escolha o nível','Choose level'))+'</option>';\n      const options=ADMIN_ACCESS_LEVELS.map(level=>'<option value="'+level+'" '+(current===level?'selected':'')+'>'+esc(adminAccessLevelLabel(level))+'</option>').join('');\n      return '<select id="admin-access-'+encoded+'" class="admin-access-select" aria-label="'+esc(adminUiText('Nível de acesso','Access level'))+'">'+placeholder+options+'</select>';\n    }\n    function adminUserRowHtml(user){\n      const meta=adminUserAccessMeta(user),encoded=encodeURIComponent(String(user?.docId||''));\n      const self=user?.docId===currentAccount?.uid;\n      let actions='<span class="muted">'+esc(adminUiText('Sua conta · protegida','Your account · protected'))+'</span>';\n      if(!self){\n        const select=adminAccessSelectHtml(user);\n        if(!meta.v2){\n          actions=select+'<button class="button secondary" onclick="applyAdmissionAdminAction(\\''+encoded+'\\',\\'migrate\\')">'+esc(adminUiText('Migrar acesso','Migrate access'))+'</button>';\n        }else if(user?.approval_state==='approved'&&!user?.disabled){\n          actions=select+'<button class="button secondary" onclick="applyAdmissionAdminAction(\\''+encoded+'\\',\\'change_level\\')">'+esc(adminUiText('Aplicar nível','Apply level'))+'</button>'\n            +'<button class="button danger" onclick="applyAdmissionAdminAction(\\''+encoded+'\\',\\'deny\\')">'+esc(adminUiText('Negar acesso','Deny access'))+'</button>';\n        }else{\n          const approveLabel=(user?.approval_state==='denied'||user?.disabled)?adminUiText('Reaprovar','Reapprove'):adminUiText('Aprovar','Approve');\n          actions=select+'<button class="button primary" onclick="applyAdmissionAdminAction(\\''+encoded+'\\',\\'approve\\')">'+esc(approveLabel)+'</button>';\n          if(user?.approval_state!=='denied')actions+='<button class="button danger" onclick="applyAdmissionAdminAction(\\''+encoded+'\\',\\'deny\\')">'+esc(adminUiText('Negar','Deny'))+'</button>';\n        }\n      }\n      return '<tr><td><span class="identifier">'+esc(user?.name||'')+'</span></td><td>'+esc(user?.email||'')+'</td><td><span class="status '+meta.className+'">'+esc(meta.label)+'</span></td><td><div class="user-actions">'+actions+'</div></td></tr>';\n    }\n\n    function renderProfile() {`;
app=replaceExactly(app,helperAnchor,helperBlock,'admin UI helpers');

const oldAdminRows=`      const isAdmin = currentAccount.role === 'admin';\n      const adminSection = document.querySelector('#adminUsersSection');\n      adminSection.classList.toggle('hidden', !isAdmin);\n\n      if (isAdmin) {\n        document.querySelector('#adminUserRows').innerHTML = users.map(u => \`\n          <tr>\n            <td><span class=\\"identifier\\">\${esc(u.name)}</span></td>\n            <td>\${esc(u.email)}</td>\n            <td><span class=\\"status \${u.role === 'admin' ? 'done' : 'waiting'}\\">\${u.role === 'admin' ? 'Administrador' : 'Usuário Normal'}</span></td>\n            <td>\n              <div class=\\"user-actions\\">\n                \${u.email !== currentAccount.email && u.email !== ADMIN_EMAIL ? \`\n                  <button class=\\"button secondary\\" onclick=\\"toggleUserRole('\${u.email}')\\">\${u.role === 'admin' ? 'Tornar Usuário' : 'Promover a Adm'}</button>\n                  <button class=\\"button \${u.disabled ? 'secondary' : 'danger'}\\" onclick=\\"toggleUserDisabled('\${u.email}')\\">\${u.disabled ? 'Reativar' : 'Desativar'}</button>\n                \` : '<span class=\\"muted\\">(Conta protegida)</span>'}\n              </div>\n            </td>\n          </tr>\n        \`).join('');\n      }`;
const newAdminRows=`      const isAdmin = canAdminister();\n      const adminSection = document.querySelector('#adminUsersSection');\n      adminSection.classList.toggle('hidden', !isAdmin);\n\n      if (isAdmin) {\n        document.querySelector('#adminUserRows').innerHTML = users.map(adminUserRowHtml).join('');\n      }`;
app=replaceExactly(app,oldAdminRows,newAdminRows,'admin users table');

const oldToggle=`    window.toggleUserRole = async function(email) {\n      if (currentAccount?.role !== 'admin') return alert('Apenas administradores podem alterar permissões.');\n      const u = users.find(user => user.email === email);\n      if (!u || u.email === ADMIN_EMAIL) return;\n      const newRole = u.role === 'admin' ? 'user' : 'admin';\n      await updateDoc(doc(db, 'users', u.docId), { role: newRole, updatedAt: now() });\n    };\n\n    window.toggleUserDisabled = async function(email) {\n      if (currentAccount?.role !== 'admin') return alert('Apenas administradores podem desativar contas.');\n      const u = users.find(user => user.email === email);\n      if (!u || u.email === ADMIN_EMAIL) return;\n      const nextDisabled = !Boolean(u.disabled);\n      await updateDoc(doc(db, 'users', u.docId), { disabled: nextDisabled, updatedAt: now() });\n    };`;
const newToggle=`    window.applyAdmissionAdminAction = async function(encodedUid, action) {\n      if (!canAdminister()) return alert(adminUiText('Apenas administradores ativos podem alterar admissão e níveis de acesso.','Only active administrators can change admission and access levels.'));\n      const targetUid=decodeURIComponent(String(encodedUid||''));\n      if(!targetUid||targetUid===currentAccount?.uid)return alert(adminUiText('A própria conta é protegida contra autoescalonamento e autobloqueio.','Your own account is protected against self-escalation and self-lockout.'));\n      const actor=users.find(user=>user.docId===currentAccount?.uid);\n      const target=users.find(user=>user.docId===targetUid);\n      if(!actor||!target)return alert(adminUiText('Não foi possível localizar o perfil de acesso.','Access profile could not be found.'));\n      const accessLevel=document.getElementById('admin-access-'+encodedUid)?.value||'';\n      if(['migrate','approve','change_level'].includes(action)&&!ADMIN_ACCESS_LEVELS.includes(accessLevel))return alert(adminUiText('Escolha explicitamente o nível de acesso antes de continuar.','Choose the access level explicitly before continuing.'));\n      const at=Date.now();\n      const common={\n        actorProfile:{...actor,uid:actor.uid||actor.docId},\n        actorUid:currentAuthUser?.uid,\n        targetProfile:{...target,uid:target.uid||target.docId},\n        reason:'Central admin UI',\n        at,\n        actorEmailVerified:currentAuthUser?.emailVerified===true\n      };\n      let command;\n      try {\n        if(action==='migrate')command=migrateLegacyProfile({...common,accessLevel});\n        else if(action==='approve')command=approveV2Profile({...common,accessLevel});\n        else if(action==='deny')command=denyV2Profile(common);\n        else if(action==='change_level')command=changeV2AccessLevel({...common,accessLevel});\n        else throw new Error('Ação administrativa de admissão inválida.');\n        const batch=writeBatch(db);\n        batch.update(doc(db,'users',targetUid),command.patch);\n        batch.set(doc(collection(db,'admissionAudit')),command.audit);\n        await withTimeout(batch.commit(),15000,'Atualização auditada de acesso');\n        showSaveToast(adminUiText('Acesso atualizado com trilha de auditoria.','Access updated with an audit trail.'),'success');\n      } catch (error) {\n        console.error('[Central] Falha ao aplicar admissão/RBAC:',error);\n        alert(error?.message||adminUiText('Não foi possível atualizar o acesso.','Access could not be updated.'));\n      }\n    };`;
app=replaceExactly(app,oldToggle,newToggle,'audited admission admin action');

for(const [oldText,newText] of [
  ["currentAccount?.role !== 'admin'","!canAdminister()"],
  ["currentAccount?.role!=='admin'","!canAdminister()"],
  ["currentAccount?.role === 'admin'","canAdminister()"],
  ["currentAccount?.role==='admin'","canAdminister()"],
  ["currentAccount.role === 'admin'","canAdminister()"],
  ["currentAccount.role==='admin'","canAdminister()"]
]) app=app.split(oldText).join(newText);

app=replaceExactly(
  app,
  "        const roleLabel = canAdminister() ? 'Administrador' : 'Usuário Normal';",
  "        const roleLabel = accountAccessLabel(currentAccount);",
  'account access label'
);

app=replaceExactly(
  app,
  "'Cadastre-se para acessar a central. Novas contas iniciam como Usuário Normal.':'Register to access the work center. New accounts start as Standard User.'",
  "'Cadastre-se para acessar a central. Novas contas iniciam como Viewer e aguardam aprovação.':'Register to access the work center. New accounts start as Viewer and await approval.'",
  'registration translation'
);

for(const forbidden of [
  'window.toggleUserRole',
  'window.toggleUserDisabled',
  "currentAccount?.role !== 'admin'",
  "currentAccount?.role!=='admin'",
  "currentAccount?.role === 'admin'",
  "currentAccount?.role==='admin'",
  "currentAccount.role === 'admin'",
  "currentAccount.role==='admin'"
]) if(app.includes(forbidden))throw new Error('legacy admin authority check remains: '+forbidden);
for(const required of [
  "migrateLegacyProfile,approveV2Profile,denyV2Profile,changeV2AccessLevel",
  'function canAdminister()',
  'currentAccount?.capabilities?.administer === true',
  'users.map(adminUserRowHtml)',
  "window.applyAdmissionAdminAction",
  "batch.update(doc(db,'users',targetUid),command.patch)",
  "batch.set(doc(collection(db,'admissionAudit')),command.audit)",
  "await withTimeout(batch.commit(),15000,'Atualização auditada de acesso')"
]) if(!app.includes(required))throw new Error('required audited admission UI integration missing: '+required);
fs.writeFileSync('app.js',app);

let sw=fs.readFileSync('sw.js','utf8');
sw=replaceExactly(
  sw,
  "BASE+'core/access-policy.mjs',BASE+'core/session-admission.mjs',BASE+'ames/data/store.mjs'",
  "BASE+'core/access-policy.mjs',BASE+'core/session-admission.mjs',BASE+'core/admission-admin.mjs',BASE+'ames/data/store.mjs'",
  'admission admin offline dependency'
);
fs.writeFileSync('sw.js',sw);

let index=fs.readFileSync('index.html','utf8');
index=replaceExactly(
  index,
  '<p>Cadastre-se para acessar a central. Novas contas iniciam como Usuário Normal.</p>',
  '<p>Cadastre-se para acessar a central. Novas contas iniciam como Viewer e aguardam aprovação.</p>',
  'registration UI copy'
);
fs.writeFileSync('index.html',index);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\nconst index=fs.readFileSync('index.html','utf8');\n\ntest('admin V2 usa capability e não role legado como autoridade de UI',()=>{\n  assert.match(app,/function canAdminister\\(\\)\\{ return currentAccount\\?\\.capabilities\\?\\.administer === true; \\}/);\n  for(const old of [\"currentAccount?.role !== 'admin'\",\"currentAccount?.role!=='admin'\",\"currentAccount?.role === 'admin'\",\"currentAccount?.role==='admin'\",\"currentAccount.role === 'admin'\",\"currentAccount.role==='admin'\"])assert.equal(app.includes(old),false,old);\n});\n\ntest('gestão de usuários usa comandos de admissão auditados',()=>{\n  assert.match(app,/\\.\\/core\\/admission-admin\\.mjs/);\n  assert.match(app,/migrateLegacyProfile\\(\\{\\.\\.\\.common,accessLevel\\}\\)/);\n  assert.match(app,/approveV2Profile\\(\\{\\.\\.\\.common,accessLevel\\}\\)/);\n  assert.match(app,/denyV2Profile\\(common\\)/);\n  assert.match(app,/changeV2AccessLevel\\(\\{\\.\\.\\.common,accessLevel\\}\\)/);\n  assert.match(app,/batch\\.update\\(doc\\(db,'users',targetUid\\),command\\.patch\\)/);\n  assert.match(app,/batch\\.set\\(doc\\(collection\\(db,'admissionAudit'\\)\\),command\\.audit\\)/);\n  assert.match(app,/batch\\.commit\\(\\)/);\n  assert.doesNotMatch(app,/window\\.toggleUserRole/);\n  assert.doesNotMatch(app,/window\\.toggleUserDisabled/);\n});\n\ntest('UI distingue legado V2 pendente aprovado negado e exige nível explícito',()=>{\n  assert.match(app,/users\\.map\\(adminUserRowHtml\\)/);\n  assert.match(app,/ADMIN_ACCESS_LEVELS = \\['viewer','operator','engineer','supervisor','admin'\\]/);\n  assert.match(app,/Escolha explicitamente o nível de acesso antes de continuar/);\n  assert.match(app,/targetUid===currentAccount\\?\\.uid/);\n  assert.match(app,/Sua conta · protegida/);\n});\n\ntest('módulo admin fica no shell offline e cadastro explica aprovação',()=>{\n  assert.match(sw,/core\\/admission-admin\\.mjs/);\n  assert.match(index,/Novas contas iniciam como Viewer e aguardam aprovação/);\n  assert.match(app,/New accounts start as Viewer and await approval/);\n});\n`;
fs.writeFileSync('scripts/ames-admission-admin-app.test.mjs',test);
console.log('PASS deterministic audited admission admin UI patch');
