import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {COLLECTOR_LEASE_SCHEMA} from '../ames/data/collector-authority.mjs';
import {createCollectorAuthorityRuntime,COLLECTOR_AUTHORITY_RUNTIME_SCHEMA} from '../ames/collector-authority-runtime.mjs';

const ws='ws_'+'a'.repeat(32),TS=Symbol('serverTimestamp');
const lease=(line,overrides={})=>({schema:COLLECTOR_LEASE_SCHEMA,line_id:line,owner_uid:'A',workstation_id:ws,generation:4,acquired_at:'old',renewed_at:'old',status:'active',...overrides});
const snap=data=>({exists:()=>data!=null,data:()=>data});

function rig({uid='A',identity=true,lines=['TAN10101'],remoteByLine={TAN10101:lease('TAN10101')},clock=1000}={}){
  const store=createAmesStore();
  store.updateAgent({status:'connected',config:{configured_lines:lines},workstation_identity:identity?{schema:'central-workstation-identity-v1',workstation_id:ws,stable:true,identity_kind:'random_local_capability'}:null});
  let reads=0,transactions=0,timestamps=0,changed=0,nowValue=clock;
  const runtime=createCollectorAuthorityRuntime(store,{
    db:{id:'db'},
    doc(_db,collection,id){return {collection,id};},
    async getDoc(ref){reads++;return snap(remoteByLine[ref.id]??null);},
    async runTransaction(){transactions++;throw new Error('runtime observer must not transact');},
    serverTimestamp(){timestamps++;return TS;},
    currentUid:()=>uid,
    now:()=>nowValue,
    minIntervalMs:30000,
    changed(){changed++;}
  });
  return {store,runtime,reads:()=>reads,transactions:()=>transactions,timestamps:()=>timestamps,changed:()=>changed,tick:ms=>{nowValue+=ms;}};
}

test('runtime observer publishes only sanitized per-line diagnostics and never writes',async()=>{
  const h=rig({remoteByLine:{
    TAN10101:lease('TAN10101'),
    TAN10102:lease('TAN10102',{owner_uid:'B',workstation_id:'ws_'+'b'.repeat(32)}),
    TAN10103:null
  },lines:['TAN10103','TAN10101','TAN10102']});
  const state=await h.runtime.refresh({force:true});
  assert.equal(state.schema,COLLECTOR_AUTHORITY_RUNTIME_SCHEMA);
  assert.equal(state.mode,'observe_only');
  assert.equal(state.authoritative,false);assert.equal(state.enforcement,false);
  assert.deepEqual(state.lines.map(x=>[x.line_id,x.status]),[
    ['TAN10101','same_workstation_candidate'],['TAN10102','held_by_other'],['TAN10103','vacant']
  ]);
  assert.equal(h.reads(),3);assert.equal(h.transactions(),0);assert.equal(h.timestamps(),0);
  const serialized=JSON.stringify(state);
  assert.equal(serialized.includes('owner_uid'),false);
  assert.equal(serialized.includes('workstation_id'),false);
  assert.equal(serialized.includes('candidate_fence'),false);
  assert.equal(serialized.includes('publication_fence'),false);
});

test('missing session, workstation identity or configured lines performs zero remote reads',async()=>{
  for(const options of [{uid:''},{identity:false},{lines:[]}]){
    const h=rig(options);const state=await h.runtime.refresh({force:true});
    assert.equal(state.authoritative,false);assert.equal(state.enforcement,false);assert.equal(h.reads(),0);assert.equal(h.transactions(),0);
  }
});

test('runtime deduplicates configured lines and throttles repeated agent progress changes',async()=>{
  const h=rig({lines:['TAN10101','TAN10101']});
  await h.runtime.refresh();assert.equal(h.reads(),1);
  await h.runtime.refresh();assert.equal(h.reads(),1);
  h.tick(29999);await h.runtime.refresh();assert.equal(h.reads(),1);
  h.tick(1);await h.runtime.refresh();assert.equal(h.reads(),2);
  await h.runtime.refresh({force:true});assert.equal(h.reads(),3);
});

test('identity or account change rebuilds observer context instead of reusing previous authority candidate',async()=>{
  let uid='A';
  const store=createAmesStore();store.updateAgent({config:{configured_lines:['TAN10101']},workstation_identity:{workstation_id:ws,stable:true}});
  let reads=0;
  const runtime=createCollectorAuthorityRuntime(store,{db:{},doc(_d,_c,id){return{id};},getDoc:async()=>{reads++;return snap(lease('TAN10101',{owner_uid:uid}));},runTransaction:async()=>{throw new Error('no writes');},serverTimestamp:()=>TS,currentUid:()=>uid,now:()=>1000,minIntervalMs:30000});
  await runtime.refresh();assert.equal(reads,1);
  uid='B';await runtime.refresh();assert.equal(reads,2);
  assert.equal(store.agent().collector_authority.lines[0].status,'same_workstation_candidate');
});

test('clear removes runtime collector diagnostics and activation explicitly disables claim confirm fence and enforcement',async()=>{
  const h=rig();await h.runtime.refresh({force:true});
  h.runtime.clear();assert.equal(h.store.agent().collector_authority,null);
  assert.equal(h.runtime.activation,'runtime_observer_only_no_claim_no_confirm_no_fence_no_enforcement');
  assert.equal(typeof h.runtime.claim,'undefined');assert.equal(typeof h.runtime.confirmOwned,'undefined');
});
