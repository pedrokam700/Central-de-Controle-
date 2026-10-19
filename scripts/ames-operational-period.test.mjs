import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryWindow,periodIdentity,isTodaySnapshot,publicationIntent} from '../ames/data/operational-period.mjs';

const now=new Date('2026-10-19T12:45:00Z');
const p=(mode,start,end)=>({
  line_id:'TAN10103',source_id:'source-id-preserved',collected_at:'2026-10-19T12:40:00Z',
  summary:{period:{mode,start_at:start,end_at:end}}
});

test('Brazil operational boundary is 07:00, independently of workstation timezone',()=>{
  assert.deepEqual(factoryWindow(now),{
    operational_date:'2026-10-19',
    start_at:'2026-10-19T07:00',
    end_at:'2026-10-20T07:00'
  });
  assert.equal(factoryWindow(new Date('2026-10-19T09:59:00Z')).operational_date,'2026-10-18');
  assert.equal(factoryWindow(new Date('2026-10-19T10:00:00Z')).operational_date,'2026-10-19');
});

test('only explicit live scope and exact current period may affect Today',()=>{
  const current=p('today','2026-10-19T07:00-03:00','2026-10-19T09:45-03:00');
  const previous=p('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00');
  const advanced=p('custom','2026-10-19T07:00-03:00','2026-10-19T09:45-03:00');
  assert.equal(isTodaySnapshot(current,now),true);
  assert.equal(publicationIntent(previous,now),'history');
  assert.equal(publicationIntent(advanced,now),'history');
  assert.equal(publicationIntent(p('today','2026-10-16T07:00-03:00','2026-10-16T09:00-03:00'),now),'history');
  assert.equal(publicationIntent(p('today','2026-10-19T07:00-03:00','2026-10-20T07:30-03:00'),now),'history');
  assert.equal(periodIdentity(previous).operational_date,'2026-10-16');
});

test('unproved calendar or query intent is historical fail-closed',()=>{
  assert.equal(publicationIntent(p(null,'2026-10-19T07:00','2026-10-19T09:00'),now),'history');
  assert.equal(publicationIntent(p('custom','',''),now),'history');
  assert.throws(()=>factoryWindow(now,{dayStart:'25:00'}));
});
