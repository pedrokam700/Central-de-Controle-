import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedProductionEvidence,genericReturnEvidence} from '../ames/data/production-evidence.mjs';

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('production evidence is unknown without 3022 reference provenance',()=>{
  const untrusted=trustedProductionEvidence({
    reference_station_code:'A5162',reference_event_time:'2026-10-15T10:00:00-03:00',
    production_shift:'1st Shift',production_operational_date:'2026-10-15'
  });
  assert.equal(untrusted.trusted,false);
  assert.equal(untrusted.event_time,null);
  assert.equal(untrusted.shift,null);
  assert.equal(untrusted.operational_date,null);
});

test('only reference_process from 3022 proves generation shift and production day',()=>{
  const trusted=trustedProductionEvidence({
    reference_station_code:'A5162',reference_event_time:'2026-10-15T10:00:00-03:00',
    production_event_time:'2026-10-15T10:00:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-10-15',
    production_shift_source:'3022',production_shift_basis:'reference_process'
  });
  assert.equal(trusted.trusted,true);
  assert.equal(trusted.station,'A5162');
  assert.equal(trusted.shift,'1st Shift');
  assert.equal(trusted.operational_date,'2026-10-15');
});

test('return evidence is generic and requires actual station or operation plus time',()=>{
  assert.equal(genericReturnEvidence({return_a5201_event_time:'2026-10-15T11:00:00-03:00'}).proven,false,'legacy A5201 alone is not generic return proof');
  const ret=genericReturnEvidence({return_station_code:'A5240',return_operation_name:'Retest',return_event_time:'2026-10-15T11:00:00-03:00'});
  assert.equal(ret.proven,true);
  assert.equal(ret.label,'A5240 · Retest');
});

test('failure/process UI uses human semantics instead of ambiguous production labels',()=>{
  const failure=source('ames/console-failure-process.mjs');
  const process=source('ames/console-process-operator.mjs');
  for(const code of [failure,process]){
    assert.match(code,/Registro da falha \(MES\)/);
    assert.match(code,/Horário de geração \(3022\)/);
    assert.match(code,/Turno comprovado \(3022\)/);
    assert.match(code,/Dia de produção \(3022\)/);
  }
  assert.match(failure,/Posto de retorno/);
  assert.match(failure,/Horário do retorno/);
  assert.doesNotMatch(failure,/Retorno A5201/);
  assert.match(failure,/Manual\/Automatic descreve como a falha foi registrada/);
  assert.match(process,/Retorno legado A5201/,'legacy field may remain only as an explicitly technical legacy label');
});
