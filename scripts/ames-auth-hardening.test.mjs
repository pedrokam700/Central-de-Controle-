import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitizeLegacyUserMetadata,findLegacyUserMetadata,LEGACY_CREDENTIALS_MIGRATION} from '../core/auth-hardening.mjs';

function storage(seed={}){
  const map=new Map(Object.entries(seed));
  return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),map};
}

test('migração conserva somente nome/email e elimina senha/role local',()=>{
  const s=storage({'controleFalhas.users.v1':JSON.stringify([
    {name:'Pedro',email:'PEDRO@EMPRESA.COM',password:'segredo',role:'admin',token:'x'},
    {name:'Outra',email:'outra@empresa.com',password:'123',role:'user'}
  ])});
  const rows=sanitizeLegacyUserMetadata(s,{now:()=>123});
  assert.deepEqual(rows,[{name:'Pedro',email:'pedro@empresa.com'},{name:'Outra',email:'outra@empresa.com'}]);
  const persisted=JSON.parse(s.getItem('controleFalhas.users.v1'));
  assert.deepEqual(persisted,rows);
  assert.equal(JSON.stringify(persisted).includes('segredo'),false);
  assert.equal(JSON.stringify(persisted).includes('password'),false);
  assert.equal(JSON.stringify(persisted).includes('role'),false);
  const marker=JSON.parse(s.getItem(LEGACY_CREDENTIALS_MIGRATION.marker));
  assert.equal(marker.status,'credentials_removed');assert.equal(marker.users,2);
});

test('storage legado corrompido é removido em vez de virar fonte de credencial',()=>{
  const s=storage({'controleFalhas.users.v1':'{"password":"secret"'});
  assert.deepEqual(sanitizeLegacyUserMetadata(s,{now:()=>1}),[]);
  assert.equal(s.getItem('controleFalhas.users.v1'),null);
  assert.match(s.getItem(LEGACY_CREDENTIALS_MIGRATION.marker),/removed_corrupt_legacy_storage/);
});

test('metadata duplicada por e-mail não preserva autoridade local',()=>{
  const s=storage({'controleFalhas.users.v1':JSON.stringify([
    {name:'Primeiro',email:'u@empresa.com',role:'admin'},
    {name:'Segundo',email:'U@EMPRESA.COM',password:'x'}
  ])});
  const rows=sanitizeLegacyUserMetadata(s);assert.equal(rows.length,1);
  assert.deepEqual(findLegacyUserMetadata(rows,'U@empresa.com'),{name:'Primeiro',email:'u@empresa.com'});
  assert.equal(findLegacyUserMetadata(rows,'none@empresa.com'),null);
});

test('bloqueio de escrita local não reativa autenticação legada nem derruba bootstrap',()=>{
  const raw=JSON.stringify([{name:'User',email:'u@empresa.com',password:'secret',role:'admin'}]);
  let removed=false;
  const blocked={
    getItem:key=>key===LEGACY_CREDENTIALS_MIGRATION.key?raw:null,
    setItem(){throw new Error('storage blocked');},
    removeItem(){removed=true;throw new Error('storage blocked');}
  };
  const rows=sanitizeLegacyUserMetadata(blocked);
  assert.deepEqual(rows,[{name:'User',email:'u@empresa.com'}]);
  assert.equal(removed,true);
});

test('contrato H3A exige Firebase como única autoridade',()=>{
  assert.equal(LEGACY_CREDENTIALS_MIGRATION.authority,'firebase-only');
  const app=fs.readFileSync('app.js','utf8');
  const sw=fs.readFileSync('sw.js','utf8');
  assert.match(app,/\.\/core\/auth-hardening\.mjs/);
  assert.match(app,/sanitizeLegacyUserMetadata/);
  assert.match(app,/const credential = await signInWithEmailAndPassword\(auth, email, password\)/);
  assert.doesNotMatch(app,/legacy\.password\s*===\s*password/);
  assert.doesNotMatch(app,/auth\/invalid-credential[\s\S]{0,600}createUserWithEmailAndPassword/);
  assert.doesNotMatch(app,/legacy\?\.role/);
  assert.match(sw,/core\/auth-hardening\.mjs/);
});
