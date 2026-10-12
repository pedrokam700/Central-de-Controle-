import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {COLLECTOR_LEASE_SCHEMA} from '../ames/data/collector-authority.mjs';
import {createCollectorAuthorityRuntime,COLLECTOR_AUTHORITY_RUNTIME_SCHEMA} from '../ames/collector-authority-runtime.mjs';

const ws='ws_'+'a'.repeat(32),otherWs='ws_'+'b'.repeat(32),TS=Symbol('serverTimestamp');
const lease=(line,overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:line,owner_uid:'A',workstation_id:ws,generation:4,acquired_at:'old',renewed_at:'old',status:'active',...overrides});
const snap=data=>({exists:()=>data!=null,data:()=>data});

function rig({uid='A',identity=true,lines=['TAN10101'],remoteByLine={TAN10101:lease('TAN10101')},clock=1000,transactionFailureByLine={}}={}){
  const store=createAmesStore();
  store.updateAgent({status:'connected',config:{configured_lines:lines},workstation_identity:identity?{schema:'central-workstation-identity-v1',workstation_id:ws,stable:true,identity_kind:'random_local_capability'}:null});
  let reads=0,transactionReads=0,transactions=0,timestamps=0,changed=0,nowValue=clock;
  const writes=[];
  const runtime=createCollectorAuthorityRuntime(store,{
    db:{id:'db'},
    doc(_db,collection,id){return {collection,id};},
    async getDoc(ref){reads++;return snap(remoteByLine[ref.id]??null);},
    async runTransaction(_db,callback){
      transactions++;let activeLine=null,proposed=null;
      const tx={
        async get(ref){activeLine=ref.id;transactionReads++;return snap(remoteByLine[ref.id]??null);},
        set(ref,payload){activeLine=ref.id;proposed=payload;writes.push({line:ref.id,payload});}
      };
      const result=await callback(tx);
      const failure=transactionFailureByLine[activeLine];
      if(failure)throw failure;
      if(proposed)remoteByLine[activeLine]={...proposed,renewed_at:'server-renewed'};
      return result;
    },
    serverTimestamp(){timestamps++;return TS;},
    currentUid:()=>uid,
    now:()=>nowValue,
    minIntervalMs:30000,
    changed(){changed++;}
  });
  return {store,runtime,reads:()=>reads,transactionReads:()=>transactionReads,transactions:()=>transactions,timestamps:()=>timestamps,writes,changed:()=>changed,tick:ms=>{nowValue+=ms;}};
}

test('runtime confirms only same-workstation candidate and keeps public diagnostics sanitized',async()=>{
  const h=rig({remoteByLine:{
    TAN10101:lease('TAN10101'),
    TAN10102:lease('TAN10102',{owner_uid:'B',workstation_id:otherWs}),
    TAN10103:null
  },lines:['TAN10103','TAN10101','TAN10102']});
  const state=await h.runtime.refresh({force:true});
  assert.equal(state.schema,COLLECTOR_AUTHORITY_RUNTIME_SCHEMA);
  assert.equal(state.mode,'observe_and_confirm_same_workstation');
  assert.equal(state.authoritative,false);assert.equal(state.enforcement,false);
  assert.deepEqual(state.lines.map(x=>[x.line_id,x.status,x.authoritative]),[
    ['TAN10101','confirmed_current',true],['TAN10102','held_by_other',false],['TAN10103','vacant',false]
  ]);
  assert.equal(h.reads(),3);
  assert.equal(h.transactions(),1);
  assert.equal(h.transactionReads(),1);
  assert.equal(h.timestamps(),1);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].line,'TAN10101');assert.equal(h.writes[0].payload.generation,4);assert.equal(h.writes[0].payload.acquired_at,'old');
  const serialized=JSON.stringify(state);
  for(const forbidden of ['owner_uid','workstation_id','candidate_fence','publication_fence',ws,otherWs])assert.equal(serialized.includes(forbidden),false,forbidden);
});

