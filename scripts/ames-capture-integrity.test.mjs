import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmesStore} from '../ames/data/store.mjs';
import {createReadingPeriodController} from '../ames/reading-period-controller.mjs';
import {buildLiveSnForensics,buildLocalSnForensics} from '../ames/data/sn-forensics.mjs';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
import {createHistoryTrendReader} from '../ames/data/history-trends.mjs';
import {snLiveSourceProvenance} from '../ames/console-sn-source-provenance.mjs';

export function capture(line='TAN10102',date='2026-10-19',source='96620cb5-test',id='1'){
 const p=canonicalAgentFixture(productFixture(line,77));
 p.source_id=source;p.snapshot_id=id;p.summary.snapshot_id=id;p.snapshot_revision=1;
 p.collected_at=date==='2026-10-19'?'2026-10-20T20:29:07Z':date+'T20:06:37Z';p.summary.collected_at=p.collected_at;
 p.summary.period={mode:'today',start_at:date+'T07:00',end_at:date+'T23:00'};
 p.summary.fpy=94.46;p.summary.check_fpy=96.47;p.summary.quantity=1390;
 for(const rows of Object.values(p.datasets))for(const r of rows){r.snapshot_id=id;r.snapshot_revision=1;}
 return p;
}
export const entry=p=>({line_id:p.line_id,source_id:p.source_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,collected_at:p.collected_at,period_start:p.summary.period.start_at,period_end:p.summary.period.end_at,history_source:'shared'});
const history=rows=>({list:async line=>rows.filter(p=>p.line_id===line).map(entry),open:async e=>rows.find(p=>p.source_id===e.source_id&&p.snapshot_id===e.snapshot_id)});
test('screenshot Today: explicit source selection actually becomes visible, live competitor cannot override it',async()=>{
 const a=capture('TAN10102','2026-10-20'),b=capture('TAN10102','2026-10-20','competitor','2'),s=createAmesStore({now:()=>Date.parse('2026-10-20T22:00Z')}),c=createReadingPeriodController(s,history([a,b]));
 await c.select('today');assert.equal(s.read('TAN10102').snapshot,null);assert.equal(s.agent().period_read.source_choices.length,1);
 await c.chooseSource('TAN10102',a.source_id);assert.equal(s.read('TAN10102').snapshot.source_id,a.source_id);assert.equal(s.read('TAN10102').snapshot.summary.quantity,1390);
 s.replaceSyncedSnapshots([{...b,collected_at:'2026-10-20T22:00Z'}]);assert.equal(s.read('TAN10102').snapshot.source_id,a.source_id);
});
test('06:59 to 07:00: latest capture survives rollover; Today never inherits old FPY',async()=>{
 let clock=Date.parse('2026-10-21T09:59Z');const p=capture('TAN10102','2026-10-20'),s=createAmesStore({now:()=>clock}),c=createReadingPeriodController(s,history([p]));
 await c.select('latest');assert.equal(s.read('TAN10102').snapshot.summary.fpy,94.46);
 clock=Date.parse('2026-10-21T10:00Z');s.selectReadingPeriod('latest');assert.equal(s.read('TAN10102').snapshot.snapshot_id,'1');
 await c.select('today');assert.equal(s.readingPeriod().start,'2026-10-21T07:00');assert.equal(s.read('TAN10102').snapshot,null);
 await c.select('latest');assert.equal(s.read('TAN10102').snapshot.snapshot_id,'1');
});
test('latest may be older than yesterday; competing sources stay unresolved',async()=>{
 const p=capture('TAN10102','2026-09-01'),s=createAmesStore({now:()=>Date.parse('2026-10-21T10:00Z')}),c=createReadingPeriodController(s,history([p]));
 await c.select('latest');assert.equal(s.read('TAN10102').snapshot.snapshot_id,p.snapshot_id);
 const other=createReadingPeriodController(createAmesStore({now:()=>Date.parse('2026-10-21T10:00Z')}),{list:async line=>line===p.line_id?[entry(p),{...entry(p),source_id:'other'}]:[],open:async()=>{throw Error('must not choose arbitrarily');}});await other.select('latest');
});
test('one failure is current; duplicate/current/future/unknown and foreign PCBA cannot become prior',()=>{
 const row={pcba_sn:'P',defect_code:'F',defect_time:'2026-10-20 10:00:00',repair_status:'N'};
 const model=buildLiveSnForensics({sn:'P',detected_type:'PCBA',trace_2114:{previous_failures:[row]}});
 assert.equal(model.current.defect_code,'F');assert.equal(model.own_history.length,0);
 const result=buildLiveSnForensics({sn:'P',detected_type:'PCBA',trace_2114:{current_failure:row,previous_failures:[row,{...row,defect_time:'2026-10-20T13:00:00Z'},{...row,defect_time:'2026-10-19 10:00:00'},{...row,defect_time:null},{...row,pcba_sn:'OTHER',defect_time:'2026-10-18 10:00:00'},{...row,defect_time:'2026-10-21 10:00:00'}]}});
 assert.equal(result.own_history.length,1);assert.equal(result.unassociated_history.length,3);
 const local=buildLocalSnForensics({query_sn:'P',pcba_history:[row,row]});assert.equal(local.own_history.length,0);
});
test('canonical 3022 operator evidence projects name and code; conflicts cannot guess a name',()=>{
 const p=capture(),r=p.datasets.defects[0];r.repair_user='BRM00021';
 p.capabilities.process_timeline=true;
 const event={record_id:'operator',line_id:p.line_id,snapshot_id:p.snapshot_id,snapshot_revision:1,pcba_sn:r.pcba_sn,station:'A',process:'repair',provenance:{adapter:{operator_evidence:{operator_id:'BRM00021',operator_name:'AT sintético'}}}};
 p.datasets.process_timeline=[event];p.coverage.process_timeline.stored_total=1;
 assert.equal(normalizeCanonical(structuredClone(p)).occurrences[0].repair_user_name,'AT sintético');
 p.datasets.process_timeline.push({...event,record_id:'conflict',provenance:{adapter:{operator_evidence:{operator_id:'BRM00021',operator_name:'Outro nome'}}}});p.coverage.process_timeline.stored_total=2;
 assert.equal(normalizeCanonical(p).occurrences[0].repair_user_name,null);
});
test('92-day series preserves missing dates and unproven component outcomes',async()=>{
 const p=capture(),read=await createHistoryTrendReader(history([p])).read({line:p.line_id,endDate:'2026-10-20',days:92});
 assert.equal(read.points.length,92);assert.equal(read.points.filter(p=>p.snapshot).length,1);
 assert.equal(read.points[0].observed_failures,undefined);const point=read.points.find(p=>p.snapshot);assert.equal(point.component_verified_no_failure,null);assert.equal(point.component_failure_rate,null);assert.equal(point.component_denominator,null);
});
test('partial source exposes observed count/error without inventing collection or persistence timestamps',()=>{
 const row=snLiveSourceProvenance({trace_3022:{status:'error',rows:[{}],error:'timeout'}},{source_states:{3022:'error'}}).find(s=>s.view==='3022');
 assert.equal(row.observed_count,1);assert.equal(row.error,'timeout');assert.equal(row.collected_at,null);assert.equal(row.persisted_at,null);assert.equal(row.complete,false);
});
