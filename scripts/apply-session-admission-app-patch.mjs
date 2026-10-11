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
  "    import {sanitizeLegacyUserMetadata,findLegacyUserMetadata} from './core/auth-hardening.mjs';",
  "    import {sanitizeLegacyUserMetadata,findLegacyUserMetadata} from './core/auth-hardening.mjs';\n    import {buildSignupProfile,evaluateSessionAdmission} from './core/session-admission.mjs';",
  'session admission import'
);

app=replaceExactly(
  app,
  "    let finishLoginPromise = null;\n    let finishLoginUid = null;\n    let authReady = false;",
  "    let finishLoginPromise = null;\n    let finishLoginUid = null;\n    let registrationInProgress = false;\n    let authReady = false;",
  'registration concurrency guard'
);

const oldEnsure=`    async function ensureUserProfile(firebaseUser, legacy = null) {\n      const ref = doc(db, 'users', firebaseUser.uid);\n      const snap = await withTimeout(getDoc(ref), 12000, 'Validação do perfil');\n      const email = (firebaseUser.email || '').toLowerCase();\n      const isAdminEmail = email === ADMIN_EMAIL;\n\n      if (snap.exists()) {\n        const data = snap.data() || {};\n        return {\n          docId: firebaseUser.uid,\n          name: data.name || legacy?.name || firebaseUser.displayName || email.split('@')[0],\n          email: data.email || email,\n          role: data.role || (isAdminEmail ? 'admin' : 'user'),\n          disabled: Boolean(data.disabled),\n          createdAt: data.createdAt || now(),\n          updatedAt: data.updatedAt || now()\n        };\n      }\n\n      const profile = {\n        name: legacy?.name || firebaseUser.displayName || email.split('@')[0],\n        email,\n        role: isAdminEmail ? 'admin' : 'user',\n        disabled: false,\n        createdAt: now(),\n        updatedAt: now()\n      };\n      await withTimeout(setDoc(ref, profile, { merge: true }), 12000, 'Criação do perfil');\n      return { docId: firebaseUser.uid, ...profile };\n    }`;
const newEnsure=`    async function ensureUserProfile(firebaseUser, legacy = null) {\n      const ref = doc(db, 'users', firebaseUser.uid);\n      const snap = await withTimeout(getDoc(ref), 12000, 'Validação do perfil');\n      const email = (firebaseUser.email || '').toLowerCase();\n\n      if (snap.exists()) {\n        const data = snap.data() || {};\n        return {\n          ...data,\n          docId: firebaseUser.uid,\n          uid: data.uid || firebaseUser.uid,\n          name: data.name || legacy?.name || firebaseUser.displayName || email.split('@')[0],\n          email: data.email || email,\n          role: data.role === 'admin' ? 'admin' : 'user',\n          disabled: Boolean(data.disabled),\n          createdAt: data.createdAt || now(),\n          updatedAt: data.updatedAt || now()\n        };\n      }\n\n      const createdAt = now();\n      const profile = {\n        ...buildSignupProfile({\n          uid: firebaseUser.uid,\n          email,\n          name: legacy?.name || firebaseUser.displayName || email.split('@')[0]\n        }),\n        createdAt,\n        updatedAt: createdAt\n      };\n      await withTimeout(setDoc(ref, profile), 12000, 'Criação do perfil');\n      return { docId: firebaseUser.uid, ...profile };\n    }`;
app=replaceExactly(app,oldEnsure,newEnsure,'ensure user profile v2 bootstrap');

const oldAdmission=`        const profile = await ensureUserProfile(firebaseUser, legacyUser);\n        if (profile.disabled) {\n          await signOut(auth);\n          alert('Esta conta está desativada. Procure um administrador.');\n          return null;\n        }\n\n        if(currentAuthUser?.uid && currentAuthUser.uid !== firebaseUser.uid){mesSync?.stop();consoleMesView?.clear();clearSessionData(state);}\n        currentAuthUser = firebaseUser;\n        currentAccount = { uid: firebaseUser.uid, name: profile.name, email: profile.email, role: profile.role };`;
const newAdmission=`        const profile = await ensureUserProfile(firebaseUser, legacyUser);\n        let admission;\n        try {\n          admission = evaluateSessionAdmission({ firebaseUser, profile });\n        } catch (error) {\n          try { await signOut(auth); } catch {}\n          throw error;\n        }\n\n        if(currentAuthUser?.uid && currentAuthUser.uid !== firebaseUser.uid){mesSync?.stop();consoleMesView?.clear();clearSessionData(state);}\n        currentAuthUser = firebaseUser;\n        currentAccount = {\n          uid: firebaseUser.uid,\n          name: admission.name || profile.name,\n          email: admission.email || profile.email,\n          role: admission.role,\n          generation: admission.generation,\n          admissionState: admission.admission_state,\n          accessLevel: admission.access_level,\n          capabilities: admission.capabilities\n        };`;
app=replaceExactly(app,oldAdmission,newAdmission,'finishLogin admission guard');

