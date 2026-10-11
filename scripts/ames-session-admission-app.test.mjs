import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

test('app usa contrato V2 de cadastro e admissão sem auto-admin por e-mail',()=>{
  assert.match(app,/\.\/core\/session-admission\.mjs/);
  assert.match(app,/buildSignupProfile\(\{ uid: credential\.user\.uid, email, name \}\)/);
  assert.match(app,/evaluateSessionAdmission\(\{ firebaseUser, profile \}\)/);
  assert.doesNotMatch(app,/role: email === ADMIN_EMAIL \? 'admin' : 'user'/);
  assert.doesNotMatch(app,/await finishLogin\(credential\.user\)/);
});

test('perfil ausente nasce viewer pendente e sessão inválida falha fechada',()=>{
  assert.match(app,/buildSignupProfile\(\{[\s\S]*uid: firebaseUser\.uid,[\s\S]*email,[\s\S]*name:/);
  assert.match(app,/try \{ await signOut\(auth\); \} catch \{\}/);
  assert.match(app,/admissionState: admission\.admission_state/);
  assert.match(app,/accessLevel: admission\.access_level/);
  assert.match(app,/capabilities: admission\.capabilities/);
});

test('publicação MES e refresh da sessão obedecem capabilities',()=>{
  assert.match(app,/if \(admission\.capabilities\.publish_mes\) startMesSync\(firebaseUser\.uid\)/);
  assert.match(app,/hadMesPublish = Boolean\(currentAccount\.capabilities\?\.publish_mes\)/);
  assert.match(app,/profile: \{ \.\.\.me, uid: me\.uid \|\| me\.docId \}/);
  assert.match(app,/if \(!admission\.capabilities\.publish_mes && hadMesPublish\) mesSync\?\.stop\(\)/);
});

test('cadastro bloqueia corrida do auth observer e explica aprovação',()=>{
  assert.match(app,/registrationInProgress = true/);
  assert.match(app,/if \(firebaseUser && registrationInProgress\) return/);
  assert.match(app,/Confirme seu e-mail corporativo e aguarde a aprovação de um administrador/);
});

test('contratos de admissão ficam disponíveis no shell offline',()=>{
  assert.match(sw,/core\/access-policy\.mjs/);
  assert.match(sw,/core\/session-admission\.mjs/);
});
