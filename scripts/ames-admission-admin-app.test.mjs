import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const index=fs.readFileSync('index.html','utf8');

test('admin V2 usa capability e não role legado como autoridade de UI',()=>{
  assert.match(app,/function canAdminister\(\)\{ return (?:currentAccount\?\.capabilities\?\.administer === true|hasCapability\('administer'\)); \}/);
  for(const old of ["currentAccount?.role !== 'admin'","currentAccount?.role!=='admin'","currentAccount?.role === 'admin'","currentAccount?.role==='admin'","currentAccount.role === 'admin'","currentAccount.role==='admin'"])assert.equal(app.includes(old),false,old);
});

test('gestão de usuários usa comandos de admissão auditados',()=>{
  assert.match(app,/\.\/core\/admission-admin\.mjs/);
  assert.match(app,/migrateLegacyProfile\(\{\.\.\.common,accessLevel\}\)/);
  assert.match(app,/approveV2Profile\(\{\.\.\.common,accessLevel\}\)/);
  assert.match(app,/denyV2Profile\(common\)/);
  assert.match(app,/changeV2AccessLevel\(\{\.\.\.common,accessLevel\}\)/);
  assert.match(app,/batch\.update\(doc\(db,'users',targetUid\),command\.patch\)/);
  assert.match(app,/batch\.set\(doc\(collection\(db,'admissionAudit'\)\),command\.audit\)/);
  assert.match(app,/batch\.commit\(\)/);
  assert.doesNotMatch(app,/window\.toggleUserRole/);
  assert.doesNotMatch(app,/window\.toggleUserDisabled/);
});

test('UI distingue legado V2 pendente aprovado negado e exige nível explícito',()=>{
  assert.match(app,/users\.map\(adminUserRowHtml\)/);
  assert.match(app,/ADMIN_ACCESS_LEVELS = \['viewer','operator','engineer','supervisor','admin'\]/);
  assert.match(app,/Escolha explicitamente o nível de acesso antes de continuar/);
  assert.match(app,/targetUid===currentAccount\?\.uid/);
  assert.match(app,/Sua conta · protegida/);
});

test('módulo admin fica no shell offline e cadastro explica aprovação',()=>{
  assert.match(sw,/core\/admission-admin\.mjs/);
  assert.match(index,/Novas contas iniciam como Viewer e aguardam aprovação/);
  assert.match(app,/New accounts start as Viewer and await approval/);
});