app=replaceExactly(
  app,
  "        syncFirestore();\n        startMesSync(firebaseUser.uid);\n        renderAccount();",
  "        syncFirestore();\n        if (admission.capabilities.publish_mes) startMesSync(firebaseUser.uid);\n        else mesSync?.stop();\n        renderAccount();",
  'MES sync capability gate'
);

const oldRegister=`    document.querySelector('#registerForm').addEventListener('submit', async e => {\n      e.preventDefault();\n      const formElement = e.currentTarget;\n      const form = new FormData(formElement);\n      const name = form.get('name').trim();\n      const email = form.get('email').trim().toLowerCase();\n      const password = form.get('password');\n      try {\n        const credential = await createUserWithEmailAndPassword(auth, email, password);\n        await setDoc(doc(db, 'users', credential.user.uid), {\n          name, email, role: email === ADMIN_EMAIL ? 'admin' : 'user', disabled: false, createdAt: now(), updatedAt: now()\n        }, { merge: true });\n        try { await sendEmailVerification(credential.user); } catch (verificationError) { console.warn('Não foi possível enviar verificação:', verificationError); }\n        await finishLogin(credential.user);\n        alert(email === ADMIN_EMAIL ? 'Conta de administrador criada e vinculada ao e-mail informado.' : 'Conta criada com sucesso.');\n        formElement.reset();\n      } catch (error) {\n        alert(authErrorMessage(error));\n      }\n    });`;
const newRegister=`    document.querySelector('#registerForm').addEventListener('submit', async e => {\n      e.preventDefault();\n      const formElement = e.currentTarget;\n      const form = new FormData(formElement);\n      const name = form.get('name').trim();\n      const email = form.get('email').trim().toLowerCase();\n      const password = form.get('password');\n      registrationInProgress = true;\n      try {\n        const credential = await createUserWithEmailAndPassword(auth, email, password);\n        const createdAt = now();\n        const profile = {\n          ...buildSignupProfile({ uid: credential.user.uid, email, name }),\n          createdAt,\n          updatedAt: createdAt\n        };\n        await setDoc(doc(db, 'users', credential.user.uid), profile);\n        try { await sendEmailVerification(credential.user); } catch (verificationError) { console.warn('Não foi possível enviar verificação:', verificationError); }\n        await signOut(auth);\n        alert('Conta criada. Confirme seu e-mail corporativo e aguarde a aprovação de um administrador para acessar a Central.');\n        formElement.reset();\n        showAuthScreen('login');\n      } catch (error) {\n        try { if (auth.currentUser) await signOut(auth); } catch {}\n        alert(authErrorMessage(error));\n      } finally {\n        registrationInProgress = false;\n      }\n    });`;
app=replaceExactly(app,oldRegister,newRegister,'v2 registration flow');

app=replaceExactly(
  app,
  "    onAuthStateChanged(auth, async firebaseUser => {\n      if (!firebaseUser) {",
  "    onAuthStateChanged(auth, async firebaseUser => {\n      if (firebaseUser && registrationInProgress) return;\n      if (!firebaseUser) {",
  'registration auth observer guard'
);

const oldUserRefresh=`        const me = currentAuthUser ? users.find(u => u.docId === currentAuthUser.uid) : null;\n        if (me && currentAccount) {\n          currentAccount = { ...currentAccount, name: me.name, email: me.email, role: me.role };\n          if (me.disabled) {\n            alert('Sua conta foi desativada por um administrador.');\n            await signOut(auth);\n            return;\n          }\n        }`;
const newUserRefresh=`        const me = currentAuthUser ? users.find(u => u.docId === currentAuthUser.uid) : null;\n        if (me && currentAccount && currentAuthUser) {\n          try {\n            const hadMesPublish = Boolean(currentAccount.capabilities?.publish_mes);\n            const admission = evaluateSessionAdmission({\n              firebaseUser: currentAuthUser,\n              profile: { ...me, uid: me.uid || me.docId }\n            });\n            currentAccount = {\n              ...currentAccount,\n              name: admission.name || me.name,\n              email: admission.email || me.email,\n              role: admission.role,\n              generation: admission.generation,\n              admissionState: admission.admission_state,\n              accessLevel: admission.access_level,\n              capabilities: admission.capabilities\n            };\n            if (admission.capabilities.publish_mes && !hadMesPublish) startMesSync(currentAuthUser.uid);\n            if (!admission.capabilities.publish_mes && hadMesPublish) mesSync?.stop();\n          } catch (error) {\n            console.warn('[Central] Sessão invalidada por alteração de admissão/RBAC:', error?.code || error?.message || error);\n            await signOut(auth);\n            return;\n          }\n        }`;
app=replaceExactly(app,oldUserRefresh,newUserRefresh,'live session admission refresh');