test('vacant held-by-other and unavailable observations never transact',async()=>{
  for(const options of [
    {remoteByLine:{TAN10101:null}},
    {remoteByLine:{TAN10101:lease('TAN10101',{owner_uid:'B',workstation_id:otherWs})}}
  ]){
    const h=rig(options);await h.runtime.refresh({force:true});assert.equal(h.transactions(),0);assert.equal(h.timestamps(),0);assert.equal(h.writes.length,0);
  }
  const store=createAmesStore();store.updateAgent({config:{configured_lines:['TAN10101']},workstation_identity:{workstation_id:ws,stable:true}});
  let transactions=0;
  const runtime=createCollectorAuthorityRuntime(store,{db:{},doc(_d,_c,id){return{id};},getDoc:async()=>{throw new Error('read failed');},runTransaction:async()=>{transactions++;throw new Error('must not transact');},serverTimestamp:()=>TS,currentUid:()=>'A',now:()=>1,minIntervalMs:0});
  const state=await runtime.refresh({force:true});assert.equal(state.lines[0].status,'unavailable');assert.equal(transactions,0);
});

test('server denial of same-generation confirmation becomes not_confirmed and never exposes fence',async()=>{
  const denial=Object.assign(new Error('server says expired'),{code:'permission-denied'});
  const h=rig({transactionFailureByLine:{TAN10101:denial}});
  const state=await h.runtime.refresh({force:true});
  assert.equal(state.lines[0].status,'not_confirmed');assert.equal(state.lines[0].authoritative,false);
  assert.equal(h.transactions(),1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].payload.generation,4);
  assert.equal(JSON.stringify(state).includes('publication_fence'),false);
});

test('missing session, workstation identity or configured lines performs zero remote activity',async()=>{
  for(const options of [{uid:''},{identity:false},{lines:[]}]){
    const h=rig(options);const state=await h.runtime.refresh({force:true});
    assert.equal(state.authoritative,false);assert.equal(state.enforcement,false);assert.equal(h.reads(),0);assert.equal(h.transactions(),0);assert.equal(h.timestamps(),0);
  }
});

test('runtime deduplicates configured lines and throttles both reads and confirmations',async()=>{
  const h=rig({lines:['TAN10101','TAN10101']});
  await h.runtime.refresh();assert.equal(h.reads(),1);assert.equal(h.transactions(),1);
  await h.runtime.refresh();assert.equal(h.reads(),1);assert.equal(h.transactions(),1);
  h.tick(29999);await h.runtime.refresh();assert.equal(h.reads(),1);assert.equal(h.transactions(),1);
  h.tick(1);await h.runtime.refresh();assert.equal(h.reads(),2);assert.equal(h.transactions(),2);
  await h.runtime.refresh({force:true});assert.equal(h.reads(),3);assert.equal(h.transactions(),3);
});

test('identity or account change rebuilds confirmation context instead of reusing prior private fence',async()=>{
  let uid='A';
  const remote={TAN10101:lease('TAN10101')};
  const store=createAmesStore();store.updateAgent({config:{configured_lines:['TAN10101']},workstation_identity:{workstation_id:ws,stable:true}});
  let reads=0,transactions=0;
  const runtime=createCollectorAuthorityRuntime(store,{db:{},doc(_d,_c,id){return{id};},getDoc:async ref=>{reads++;return snap(remote[ref.id]);},runTransaction:async(_db,callback)=>{transactions++;let line;const tx={get:async ref=>{line=ref.id;return snap(remote[ref.id]);},set(ref,payload){line=ref.id;remote[line]={...payload,renewed_at:'server'};}};return callback(tx);},serverTimestamp:()=>TS,currentUid:()=>uid,now:()=>1000,minIntervalMs:30000});
  await runtime.refresh();assert.equal(reads,1);assert.equal(transactions,1);assert.equal(store.agent().collector_authority.lines[0].status,'confirmed_current');
  uid='B';remote.TAN10101=lease('TAN10101',{owner_uid:'B'});await runtime.refresh();assert.equal(reads,2);assert.equal(transactions,2);assert.equal(store.agent().collector_authority.lines[0].status,'confirmed_current');
});

test('clear removes diagnostics/private confirmation context and runtime exposes no acquisition or fence API',async()=>{
  const h=rig();await h.runtime.refresh({force:true});
  h.runtime.clear();assert.equal(h.store.agent().collector_authority,null);
  assert.equal(h.runtime.activation,'runtime_same_workstation_server_confirmation_private_fence_no_sync_binding_no_enforcement');
  assert.equal(typeof h.runtime.claim,'undefined');assert.equal(typeof h.runtime.confirmOwned,'undefined');assert.equal(typeof h.runtime.takeover,'undefined');assert.equal(typeof h.runtime.publicationFence,'undefined');
});
