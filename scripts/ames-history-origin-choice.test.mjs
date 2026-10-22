import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveHistorySource} from '../ames/data/history-source-choice.mjs';

const rec=(source_id,history_source='shared')=>({
 line_id:'TAN10102',period_start:'2026-10-20T07:00',
 period_end:'2026-10-21T07:00',snapshot_id:'3',
 snapshot_revision:1,source_id,history_source
});

test('single historical origin is usable independently of availability today',()=>{
 const result=resolveHistorySource([rec('post-A')]);
 assert.equal(result.source_id,'post-A');
 assert.equal(result.reason,'unique_source');
});
test('two shared cloud origins without operator preference remain unresolved',()=>{
 const result=resolveHistorySource([rec('post-A'),rec('post-B')],{agentSource:'post-A'});
 assert.equal(result.source_id,null);
 assert.equal(result.reason,'multiple_unproven_origins');
});
test('a connected local agent resolves its own actual SQLite-backed history entry',()=>{
 const result=resolveHistorySource([rec('post-A'),rec('post-B','local')],{agentSource:'post-B'});
 assert.equal(result.source_id,'post-B');
 assert.equal(result.reason,'proven_local_origin');
});
test('operator preference is explicit and remains switchable among real candidates',()=>{
 const rows=[rec('post-A','local'),rec('post-B')];
 assert.equal(resolveHistorySource(rows,{preferredSource:'post-B',agentSource:'post-A'}).source_id,'post-B');
 assert.equal(resolveHistorySource(rows,{preferredSource:'unknown',agentSource:'post-A'}).source_id,'post-A');
});
test('a previously validated source can be retained only in the same proven candidate set',()=>{
 const rows=[rec('post-A'),rec('post-B')];
 assert.equal(resolveHistorySource(rows,{retainedSource:'post-B'}).source_id,'post-B');
 assert.equal(resolveHistorySource(rows,{retainedSource:'expired'}).source_id,null);
});
test('reading-period and last-capture views import one source-of-truth resolver',()=>{
 const read=fs.readFileSync(new URL('../ames/reading-period-controller.mjs',import.meta.url),'utf8');
 const last=fs.readFileSync(new URL('../ames/console-latest-capture.mjs',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(read,/resolveHistorySource\(entries/);
 assert.match(last,/resolveHistorySource\(plan.candidates/);
 assert.match(sw,/ames\/data\/history-source-choice.mjs/);
});