for(const forbidden of [
  "const isAdminEmail = email === ADMIN_EMAIL",
  "role: email === ADMIN_EMAIL ? 'admin' : 'user'",
  "await finishLogin(credential.user);",
  "Conta de administrador criada e vinculada ao e-mail informado."
]){
  if(app.includes(forbidden))throw new Error('legacy signup/admission authority remains: '+forbidden);
}
for(const required of [
  "buildSignupProfile,evaluateSessionAdmission",
  "admission = evaluateSessionAdmission({ firebaseUser, profile })",
  "if (admission.capabilities.publish_mes) startMesSync(firebaseUser.uid)",
  "registrationInProgress = true",
  "if (firebaseUser && registrationInProgress) return",
  "profile: { ...me, uid: me.uid || me.docId }",
  "accessLevel: admission.access_level",
  "capabilities: admission.capabilities"
]){
  if(!app.includes(required))throw new Error('required session admission integration missing: '+required);
}
fs.writeFileSync('app.js',app);

const test=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst sw=fs.readFileSync('sw.js','utf8');\n\ntest('app usa contrato V2 de cadastro e admissão sem auto-admin por e-mail',()=>{\n  assert.match(app,/\\.\\/core\\/session-admission\\.mjs/);\n  assert.match(app,/buildSignupProfile\\(\\{ uid: credential\\.user\\.uid, email, name \\}\\)/);\n  assert.match(app,/evaluateSessionAdmission\\(\\{ firebaseUser, profile \\}\\)/);\n  assert.doesNotMatch(app,/role: email === ADMIN_EMAIL \\? 'admin' : 'user'/);\n  assert.doesNotMatch(app,/await finishLogin\\(credential\\.user\\)/);\n});\n\ntest('perfil ausente nasce viewer pendente e sessão inválida falha fechada',()=>{\n  assert.match(app,/buildSignupProfile\\(\\{[\\s\\S]*uid: firebaseUser\\.uid,[\\s\\S]*email,[\\s\\S]*name:/);\n  assert.match(app,/try \\{ await signOut\\(auth\\); \\} catch \\{\\}/);\n  assert.match(app,/admissionState: admission\\.admission_state/);\n  assert.match(app,/accessLevel: admission\\.access_level/);\n  assert.match(app,/capabilities: admission\\.capabilities/);\n});\n\ntest('publicação MES e refresh da sessão obedecem capabilities',()=>{\n  assert.match(app,/if \\(admission\\.capabilities\\.publish_mes\\) startMesSync\\(firebaseUser\\.uid\\)/);\n  assert.match(app,/hadMesPublish = Boolean\\(currentAccount\\.capabilities\\?\\.publish_mes\\)/);\n  assert.match(app,/profile: \\{ \\.\\.\\.me, uid: me\\.uid \\|\\| me\\.docId \\}/);\n  assert.match(app,/if \\(!admission\\.capabilities\\.publish_mes && hadMesPublish\\) mesSync\\?\\.stop\\(\\)/);\n});\n\ntest('cadastro bloqueia corrida do auth observer e explica aprovação',()=>{\n  assert.match(app,/registrationInProgress = true/);\n  assert.match(app,/if \\(firebaseUser && registrationInProgress\\) return/);\n  assert.match(app,/Confirme seu e-mail corporativo e aguarde a aprovação de um administrador/);\n});\n\ntest('contratos de admissão ficam disponíveis no shell offline',()=>{\n  assert.match(sw,/core\\/access-policy\\.mjs/);\n  assert.match(sw,/core\\/session-admission\\.mjs/);\n});\n`;
fs.writeFileSync('scripts/ames-session-admission-app.test.mjs',test);
console.log('PASS deterministic session admission app.js patch');
