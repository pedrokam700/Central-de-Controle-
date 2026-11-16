import {strict as assert} from 'node:assert';
import {createAgentClient} from '../agent-client.mjs';
import {collectionStatus} from '../collection-status.mjs';

let clock=100_000, jobReads=0, snapshotsReads=0;
const scheduled=[], notifications=[], states=['running','running','running','done'];
const state={status:'connected',capabilities:{schema:'central-ames-v2'},job:null};
const store={
 agent:()=>state,
 updateAgent:patch=>Object.assign(state,patch),
 setLocalConnected:()=>{},
 localCanonical:()=>[],
 replaceLocalSnapshots:()=>[]
};
const fetcher=async (url,opts)=>{
 const path=new URL(url).pathname;
 let result;
 if(path.endsWith('/sn-lookup'))result={id:'test-job-01',kind:'sn_lookup',status:'queued',message:'Na fila'};
 else if(path.endsWith('/jobs/test-job-01')){
   const status=states[Math.min(jobReads++,states.length-1)];
   result={id:'test-job-01',kind:'sn_lookup',status,stage:status==='done'?'done':'3022',partial_refresh:jobReads,progress:status==='done'?100:jobReads*20};
 }
 else if(path.endsWith('/v2/snapshots')){snapshotsReads++;result={snapshots:[]};}
 else throw Error('unexpected '+url);
 return {ok:true,status:200,json:async()=>result};
};
const client=createAgentClient(store,{fetcher,agentToken:'test-token',now:()=>clock,changed:kind=>notifications.push(kind||'data'),schedule:(fn,ms)=>{scheduled.push({fn,ms});return fn;},unschedule:()=>{}});
await client.collect('sn',{sn:'002528000000000000000001'});
assert.equal(scheduled.length,1);
async function tick(delta){clock+=delta;const todo=scheduled.shift();assert(todo);await todo.fn();}
await tick(1_000);assert.equal(snapshotsReads,1,'first partial progress may refresh once');
await tick(1_000);assert.equal(snapshotsReads,1,'an 850ms poll must not reload all snapshots');
await tick(16_000);assert.equal(snapshotsReads,2,'an updated partial revision can refresh after 15s');
await tick(1_000);assert.equal(snapshotsReads,3,'terminal status must refresh immediately');
assert.equal(jobReads,4);
assert.equal(notifications.filter(x=>x==='job-poll').length,3);
assert.equal(notifications.filter(x=>x==='job-finished').length,1);
assert(collectionStatus({job:{id:'j',kind:'deep_trace',status:'queued',message:'Na fila',scope:{trace_mode:'full'}}}).includes('data-mes-waiting'));
assert(!collectionStatus({job:{id:'j',kind:'deep_trace',status:'done',message:'done'}}).includes('data-mes-waiting'));
client.clear();
console.log('PASS 4 job ticks, refresh throttle, completion refresh, queue label, and notification kinds');
