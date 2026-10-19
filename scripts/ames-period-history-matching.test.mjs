import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {factoryWallMinute,matchesPeriod} from '../ames/data/history.mjs';

const friday={
  period_start:'2026-10-16T07:00:00-03:00',
  period_end:'2026-10-17T07:00:00-03:00',
  collected_at:'2026-10-19T14:45:00Z',
  products:'CPH2819,CPH2859V'
};

test('previous productive Friday remains searchable on Monday with browser datetime-local fields',()=>{
  assert.equal(factoryWallMinute(friday.period_start),'2026-10-16T07:00');
  assert.equal(factoryWallMinute('2026-10-16T10:00:00Z'),'2026-10-16T07:00');
  assert.equal(factoryWallMinute('2026-10-16T07:00'),'2026-10-16T07:00');
  assert.equal(matchesPeriod(friday,{start:'2026-10-16T07:00',end:'2026-10-17T07:00'}),true);
  assert.equal(matchesPeriod(friday,{start:'2026-10-16T10:00:00Z',end:'2026-10-17T10:00:00Z'}),true);
  assert.equal(matchesPeriod(friday,{start:'2026-10-18T07:00',end:'2026-10-19T07:00'}),false);
});

test('late AT updates do not move the Friday production period to Monday',()=>{
  assert.equal(matchesPeriod(friday,{start:'2026-10-19T07:00'}),false);
  assert.equal(matchesPeriod({...friday,collected_at:'2026-10-21T10:00:00Z'},{start:'2026-10-16T07:00',end:'2026-10-17T07:00'}),true);
  assert.equal(matchesPeriod(friday,{start:'2026-10-16T07:00',end:'2026-10-17T07:00',product:'CPH2859V'}),true);
  assert.equal(matchesPeriod(friday,{start:'2026-10-16T07:00',end:'2026-10-17T07:00',product:'CPH2859'}),false);
  assert.equal(matchesPeriod({collected_at:'2026-10-16T07:00:00Z'},{start:'2026-10-16T07:00'}),false);
});

test('broken and ambiguous periods are not promoted to a day',()=>{
  for(const bad of ['','2026-10-16','16/10/2026','2026-10-16Tinvalid']){
    assert.equal(factoryWallMinute(bad),null);
    assert.equal(matchesPeriod(friday,{start:bad||'bad'}),false);
  }
});

test('Today view relies on verified current 3028 evidence, not historical end equality',()=>{
  const ui=fs.readFileSync(new URL('../ames/console-history.mjs',import.meta.url),'utf8');
  assert.match(ui,/isTodaySnapshot\(canonical,new Date\(\)/);
  assert.match(ui,/tab==='today'\?\[\]:entries\.filter/);
  assert.match(ui,/Dados de outro período não serão exibidos aqui/);
  assert.match(ui,/client\.collect\('today'/);
});
