import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredShiftAt} from '../ames/console-shift-summary.mjs';

const config={
  timezone:'America/Sao_Paulo',
  work_shifts:{
    '1':{label:'1º Turno',start:'07:30',end:'17:30'},
    '2':{label:'2º Turno',start:'17:30',end:'07:30'},
  }
};

const at=value=>new Date(value);

test('automatic shift honors configured factory timezone at exact boundaries',()=>{
  assert.equal(configuredShiftAt(config,at('2026-10-14T10:29:59Z')),'2nd Shift'); // 07:29:59 BRT
  assert.equal(configuredShiftAt(config,at('2026-10-14T10:30:00Z')),'1st Shift'); // 07:30 BRT
  assert.equal(configuredShiftAt(config,at('2026-10-14T20:29:59Z')),'1st Shift'); // 17:29:59 BRT
  assert.equal(configuredShiftAt(config,at('2026-10-14T20:30:00Z')),'2nd Shift'); // 17:30 BRT
  assert.equal(configuredShiftAt(config,at('2026-10-15T06:00:00Z')),'2nd Shift'); // 03:00 BRT
});

test('browser timezone cannot change factory shift result',()=>{
  const instant=at('2026-10-14T12:00:00Z'); // 09:00 BRT
  assert.equal(configuredShiftAt(config,instant),'1st Shift');
  assert.equal(configuredShiftAt({...config,timezone:'Asia/Tokyo'},instant),'2nd Shift'); // 21:00 JST proves config drives the clock
});

test('invalid timezone or malformed shift fails closed instead of guessing',()=>{
  assert.equal(configuredShiftAt({...config,timezone:'Invalid/Factory'},at('2026-10-14T12:00:00Z')),'');
  assert.equal(configuredShiftAt({...config,work_shifts:{'1':{start:'bad',end:'17:30'}}},at('2026-10-14T12:00:00Z')),'');
});
