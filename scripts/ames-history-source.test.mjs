import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMesHistorySource} from '../ames/history-source.mjs';
const local={
  line_id:'TAN10103',snapshot_id:'2',snapshot_revision:1,source_id:'local-original',
  period_start:'2026-10-16T07:00',period_end:'2026-10-17T07:00',
  collected_at:'2026-10-19T16:08:00Z',products:'CPH2819'
};
test('previous productive day saved on A is discoverable locally when Firebase team history is empty',async()=>{
  let opened=0;
  const source=createMesHistorySource({
    listHistory:async()=>[],
    openHistory:async()=>{throw Error('never open remote');}
  },{
    localHistoryList:async line=>{assert.equal(line,'TAN10103');return [local];},
    historicalPayload:async(sid,line,revision)=>{opened++;assert.equal(sid,'2');assert.equal(line,'TAN10103');assert.equal(revision,1);return {line_id:line,snapshot_id:sid};}
  },{agent:()=>({status:'connected'})});
  const rows=await source.list('TAN10103');
  assert.equal(rows.length,1);
  assert.equal(rows[0].history_source,'local');
  assert.equal((await source.open(rows[0])).snapshot_id,'2');
  assert.equal(opened,1);
});
test('remote versions are marked shared and never discarded when local agent is absent',async()=>{
 const source=createMesHistorySource({
   listHistory:async()=>[{...local,source_id:'remote-other',snapshot_revision:2}],
   openHistory:async h=>({id:h.snapshot_id,source:'shared'})
 },{localHistoryList:async()=>{throw Error('do not call local when disconnected');}},
 {agent:()=>({status:'disconnected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows.length,1);assert.equal(rows[0].history_source,'shared');
 assert.equal((await source.open(rows[0])).source,'shared');
});
test('unversioned local update stays distinct from a shared revision and opens explicitly',async()=>{
 const source=createMesHistorySource({listHistory:async()=>[local]}, {
  localHistoryList:async()=>[{...local,snapshot_revision:undefined}],
  historicalPayload:async(sid,line,revision)=>{assert.equal(revision,null);return {snapshot_revision:2};}
 },{agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');assert.equal(rows.length,2);
 assert.equal(rows[0].revision_pending,true);assert.equal(rows[0].history_source,'local');
 assert.equal(rows[1].history_source,'shared');assert.equal((await source.open(rows[0])).snapshot_revision,2);
});
test('do not claim unconfirmed local version is shared; de-duplicate versions with same owner and revision',async()=>{
 const source=createMesHistorySource({
  listHistory:async()=>[{...local}],openHistory:async()=>({from:'cloud'})
 },{localHistoryList:async()=>[{...local}],historicalPayload:async()=>({from:'local'})},
 {agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows.length,1);assert.equal(rows[0].history_source,'shared');
 assert.equal((await source.open(rows[0])).from,'cloud');
});
test('Firebase listener failure must not hide preserved local history',async()=>{
 const source=createMesHistorySource({
  listHistory:async()=>{throw Error('permission-denied');}
 },{localHistoryList:async()=>[local],historicalPayload:async()=>({verified_local:true})},
 {agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows[0].history_source,'local');
 assert.equal((await source.open(rows[0])).verified_local,true);
});
test('neither source available fails instead of inventing historical evidence',async()=>{
 const source=createMesHistorySource({
  listHistory:async()=>{throw Error('offline');}
 },{localHistoryList:async()=>{throw Error('unavailable');}},
 {agent:()=>({status:'connected'})});
 await assert.rejects(source.list('TAN10103'),/indisponíveis/);
 await assert.rejects(source.list('bad line'),/inválida/);
});
test('Central wiring, discoverable shortcut and secure HTTPS pairing stay explicit',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
 const preparation=fs.readFileSync(new URL('../ames/console-preparation.mjs',import.meta.url),'utf8');
 assert.match(app,/createMesHistorySource\(mesSync,mesIntegration\.client,state\.ames\)/);
 assert.match(ui,/data-open-production-history/);
 assert.match(ui,/switchView\('base'\)/);
 assert.match(preparation,/const visible = expanded \\|\\| \\(\\!connected/,'connected agent is compact until setup is requested');
 assert.match(preparation,/data-pair-official/,'on-demand setup still offers explicit secure pairing');
 assert.match(ui,/data-console-setup/,'configuration remains available from top toolbar');
 assert.match(preparation,/client\.openOfficial\(\)/);
});
