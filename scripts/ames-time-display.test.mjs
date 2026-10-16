import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFactoryDateTime as time,formatFactoryDate as date,displayValue,factoryHourKey} from '../ames/data/time-display.mjs';
test('presentation converts aware times to Sao Paulo and preserves naive MES wall clocks',()=>{
 assert.equal(time('2026-10-14T22:23:09+00:00',{locale:'pt-BR'}),'14/10/2026 19:23:09');
 assert.equal(time('2026-10-14 19:23:09',{locale:'pt-BR'}),'14/10/2026 19:23:09');
 assert.equal(time('2026-10-14 22:23:09',{locale:'pt-BR',naiveOffset:'+00:00'}),'14/10/2026 19:23:09');
 assert.equal(date('2026-10-14T01:00:00Z',{locale:'en-US'}),'10/13/2026');
 assert.equal(date('2026-10-14',{locale:'pt-BR'}),'14/10/2026');
 assert.equal(factoryHourKey('2026-10-14T22:23:09Z'),'19:00');
 assert.equal(factoryHourKey('2026-10-14 19:23:09'),'19:00');
});
test('invalid/missing dates remain unknown and raw records/exports are unchanged',()=>{
 for(const input of [null,'','bad','2026-02-30 10:00:00'])assert.equal(time(input),'—');
 const row={defect_time:'2026-10-14T22:23:09Z',repair_time:'2026-10-14T23:00:00Z'};const before=JSON.stringify(row);
 assert.equal(displayValue('defect_time',row.defect_time,{locale:'pt-BR'}),'14/10/2026 19:23:09');
 assert.equal(displayValue('Defect Time',row.defect_time,{locale:'pt-BR'}),'14/10/2026 19:23:09');
 assert.equal(displayValue('item_sn','2026-10-14-SERIAL'),'2026-10-14-SERIAL');
 assert.equal(JSON.stringify(row),before);
});
