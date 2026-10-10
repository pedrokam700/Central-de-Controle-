import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const tools=process.env.FIREBASE_TEST_MODULES;
if(!tools)throw Error('Set FIREBASE_TEST_MODULES to isolated node_modules');
const {initializeTestEnvironment,assertSucceeds,assertFails}=await import(pathToFileURL(tools+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const {doc,setDoc,getDoc,deleteDoc}=await import(pathToFileURL(tools+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const uid='A',key='a'.repeat(64),line='TAN10101';
const head={schema:'central-ames-v2',owner_uid:uid,line_id:line,source_id:'source',snapshot_id:'1',snapshot_num:1,snapshot_revision:1,key,hash:key,parts:1,collected_at:'2026-10-09T10:00:00Z'};
try{
  await env.withSecurityRulesDisabled(async c=>{for(const id of ['A','B','disabled'])await setDoc(doc(c.firestore(),'users',id),{email:id+'@example.test',disabled:id==='disabled',role:'user'});});
  const a=env.authenticatedContext('A').firestore(),b=env.authenticatedContext('B').firestore(),guest=env.unauthenticatedContext().firestore(),disabled=env.authenticatedContext('disabled').firestore();
  const path=['amesUsers','A','lines',line],part=[...path,'snapshots',key,'parts','0'],team=['amesTeamLines',line];
  await assertSucceeds(setDoc(doc(a,...part),{owner_uid:'A',line_id:line,key,index:0,data:'sanitized'}));
  await assertSucceeds(setDoc(doc(a,...path),head));
  await assertSucceeds(setDoc(doc(a,...team),head));
  await assertSucceeds(getDoc(doc(a,...path)));
  // Head privado continua do publicador; equipe lê somente a ponte e partes sanitizadas.
  await assertFails(getDoc(doc(b,...path)));
  await assertSucceeds(getDoc(doc(b,...team)));
  await assertSucceeds(getDoc(doc(b,...part)));
  await assertFails(getDoc(doc(guest,...team)));await assertFails(getDoc(doc(guest,...part)));
  await assertFails(getDoc(doc(disabled,...team)));await assertFails(getDoc(doc(disabled,...part)));
  await assertFails(setDoc(doc(b,...path),head));
  await assertFails(setDoc(doc(b,...team),head)); // B não pode alegar owner_uid A.
  const bHead={...head,owner_uid:'B',source_id:'source-b',key:'b'.repeat(64),hash:'b'.repeat(64)};
  await assertSucceeds(setDoc(doc(b,...team),bHead));
  await assertFails(setDoc(doc(a,...path),{...head,line_id:'TAN10102'}));
  await assertFails(setDoc(doc(a,...part),{owner_uid:'A',line_id:line,key,index:0,data:'changed'}));
  await assertSucceeds(setDoc(doc(a,...path),{...head,snapshot_revision:2}));await assertFails(setDoc(doc(a,...path),head));
  await assertFails(setDoc(doc(a,...path),{...head,snapshot_revision:3,password:'secret'}));await assertFails(deleteDoc(doc(a,...path)));
  await assertFails(setDoc(doc(a,'amesUsers','A','lines','TAN99999'),{...head,line_id:'TAN99999'}));
  await assertFails(setDoc(doc(a,'amesTeamLines','TAN99999'),{...head,line_id:'TAN99999'}));
  // Existing manual operations remain compatible.
  await assertSucceeds(setDoc(doc(a,'reports','test'),{description:'manual preserved'}));
  console.log('PASS: owner writes stay isolated; active teammates read sanitized MES through team head; disabled/anonymous denied; manual regression preserved');
}finally{await env.cleanup();}
