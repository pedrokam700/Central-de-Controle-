import test from 'node:test';
import assert from 'node:assert/strict';
import {planLatestCapture} from '../ames/console-latest-capture.mjs';
import {readingPeriod} from '../ames/data/reading-period.mjs';
import {provenPreviousFailures} from '../ames/data/sn-forensics.mjs';

const entry=(line,date,source,id,at)=>{
 const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 return {line_id:line,source_id:source,snapshot_id:id,snapshot_revision:1,
  period_start:date+'T07:00',period_end:next.toISOString().slice(0,10)+'T07:00',
  collected_at:at,history_source:'shared'};
};
const line='TAN10102';
test('latest proven capture remains available when Today 07:00 becomes an empty new day',()=>{
 const old=entry(line,'2026-10-19','main',1,'2026-10-20T17:29:07Z');
 const today=readingPeriod('today',{now:new Date('2026-10-20T09:59:00Z')});
 const tomorrow=readingPeriod('today',{now:new Date('2026-10-20T10:00:00Z')});
 assert.equal(today.start,'2026-10-19T07:00');
 assert.equal(tomorrow.start,'2026-10-20T07:00');
 const result=planLatestCapture([old],line,tomorrow);
 assert.equal(result.status,'available');
 assert.equal(result.latest.period_start,'2026-10-19T07:00');
 assert.notEqual(result.latest.period_start,tomorrow.start,'never relabel historical metrics as today');
});
test('separate publishers in the latest production day must require selection',()=>{
 const a=entry(line,'2026-10-20','source-A','11','2026-10-20T20:00:00Z');
 const b=entry(line,'2026-10-20','source-B','22','2026-10-20T19:00:00Z');
 const older=entry(line,'2026-10-19','old','1','2026-10-19T20:00:00Z');
 const r=planLatestCapture([older,b,a],line,{end:'2026-10-21T07:00'});
 assert.equal(r.status,'conflict');assert.deepEqual(r.candidates.map(x=>x.source_id),['source-A','source-B']);
});
test('different lines and invalid/future windows are excluded from latest',()=>{
 const valid=entry(line,'2026-10-19','source-A','7','2026-10-20T17:29:07Z');
 assert.equal(planLatestCapture([{...valid,line_id:'TAN10103'}],line).status,'none');
 assert.equal(planLatestCapture([{...valid,period_end:valid.period_start}],line).status,'none');
 assert.equal(planLatestCapture([valid],line,{end:'2026-10-18T07:00'}).status,'none');
});
const failure=(sn,code,time,seq)=>({'PCBA':sn,'Defect Code':code,'Defect Time':time,'Defect Hist Seq':seq});
test('one 2114 current defect never becomes a previous failure',()=>{
 const current=failure('00252700651435F300051943','JG07-SX94','2026-10-20 10:00:00',0);
 const result=provenPreviousFailures([current,{...current}],current);
 assert.deepEqual(result.previous,[]);assert.equal(result.uncertain,0);
});
test('real older defects remain older; later or ambiguous defects do not become prior',()=>{
 const current=failure('P','C1','2026-10-20 10:00:00',3);
 const older=failure('P','C0','2026-10-19 10:00:00',2);
 const future=failure('P','C2','2026-10-21 10:00:00',4);
 const unknown=failure('P','C3','',-1);
 const result=provenPreviousFailures([current,older,future,unknown],current);
 assert.deepEqual(result.previous,[older]);assert.equal(result.uncertain,2);
});
