import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {createMesSync} from '../ames/sync.mjs';
import {firestoreTransport} from '../ames/firebase-sync.mjs';
import {selectCoraContext} from '../ames/data/cora.mjs';
import {selectTrace} from '../ames/data/trace.mjs';
const modules=process.env.FIREBASE_TEST_MODULES;
const {initializeTestEnvironment}=await import(pathToFileURL(modules+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const fb=await import(pathToFileURL(modules+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ames-e2e-')),python=process.env.PYTHON_BIN||'python3';
let child,port,client,sync,reader;
async function start(){
  child=spawn(python,['-u','scripts/agent-e2e-server.py',temp],{stdio:['ignore','pipe','pipe']});let output='';
  port=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{output+=b;const m=output.match(/READY (\d+)/);if(m)resolve(Number(m[1]));});child.stderr.on('data',b=>output+=b);child.on('exit',()=>reject(Error(output)));child.on('error',reject);});
}
async function stop(){if(child?.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}}
const api=async(route,body)=>{const response=await fetch(`http://127.0.0.1:${port}/api/v1`+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;};
const eventually=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout: '+label);};
try{
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{for(const id of ['E2E','OTHER'])await fb.setDoc(fb.doc(c.firestore(),'users',id),{email:id.toLowerCase()+'@example.test',role:'user',disabled:false});});
 await start();const state={ames:createAmesStore(),reports:[{id:'manual'}]},pending=[];
 client=createAgentClient(state.ames,{fetcher:(url,options)=>fetch(url.replace('127.0.0.1:8765','127.0.0.1:'+port),options),schedule:fn=>{pending.push(fn);return fn;},unschedule:fn=>{const i=pending.indexOf(fn);if(i>=0)pending.splice(i,1);}});
 await client.connect();assert.equal(state.ames.agent().capabilities.process_timeline,false);
 const scope={lines:['TAN10101','TAN10102','TAN10103'],performance:'fast',max_failures:0,max_pcbas:0,defect_codes:[]};
 const finish=async()=>{const id=state.ames.agent().job.id;await eventually(async()=>['done','error','cancelled'].includes((await api('/jobs/'+id)).status),'job');if(pending.length)await pending.shift()();return state.ames.agent().job;};
 await client.collect('today',scope);assert.equal((await finish()).status,'done');
 for(const line of scope.lines){assert.equal(state.ames.occurrences({line_id:line,product:'CPH2859'}).rows.length,1);assert.equal(state.ames.occurrences({line_id:line,product:'CPH2859V'}).rows.length,1);}
 const before=state.ames.read(scope.lines[0]).snapshot;
 await client.collect('deep',scope);assert.equal((await finish()).status,'done');
 const after=state.ames.read(scope.lines[0]).snapshot;assert(after.revision>before.revision);assert.equal(after.occurrences[0].occurrence_id,before.occurrences[0].occurrence_id);
 assert(after.pcba_history.records.length);assert.equal(after.material_trace.records[0].material_sn,'M');
 const context=selectCoraContext(state.ames,{line_id:scope.lines[0],product:'CPH2859V',pcba_sn:'P',material_sn:'M'});assert(context.material_3074.length);assert.equal(context.human_confirmed_causes.length,0);
 assert.equal(selectTrace(state.ames,{line_id:scope.lines[0],product:'CPH2859V',pcba_sn:'P'},before).status,'invalidated');
 const blob=await client.excel();assert.equal(await blob.slice(0,2).text(),'PK');
 await client.collect('sn',{...scope,sn:'P'});assert.equal((await finish()).status,'done');assert.equal(state.ames.agent().job.result.sn,'P');
 const request={sn:'P',include_3022:false,request_id:'e2e-request-1'},first=await api('/sn-lookup',request),again=await api('/sn-lookup',request);assert.equal(first.id,again.id);
 await client.collect('sn',{...scope,sn:'ERROR'});assert.equal((await finish()).status,'error');
 await client.collect('sn',{...scope,sn:'BLOCK'});await eventually(async()=>(await api('/health')).mes_scheduler.busy,'gate');await client.cancel();assert.equal((await finish()).status,'cancelled');
 const authA={currentUser:{uid:'E2E'}},dbA=env.authenticatedContext('E2E').firestore(),remoteA=firestoreTransport({...fb,db:dbA,auth:authA});
 const queueData=new Map(),queue={put:async e=>queueData.set(e.id,e),remove:async id=>queueData.delete(id),list:async uid=>[...queueData.values()].filter(e=>e.uid===uid)};
 let online=false;sync=createMesSync(state.ames,remoteA,{queue,online:()=>online});sync.start('E2E');await sync.capture();assert.equal(queueData.size,3);online=true;await sync.retry();assert.equal(queueData.size,0);
 // Mesmo usuário, outro PC.
 const sameAccount=createAmesStore(),sameReader=createMesSync(sameAccount,remoteA,{queue,online:()=>false});sameReader.start('E2E');await eventually(()=>!!sameAccount.read(scope.lines[0]).snapshot,'same-account remote PC');assert.equal(sameAccount.read(scope.lines[0]).snapshot.revision,after.revision);sameReader.stop();
 // Usuário diferente da mesma Central lê somente o snapshot sanitizado já publicado.
 const authB={currentUser:{uid:'OTHER'}},dbB=env.authenticatedContext('OTHER').firestore(),remoteB=firestoreTransport({...fb,db:dbB,auth:authB});
 const teammate=createAmesStore();reader=createMesSync(teammate,remoteB,{queue,online:()=>false});reader.start('OTHER');await eventually(()=>!!teammate.read(scope.lines[0]).snapshot,'teammate remote PC');assert.equal(teammate.read(scope.lines[0]).snapshot.revision,after.revision);assert.equal(teammate.read(scope.lines[0]).source,'sync');
 reader.stop();teammate.clear();assert.equal(teammate.read(scope.lines[0]).snapshot,null);
 const id=first.id;await stop();await start();const restored=await api('/sn-lookup',request);assert.equal(restored.id,id);assert.equal((await api('/v2/capabilities')).source_id,after.source_id);
 client.clear();state.ames.clear();assert.equal(state.ames.read(scope.lines[0]).snapshot,null);assert.deepEqual(state.reports,[{id:'manual'}]);
 console.log('PASS: native client -> HTTP agent/scheduler -> simulated MES -> SQLite/revision -> Firebase sanitized team sharing -> second-PC state; collection/SN/deep/error/cancel/restart/idempotence/Excel/logout');
}finally{client?.clear();sync?.stop();reader?.stop();await stop();await env.cleanup();fs.rmSync(temp,{recursive:true,force:true});}
