import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createAgentClient} from '../ames/agent-client.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {createMesSync} from '../ames/sync.mjs';
import {createMesIntegration} from '../ames/integration-session.mjs';
import {firestoreTransport} from '../ames/firebase-sync.mjs';
import {selectCoraContext} from '../ames/data/cora.mjs';
import {selectTrace} from '../ames/data/trace.mjs';
const modules=process.env.FIREBASE_TEST_MODULES;
const {initializeTestEnvironment}=await import(pathToFileURL(modules+'/@firebase/rules-unit-testing/dist/esm/index.esm.js'));
const fb=await import(pathToFileURL(modules+'/firebase/firestore/dist/index.mjs'));
const env=await initializeTestEnvironment({projectId:'demo-central-mes',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ames-e2e-')),python=process.env.PYTHON_BIN||'python3';
let child,port,client,sync,reader,integration;
async function start(){
  child=spawn(python,['-u','scripts/agent-e2e-server.py',temp],{stdio:['ignore','pipe','pipe']});let output='';
  port=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{output+=b;const m=output.match(/READY (\d+)/);if(m)resolve(Number(m[1]));});child.stderr.on('data',b=>output+=b);child.on('exit',()=>reject(Error(output)));child.on('error',reject);});
}
async function stop(){if(child?.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}}
const api=async(route,body)=>{const response=await fetch(`http://127.0.0.1:${port}/api/v1`+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;};
// The Firestore emulator can emit an upstream transient gRPC Listen error
// (firebase/firebase-tools#8654). Never pass the test until the *actual*
// remote snapshot is visible, but allow its bounded listener backoff.
const eventually=async(fn,label,{timeoutMs=8000,stepMs=35,diagnostics=()=>''}={})=>{
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(await fn()){
      const elapsed=Date.now()-started;
      if(elapsed>500)console.log('E2E TIMING '+label+': '+elapsed+' ms');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,stepMs));
  }
  throw Error('Timeout: '+label+' after '+(Date.now()-started)+'ms '+diagnostics());
};
const awaitRemote=(fn,label,store)=>eventually(fn,label,{
  timeoutMs:75000,stepMs:100,
  diagnostics:()=>JSON.stringify({
    read_status:store.agent().sync?.read_status||'unavailable',
    remote_scope:store.agent().sync?.remote_scope||'unknown',
    remote_line_count:store.agent().sync?.remote_line_count??null,
    // Deliberately never log raw server errors, identities or MES records.
  })
});
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
 // E2E clock follows the synthetic agent's operational day, never runner UTC.
 const snapshotDay=String(after.canonical?.summary?.period?.start_at||'').slice(0,10);
 assert.match(snapshotDay,/^\d{4}-\d{2}-\d{2}$/);
 const factoryClock=()=>new Date(snapshotDay+'T12:00:00-03:00');
 const blob=await client.excel();assert.equal(await blob.slice(0,2).text(),'PK');
 await client.collect('sn',{...scope,sn:'P'});assert.equal((await finish()).status,'done');assert.equal(state.ames.agent().job.result.sn,'P');
 const request={sn:'P',include_3022:false,request_id:'e2e-request-1'},first=await api('/sn-lookup',request),again=await api('/sn-lookup',request);assert.equal(first.id,again.id);
 await client.collect('sn',{...scope,sn:'ERROR'});assert.equal((await finish()).status,'error');
 await client.collect('sn',{...scope,sn:'BLOCK'});await eventually(async()=>(await api('/health')).mes_scheduler.busy,'gate');await client.cancel();assert.equal((await finish()).status,'cancelled');
 const authA={currentUser:{uid:'E2E'}},dbA=env.authenticatedContext('E2E').firestore(),remoteA=firestoreTransport({...fb,db:dbA,auth:authA});
 const queueData=new Map(),queue={put:async e=>queueData.set(e.id,e),remove:async id=>queueData.delete(id),list:async uid=>[...queueData.values()].filter(e=>e.uid===uid)};
 let online=false;sync=createMesSync(state.ames,remoteA,{queue,online:()=>online,now:factoryClock});sync.start('E2E');await sync.capture();assert.equal(queueData.size,3);online=true;await sync.retry();assert.equal(queueData.size,0);
 const sameAccount=createAmesStore(),sameReader=createMesSync(sameAccount,remoteA,{queue,online:()=>false,now:factoryClock});sameReader.start('E2E');await awaitRemote(()=>!!sameAccount.read(scope.lines[0]).snapshot,'same-account remote PC',sameAccount);assert.equal(sameAccount.read(scope.lines[0]).snapshot.revision,after.revision);sameReader.stop();
 const authB={currentUser:{uid:'OTHER'}},dbB=env.authenticatedContext('OTHER').firestore(),remoteB=firestoreTransport({...fb,db:dbB,auth:authB});
 const teammate=createAmesStore();reader=createMesSync(teammate,remoteB,{queue,online:()=>false,now:factoryClock});reader.start('OTHER');await awaitRemote(()=>!!teammate.read(scope.lines[0]).snapshot,'teammate remote PC',teammate);assert.equal(teammate.read(scope.lines[0]).snapshot.revision,after.revision);assert.equal(teammate.read(scope.lines[0]).source,'remote');
 const history=await reader.listHistory(scope.lines[0]);assert.equal(history.length,1);const historical=await reader.openHistory(history[0]);assert.equal(historical.snapshot_id,after.snapshot_id);assert.equal(historical.line_id,scope.lines[0]);assert.equal(historical.source_id,after.source_id);
 // Keep B subscribed while the autonomous factory-side path produces another snapshot.
 sync.stop();client.clear();const ticks=[];online=false;
 integration=createMesIntegration(state.ames,remoteA,{
   transport:{agentToken:'emulator-only',fetcher:(url,options)=>fetch(url.replace('127.0.0.1:8765','127.0.0.1:'+port),options)},
   syncOptions:{queue,online:()=>online,now:factoryClock},schedule:fn=>{ticks.push(fn);return fn;},unschedule:fn=>{const i=ticks.indexOf(fn);if(i>=0)ticks.splice(i,1);}
 });
 integration.start('E2E');await eventually(()=>ticks.length>0,'session starts without Console');
 await eventually(()=>queueData.size>0,'offline outbox populated');
 // Agent monitor/manual API, not a Console action; no DOM/view has been mounted.
 const background=await api('/runs',{preset:'today',lines:scope.lines,performance:'fast'});
 await eventually(async()=>['done','error'].includes((await api('/jobs/'+background.id)).status),'background collection');
 await ticks.shift()();await eventually(()=>queueData.size>=3,'background queued offline');
 const newer=state.ames.read(scope.lines[0]).snapshot;
 assert.notEqual(newer.snapshot_id,after.snapshot_id);
 online=true;await integration.sync.retry();await eventually(()=>queueData.size===0,'outbox recovered');
 await awaitRemote(()=>teammate.read(scope.lines[0]).snapshot?.snapshot_id===newer.snapshot_id,'active B receives background update',teammate);
 assert.equal(teammate.agent().sync.read_status,'ready');assert(teammate.agent().sync.server_received_at);
 assert((await reader.listHistory(scope.lines[0])).length>=2,'previous period/revision survives');
 integration.stop();
 reader.stop();teammate.clear();assert.equal(teammate.read(scope.lines[0]).snapshot,null);
 const id=first.id;await stop();await start();const restored=await api('/sn-lookup',request);assert.equal(restored.id,id);assert.equal((await api('/v2/capabilities')).source_id,after.source_id);
 client.clear();state.ames.clear();assert.equal(state.ames.read(scope.lines[0]).snapshot,null);assert.deepEqual(state.reports,[{id:'manual'}]);
 console.log('PASS: native client -> HTTP agent/scheduler -> simulated MES -> SQLite/revision -> Firebase sanitized team sharing -> second-PC state; collection/SN/deep/error/cancel/restart/idempotence/Excel/logout');
}finally{integration?.stop();client?.clear();sync?.stop();reader?.stop();await stop();await env.cleanup();fs.rmSync(temp,{recursive:true,force:true});}
