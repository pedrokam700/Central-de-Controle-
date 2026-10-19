import {createAmesStore} from '../ames/data/store.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sync=source('ames/sync.mjs');
const firebase=source('ames/firebase-sync.mjs');
const store=source('ames/data/store.mjs');
const health=source('ames/console-data-health.mjs');

test('shared snapshot preserves provenance/revision/process context while stripping workstation secrets',()=>{
  assert.match(sync,/source_id/);
  assert.match(sync,/snapshot_id/);
  assert.match(sync,/snapshot_revision/);
  assert.match(sync,/collected_at/);
  assert.match(sync,/process_contexts/);
  assert.match(sync,/password\|senha\|cookie\|credential\|authorization\|token/);
  assert.match(sync,/session\|cdp\|wi\.\?fi\|secret/);
});

test('shared publication identity keeps revisions distinct and reports team authority metadata',()=>{
  assert.match(sync,/\[safe\.source_id,safe\.snapshot_id,safe\.snapshot_revision,hash\]/);
  assert.match(sync,/remote_scope:'team_latest'/);
  assert.match(sync,/remote_heads/);
  assert.match(sync,/remote_latest_collected_at/);
  assert.match(sync,/operational_day_history/);
  assert.match(sync,/authority='team_latest'/);
});

test('another workstation can consume shared snapshots without replacing the local SQLite architecture',()=>{
  assert.match(sync,/store\.replaceSyncedSnapshots\(payloads\)/);
  assert.match(store,/let synced = new Map\(\)/);
  const runtime=createAmesStore(),line='TAN10101';
  const local=canonicalAgentFixture(productFixture(line,1)),shared=canonicalAgentFixture(productFixture(line,2));
  local.source_id='local-original';shared.source_id='shared-workstation';
  runtime.replaceLocalSnapshots([local]);runtime.replaceSyncedSnapshots([shared]);
  assert.equal(runtime.read(line).snapshot.source_id,'shared-workstation');
  runtime.setLocalConnected(true);assert.equal(runtime.read(line).snapshot.source_id,'local-original');
  runtime.selectReadingPeriod('custom',{start:'2000-01-01T07:00',end:'2000-01-02T07:00'});
  assert.equal(runtime.read(line).snapshot,null,'other periods cannot leak through source priority');
  assert.equal(runtime.localCanonical()[0].source_id,'local-original');
  assert.match(store,/replaceSyncedSnapshots\(payloads\)/);
  assert.doesNotMatch(sync,/new\s+SQLite|indexedDB\.open\([^)]*snapshot/i);
});

test('team head transaction prevents an older queued snapshot from overwriting newer evidence',()=>{
  assert.match(firebase,/compareHead\(head,teamValue\)>0/);
  assert.match(firebase,/snapshot_revision/);
  assert.match(firebase,/Um snapshot que ficou na fila offline não substitui evidência coletada depois/);
  assert.match(firebase,/onSnapshot\(teamHead\(line\)/);
});

test('history remains versioned and separate from latest team head',()=>{
  assert.match(firebase,/amesTeamLines',head\.line_id,'history',uid\+'_'\+head\.key/);
  assert.match(sync,/commitHistory/);
  assert.match(sync,/history:historyMetadata\(safe\)/);
});

test('Data Health exposes shared origin revision freshness and authority instead of hiding remote reuse',()=>{
  assert.match(health,/Sincronização entre postos/);
  assert.match(health,/source_id/);
  assert.match(health,/snapshot_id/);
  assert.match(health,/snapshot_revision/);
  assert.match(health,/collected_at/);
  assert.match(health,/remote_latest_collected_at/);
  assert.match(health,/Mais recente da equipe/);
  assert.match(health,/última evidência válida continua identificada/);
});

test('stopping sync clears shared session state without leaking previous workstation metadata',()=>{
  assert.match(sync,/store\.replaceSyncedSnapshots\(\[\]\)/);
  assert.match(sync,/remote_heads:\[\]/);
  assert.match(sync,/remote_latest_collected_at:null/);
});
