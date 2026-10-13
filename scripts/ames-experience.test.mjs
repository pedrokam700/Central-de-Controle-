import {test} from 'node:test';
import assert from 'node:assert/strict';
import {centralEntry} from '../core/login-navigation.mjs';
import {consoleText} from '../ames/console-i18n.mjs';
import {workstationChecks} from '../ames/console-preparation.mjs';
import {migrationDownload} from '../ames/migration-download.mjs';
import {coverageState,historyMetadata,matchesPeriod} from '../ames/data/history.mjs';
import {createAmesStore} from '../ames/data/store.mjs';
import {createMesSync,publication} from '../ames/sync.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
const fixture=()=>{const p=canonicalAgentFixture(productFixture());p.snapshot_id='1';p.summary.snapshot_id='1';p.summary.period={start_at:'2026-10-08T07:00',end_at:'2026-10-08T17:00'};for(const rows of Object.values(p.datasets))for(const row of rows)row.snapshot_id='1';return p;};
test('login return drops Console route and secrets and points preview users to the normal Central',()=>{
  assert.equal(centralEntry({hostname:'preview.vercel.app',pathname:'/Central-de-Controle-/',hash:'#ames_agent_token=secret'}),'https://central-cora-v2.vercel.app/Central-de-Controle-/');
  assert.equal(centralEntry({hostname:'localhost',pathname:'/Central-de-Controle-/'}),'/Central-de-Controle-/');
});
test('all nine view labels follow PT/EN and technical identifiers remain exact',()=>{
  for(const [pt,en] of [['Monitoramento','Monitoring'],['Falhas','Failures'],['Consulta por SN','SN lookup'],['Rastreabilidade','Traceability'],['Dashboards de reuso','Reuse dashboards'],['Processo / 3022 & AT','Process / 3022 & AT'],['Base local','Local database'],['CORA conhecimento','CORA knowledge'],['Top 3 & FPY','Top 3 & FPY']]){assert.equal(consoleText(pt,'en-US'),en);assert.equal(consoleText(pt,'pt-BR'),pt);}
  for(const code of ['CPH2859V','SKU','Defect Code','Material SN','PCBA','AWIP3028','AWIP3074','AWIP2114','AWIP3022'])assert.equal(consoleText(code,'en-US'),code);
});
test('missing dependencies/session never turn into a ready workstation',()=>{
  const unknown=workstationChecks({status:'connected',readiness:{engine:true,chrome:true,ames:true},capabilities:{process_timeline:true}});
  assert(unknown.some(x=>x.label==='Playwright'&&x.state==='unknown'));
  assert(unknown.some(x=>x.label.includes('Sessão')&&x.state==='unknown'));
  assert.equal(workstationChecks()[0].state,'missing');
});
test('coverage distinguishes absent, stale, partial and source-complete data without zero substitution',()=>{
  const store=createAmesStore({now:()=>Date.parse('2026-10-08T14:00:01-03:00')});
  assert.equal(coverageState(store.read('TAN10101')),'not_collected');assert.equal(store.read('TAN10101').snapshot,null);
  const p=fixture();store.replaceSyncedSnapshots([p]);assert.equal(coverageState(store.read('TAN10101')),'partial');
  const complete=structuredClone(p);complete.coverage.defects.source_complete=true;store.replaceSyncedSnapshots([complete]);assert.equal(coverageState(store.read('TAN10101')),'fresh');
  const stale=createAmesStore({now:()=>Date.parse('2026-10-12T12:00:00Z')});stale.replaceSyncedSnapshots([p]);assert.equal(coverageState(stale.read('TAN10101')),'stale');
});
test('period matching uses the collected MES window and exact CPH, never collection date',()=>{
  const p=fixture(),metadata=historyMetadata(p);
  assert(matchesPeriod(metadata,{start:'2026-10-08T07:00',end:'2026-10-08T17:00',product:'CPH2859V'}));
  assert(matchesPeriod({...metadata,period_start:'2026-10-08 07:00:00'},{start:'2026-10-08T07:00'}));
  assert(!matchesPeriod({...metadata,period_start:'2026-10-08T07:00:01'},{start:'2026-10-08T07:00'}));
  assert(!matchesPeriod(metadata,{start:p.collected_at}));assert(!matchesPeriod(metadata,{product:'CPH285'}));
  delete p.summary.period;assert.equal(historyMetadata(p).period_start,'');
});
test('history reads sanitized immutable source revision without replacing CURRENT or invoking MES',async()=>{
  const p=fixture();p.datasets.defects[0].chrome_cdp='secret';p.datasets.defects[0].wifi_password='secret';
  const entry=await publication('collector',p),store=createAmesStore();
  const remote={watch:()=>()=>{},getPart:async(_u,_h,i)=>entry.parts[i],listHistory:async()=>[{...entry.head,...entry.history}]};
  const sync=createMesSync(store,remote,{queue:{list:async()=>[]},online:()=>false});sync.start('viewer');
  const heads=await sync.listHistory(p.line_id),read=await sync.openHistory(heads[0]);
  assert(!JSON.stringify(read).includes('secret'));assert.equal(store.read(p.line_id).snapshot,null);
  await assert.rejects(()=>sync.openHistory({...heads[0],period_start:'wrong'}),/metadata mismatch/);
  await assert.rejects(()=>sync.openHistory({...heads[0],hash:'0'.repeat(64)}),/Incomplete history/);
  sync.stop();await assert.rejects(()=>sync.openHistory(heads[0]));
});
test('unpublished history rules retain retry data but never block CURRENT on another line',async()=>{
  const a=fixture(),b=canonicalAgentFixture(productFixture('TAN10102'));b.snapshot_id='2';b.summary.snapshot_id='2';
  for(const rows of Object.values(b.datasets))for(const row of rows)row.snapshot_id='2';
  let entries=[await publication('collector',a),await publication('collector',b)],committed=[];
  const remote={watch:()=>()=>{},putPart:async()=>{},commitHead:async(_u,h)=>committed.push(h.line_id),commitHistory:async()=>{throw Error('permission-denied');}};
  const sync=createMesSync(createAmesStore(),remote,{queue:{list:async()=>entries,remove:async id=>{entries=entries.filter(e=>e.id!==id);}},online:()=>true,schedule:()=>0,unschedule:()=>{}});
  sync.start('collector');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(committed.sort(),['TAN10101','TAN10102']);assert.equal(entries.length,2);sync.stop();
});
test('migration download accepts only a live artifact for the exact frontend SHA',async()=>{
  const sha='a'.repeat(40),artifact={name:'central-v2-r12-migration-'+sha,id:123,expired:false,workflow_run:{id:456,head_sha:sha}};
  const fetcher=async url=>({ok:true,json:async()=>String(url).endsWith('release-build.json')?{sha}:{artifacts:[artifact]}});
  assert.equal((await migrationDownload(undefined,fetcher)).url,'https://github.com/pedrokam700/Central-de-Controle-/actions/runs/456/artifacts/123');
  artifact.workflow_run.head_sha='b'.repeat(40);assert.equal(await migrationDownload(undefined,fetcher),null);
  artifact.workflow_run.head_sha=sha;artifact.expired=true;assert.equal(await migrationDownload(undefined,fetcher),null);
});
