import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {createAgentClient} from '../ames/agent-client.mjs';
import {SCHEDULER_POLICY} from '../ames/data/agent-contract.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';

test('completed job re-reads after an older in-flight snapshot refresh',async()=>{
 const line='TAN10101',store=createAmesStore(),timers=[];
 let revision=1,snapshotReads=0,holdNext=false,releaseHeld,heldStarted;
 const entered=new Promise(resolve=>{heldStarted=resolve;});
 const payload=rev=>{
  const p=canonicalAgentFixture(productFixture(line,1));
  p.snapshot_id='7';p.summary.snapshot_id='7';p.source_id='local-fixture';
  p.snapshot_revision=rev;p.content_hash='fixture-r'+rev;
  for(const rows of Object.values(p.datasets))for(const row of rows){row.snapshot_id='7';row.snapshot_revision=rev;}
  return p;
 };
 const fetcher=async(url)=>{
  const u=new URL(url),endpoint=u.pathname.replace('/api/v1','');let value;
  if(endpoint==='/ready')value={ready:true};
  else if(endpoint==='/health')value={agent_version:'0.5.23',mes_scheduler:{policy:SCHEDULER_POLICY}};
  else if(endpoint==='/v2/capabilities')value={schema:'central-ames-v2',native_console:true,revision:true,cursor:true,source_id:'local-fixture'};
  else if(endpoint==='/config')value={configured_lines:[line]};
  else if(endpoint==='/monitor')value={enabled:false};
  else if(endpoint==='/runs')value={id:'JOB-7',status:'queued',kind:'analysis'};
  else if(endpoint==='/jobs/JOB-7')value={id:'JOB-7',kind:'analysis',status:'done',result:{snapshot_ids:{[line]:7}}};
  else if(endpoint==='/v2/snapshots'){
   snapshotReads++;
   // Capture the revision when the HTTP request STARTS; a concurrent MES
   // completion must not mutate this older server response in hindsight.
   const captured=payload(revision),head={...captured,datasets:undefined};
   if(holdNext){holdNext=false;await new Promise(resolve=>{releaseHeld=resolve;heldStarted();});}
   value={snapshots:[head]};
  }
  else if(endpoint==='/v2/records'){
   const p=payload(revision),name=u.searchParams.get('dataset');
   const rows=name==='insights'?[]:(p.datasets[name]||[]);
   value={...p,rows,dataset:name,total:rows.length,next_cursor:null};
  }
  else throw Error('Unexpected agent URL: '+endpoint);
  return {ok:true,status:200,json:async()=>structuredClone(value)};
 };
 const client=createAgentClient(store,{fetcher,agentToken:'synthetic-only',
  schedule:fn=>{timers.push(fn);return fn;},unschedule:()=>{}});
 await client.connect();
 assert.equal(store.localCanonical()[0].snapshot_revision,1);
 await client.collect('today',{lines:[line],performance:'balanced',max_failures:0,max_pcbas:0});
 holdNext=true;
 const periodic=client.refresh();
 await entered;
 const poll=timers.shift()();
 revision=2;
 releaseHeld();
 await Promise.all([periodic,poll]);
 assert.equal(snapshotReads,3,'connect + stale periodic read + mandatory post-job read');
 assert.equal(store.localCanonical()[0].snapshot_revision,2);
 assert.equal(store.agent().job.post_completion_history_check,true);
 client.clear();
});
