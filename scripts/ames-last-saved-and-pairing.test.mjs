import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planLatestCapture} from '../ames/console-latest-capture.mjs';

const head=(date,source,id,when)=>({
 line_id:'TAN10102',source_id:source,snapshot_id:id,snapshot_revision:1,
 period_start:date+'T07:00',period_end:date+'T07:00'.replace(/^\d{4}-\d{2}-\d{2}/,'2026-10-22'),
 collected_at:when
});
test('latest saved data includes same-day capture when Today has no readable snapshot',()=>{
 const today=head('2026-10-21','post-A','32','2026-10-21T13:14:00Z');
 const previous=head('2026-10-20','post-A','31','2026-10-20T16:22:00Z');
 const plan=planLatestCapture([previous,today],'TAN10102',{end:null});
 assert.equal(plan.status,'available');
 assert.equal(plan.latest.snapshot_id,'32');
});
test('if two workstations provided same-day evidence, do not silently pick an origin',()=>{
 const a=head('2026-10-21','post-A','32','2026-10-21T15:00:00Z');
 const b=head('2026-10-21','post-B','99','2026-10-21T16:00:00Z');
 const model=planLatestCapture([a,b],'TAN10102',{end:null});
 assert.equal(model.status,'conflict');
 assert.deepEqual(new Set(model.candidates.map(e=>e.source_id)),new Set(['post-A','post-B']));
});
test('live day remains separate from historical fallback when a genuine current-day snapshot is already present',()=>{
 const a=head('2026-10-21','post-A','32','2026-10-21T13:14:00Z');
 const b=head('2026-10-20','post-A','31','2026-10-20T16:22:00Z');
 const model=planLatestCapture([a,b],'TAN10102',{end:'2026-10-21T07:00'});
 assert.equal(model.latest.snapshot_id,'31');
});
test('official page exposes direct local pairing without exposing token or initiating MES collection',()=>{
 const code=fs.readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
 assert.match(code,/data-console-pair/);
 assert.match(code,/client\.openLocalPairing\(\)/);
 assert.match(code,/client\.canPairFromOfficial/);
 assert.doesNotMatch(code,/data-console-pair.*ames_agent_token/);
});
test('monitor never destroys saved reader on ordinary render and puts saved panel above unknown KPI',()=>{
 const code=fs.readFileSync(new URL('../ames/console-legacy-parity.mjs',import.meta.url),'utf8');
 assert.match(code,/preservedPreview/);
 assert.match(code,/data-latest-capture-preview/);
 assert.doesNotMatch(code,/last=key;latestPreview\?\.clear\(\)/);
});
