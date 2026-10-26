import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMesHistorySource,historySharingState,summarizeHistoryPublishers} from '../ames/history-source.mjs';
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
 const matching={...local,content_hash:'same-canonical-content'};
 const source=createMesHistorySource({
  listHistory:async()=>[{...matching}],openHistory:async()=>({from:'cloud'})
 },{localHistoryList:async()=>[{...matching}],historicalPayload:async()=>({from:'local'})},
 {agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows.length,1);assert.equal(rows[0].history_source,'local');
 assert.equal(rows[0].shared_available,true);
 assert.equal(historySharingState(rows[0]),'local_and_shared','a locally preferred opening does not negate a matching remote index');
 assert.equal((await source.open(rows[0])).from,'local');
});
test('visible revision match without canonical content proof retains local and remote separately',async()=>{
 const withLocalHash={...local,content_hash:'local-only-canonical-hash'};
 const source=createMesHistorySource({listHistory:async()=>[{...local,owner_uid:'remote-owner',hash:'transport-SHA'}],
   openHistory:async()=>({from:'cloud'})},
   {localHistoryList:async()=>[withLocalHash],historicalPayload:async()=>({from:'local'})},
   {agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows.length,2,'same version number alone cannot swallow remote history');
 const localRow=rows.find(x=>x.history_source==='local');
 const cloudRow=rows.find(x=>x.history_source==='shared');
 assert.equal(localRow.shared_available,undefined);
 assert.equal(localRow.shared_candidate,true);
 assert.equal(historySharingState(localRow),'local_candidate');
 assert.equal((await source.open(localRow)).from,'local');
 assert.equal((await source.open(cloudRow)).from,'cloud');
});
test('sharing state never treats an unverified local revision as synchronized',()=>{
 assert.equal(historySharingState({history_source:'local'}),'local_only');
 assert.equal(historySharingState({history_source:'local',shared_available:false}),'local_only');
 assert.equal(historySharingState({history_source:'local',shared_candidate:true}),'local_candidate');
 assert.equal(historySharingState({history_source:'shared'}),'shared');
 assert.equal(historySharingState({}),'unverified');
});
test('two legitimate publishers on the same line/day remain separate observations',()=>{
 const a={...local,line_id:'TAN10102',source_id:'workstation-A',snapshot_id:'11',snapshot_revision:1,
  period_start:'2026-10-23T07:00:00-03:00',period_end:'2026-10-23T12:00:00-03:00'};
 const b={...a,source_id:'workstation-B',snapshot_id:'20',period_end:'2026-10-23T14:00:00-03:00'};
 const summary=summarizeHistoryPublishers([a,a,{...a,snapshot_revision:2},b], 'TAN10102');
 assert.deepEqual(summary.origins.map(o=>[o.source_id,o.revisions]),[['workstation-A',2],['workstation-B',1]]);
 assert.deepEqual(summary.overlapping_days,[{day:'2026-10-23',source_ids:['workstation-A','workstation-B']}]);
 assert.equal(summarizeHistoryPublishers([a,{...b,line_id:'TAN10103'}],'TAN10102').overlapping_days.length,0);
});
test('two remote owners reusing the same source ID and revision cannot erase each other',async()=>{
 const base={...local,line_id:'TAN10102',source_id:'collision-source',snapshot_id:'9',snapshot_revision:3,
   period_start:'2026-10-23T07:00:00-03:00',period_end:'2026-10-23T14:00:00-03:00'};
 const a={...base,owner_uid:'private-owner-A',key:'immutable-A',hash:'hash-A'};
 const b={...base,owner_uid:'private-owner-B',key:'immutable-B',hash:'hash-B'};
 const source=createMesHistorySource({listHistory:async()=>[a,b],openHistory:async h=>({key:h.key})},
   {localHistoryList:async()=>{throw Error('must not query an unpaired PC');}},
   {agent:()=>({status:'disconnected'})});
 const rows=await source.list('TAN10102');
 assert.equal(rows.length,2,'two immutable cloud documents with identical visible IDs are distinct');
 assert.deepEqual(new Set(rows.map(x=>x.key)),new Set(['immutable-A','immutable-B']));
 for(const row of rows)assert.equal((await source.open(row)).key,row.key);
 const summary=summarizeHistoryPublishers(rows,'TAN10102');
 assert.deepEqual(summary.identity_collisions,[{source_id:'collision-source',installations:2}]);
 assert.equal(summary.installation_count,2);
 assert.deepEqual(summary.overlapping_days,[{day:'2026-10-23',source_ids:['collision-source','collision-source']}]);
 assert.equal(JSON.stringify(summary).includes('private-owner-'),false,'UI summary never copies owner UID');
});
test('ambiguous remote counterpart never makes a local SQLite revision falsely shared',async()=>{
 const a={...local,owner_uid:'owner-A',key:'key-A'},b={...local,owner_uid:'owner-B',key:'key-B'};
 const source=createMesHistorySource({listHistory:async()=>[a,b]},
   {localHistoryList:async()=>[local],historicalPayload:async()=>({opened:'local'})},
   {agent:()=>({status:'connected'})});
 const rows=await source.list('TAN10103');
 assert.equal(rows.length,3,'both remote revisions and local row preserved');
 const localRow=rows.find(row=>row.history_source==='local');
 assert.equal(localRow.shared_available,undefined);
 assert.equal(localRow.shared_ambiguous,true);
 assert.equal(historySharingState(localRow),'local_only');
 assert.equal((await source.open(localRow)).opened,'local');
});
test('a local unknown-UID revision and one verified owner do not invent another installation',()=>{
 const a={...local,owner_uid:'private-one'};
 const result=summarizeHistoryPublishers([a,{...a,owner_uid:undefined,snapshot_id:'3'}],'TAN10103');
 assert.equal(result.installation_count,1);
 assert.deepEqual(result.identity_collisions,[]);
 assert.deepEqual(result.overlapping_days,[]);
});
test('multiple origins on separate days are not falsely labeled as simultaneous publishers',()=>{
 const a={...local,source_id:'PC-A',snapshot_id:'1'};
 const b={...a,source_id:'PC-B',snapshot_id:'2',period_start:'2026-10-17T07:00',period_end:'2026-10-18T07:00'};
 const result=summarizeHistoryPublishers([a,b],'TAN10103');
 assert.equal(result.origins.length,2);
 assert.deepEqual(result.overlapping_days,[]);
});
test('multi-publisher historical UI is explicitly read-only and keeps source filtering local',()=>{
 const view=fs.readFileSync(new URL('../ames/console-history.mjs',import.meta.url),'utf8');
 assert.match(view,/data-history-multi-publisher/);
 assert.match(view,/data-history-origin-filter/);
 assert.match(view,/Não somar ocorrências de coletas sobrepostas/);
 assert.match(view,/originFilter=event\.target\.value/);
  assert.match(view,/dataset\.historyIdentityCollision/);
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
 assert.match(preparation,/const visible = expanded/,'operator may explicitly open setup');
 assert.match(preparation,/!connected && mode/,'connected agent does not force setup into normal operation');
 assert.match(preparation,/data-pair-official/,'on-demand setup still offers explicit secure pairing');
 assert.match(ui,/data-console-setup/,'configuration remains available from top toolbar');
 assert.match(preparation,/client\.openOfficial\(\)/);
});

test('connected local SQLite failure is surfaced rather than misreported as no collected history',async()=>{
 const source=createMesHistorySource(
  {listHistory:async()=>[]},
  {localHistoryList:async()=>{throw Error('sqlite local unavailable');}},
  {agent:()=>({status:'connected'})});
 await assert.rejects(source.list('TAN10103'),/Histórico SQLite local indisponível/);
});

test('a divergent cloud row cannot silently replace the same local immutable revision',async()=>{
 const source=createMesHistorySource({listHistory:async()=>[{...local,content_hash:'cloud-different'}]},{
  localHistoryList:async()=>[{...local,content_hash:'local-original'}],
  historicalPayload:async()=>{throw Error('never open inconsistent revision');}
 },{agent:()=>({status:'connected'})});
 await assert.rejects(source.list('TAN10103'),/Conflito de integridade/);
});

test('cloud error with empty local SQLite index reports partial unavailability rather than zero history',async()=>{
 const source=createMesHistorySource({listHistory:async()=>{throw Error('offline cloud');}},{
  localHistoryList:async()=>[]
 },{agent:()=>({status:'connected'})});
 await assert.rejects(source.list('TAN10103'),/Histórico compartilhado indisponível/);
});
