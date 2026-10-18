import test from 'node:test';
import assert from 'node:assert/strict';
import {SN_SOURCE_ORDER,snLiveSourceProvenance,renderSnLiveSourceProvenance} from '../ames/console-sn-source-provenance.mjs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';
import fs from 'node:fs';

const lookup=()=>({
  sn:'PCBA-A',detected_type:'PCBA',
  local_snapshot:{snapshot_id:'cached-41',collected_at:'2026-10-16T10:00:00-03:00'},
  trace_2114:{status:'complete',previous_failures:[],current_failure:{pcba_sn:'PCBA-A',defect_code:'F1',defect_time:'2026-10-17 10:30:00'},
    source_id:'mes-view-2114',snapshot_id:'snap-2114',snapshot_revision:3,collected_at:'2026-10-17T10:32:00-03:00',
    period:{start_at:'2026-10-17T07:30:00-03:00',end_at:'2026-10-17T10:30:00-03:00'}},
  trace_3074:{status:'error',error:'MES unavailable',reused_components:[]},
  trace_3022:{status:'partial',process_passages:[{pcba_sn:'PCBA-A',station:'A5100',event_time:'2026-10-17T10:00:00-03:00'}]},
  trace_3012:{status:'unavailable'},
});

test('SN provenance keeps independent states and never invents PC/line or collection timestamp',()=>{
  const result=lookup(),model=buildLiveSnForensics(result),rows=snLiveSourceProvenance(result,model);
  assert.deepEqual(rows.map(r=>r.view),SN_SOURCE_ORDER);
  assert.equal(rows.find(r=>r.view==='2114').source_id,'mes-view-2114');
  assert.equal(rows.find(r=>r.view==='2114').snapshot_revision,3);
  assert.equal(rows.find(r=>r.view==='2114').collected_at,'2026-10-17T10:32:00-03:00');
  assert.equal(rows.find(r=>r.view==='2114').period_start,'2026-10-17T07:30:00-03:00');
  assert.equal(rows.find(r=>r.view==='2114').workstation_id,null);
  assert.equal(rows.find(r=>r.view==='3074').state,'error');
  assert.equal(rows.find(r=>r.view==='3022').state,'partial');
  assert.equal(rows.find(r=>r.view==='3012').state,'unavailable');
  assert.equal(rows.find(r=>r.view==='3028').state,'cached');
  assert.equal(rows.find(r=>r.view==='3022').collected_at,null,'event time is not automatically collection time');
  assert.equal(rows.find(r=>r.view==='3022').period_start,null);
});

test('missing traces are explicitly not collected; only declared workstation and period appear',()=>{
  const result={sn:'PCBA-A'};
  const rows=snLiveSourceProvenance(result,buildLiveSnForensics(result));
  assert.ok(rows.every(row=>row.state==='not_collected'));
  assert.ok(rows.every(row=>row.collected_at===null&&row.workstation_id===null&&row.period_start===null));
  const one={sn:'PCBA-A',trace_2114:{status:'complete',workstation_id:'FACTORY-01',collected_at:'',period:{}}};
  const rows2=snLiveSourceProvenance(one,buildLiveSnForensics(one));
  assert.equal(rows2.find(row=>row.view==='2114').workstation_id,'FACTORY-01');
  assert.equal(rows2.find(row=>row.view==='2114').period_start,null);
});

test('bilingual live SN details escape MES values and remain collapsed until requested',()=>{
  const result=lookup();result.trace_2114.source_id='<img src=x onerror=alert(1)>';
  const model=buildLiveSnForensics(result);
  const pt=renderSnLiveSourceProvenance(result,model,'pt-BR');
  assert.match(pt,/<details data-sn-live-provenance/);
  assert.match(pt,/Proveniência das fontes · consulta ao vivo/);
  assert.match(pt,/Período MES comprovado/);
  assert.match(pt,/Cache local/);
  assert.doesNotMatch(pt,/<img src=x/);
  assert.match(pt,/&lt;img src=x onerror=alert\(1\)&gt;/);
  const en=renderSnLiveSourceProvenance(result,model,'en-US');
  assert.match(en,/Source provenance · live lookup/);
  assert.match(en,/Proven MES period/);
  assert.match(en,/Local cache/);
  assert.doesNotMatch(en,/Proveniência das fontes/);
});

test('live SN UI adds the source details without invoking a new MES request',()=>{
  const source=fs.readFileSync(new URL('../ames/console-sn-offline-fastlane.mjs',import.meta.url),'utf8');
  assert.match(source,/renderSnLiveSourceProvenance\(result,model,locale\(\)\)/);
  assert.match(source,/section\.after\(panel\.firstElementChild\)/);
  assert.match(source,/renderLiveSources\(root,store\)/);
});
