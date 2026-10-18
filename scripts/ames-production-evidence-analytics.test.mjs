import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionEvidenceForOccurrence,sameFailureOccurrence} from '../ames/data/production-evidence.mjs';

const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const occurrence={pcba_sn:'P1',defect_code:'GN01',defect_time:'2026-10-15T10:00:00-03:00'};

test('production context must match the exact failure occurrence',()=>{
  assert.equal(sameFailureOccurrence(occurrence,{...occurrence,defect_time:'2026-10-15T13:00:00Z'}),true);
  assert.equal(sameFailureOccurrence(occurrence,{...occurrence,defect_time:'2026-10-15T11:00:00-03:00'}),false);
  assert.equal(sameFailureOccurrence(occurrence,{...occurrence,defect_code:'OTHER'}),false);
});

test('unproven occurrence never gets production time shift or day from a nearby context',()=>{
  const nearby={...occurrence,defect_time:'2026-10-15T11:00:00-03:00',reference_station_code:'A5162',reference_event_time:'2026-10-15T09:30:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-10-15',production_shift_source:'3022',production_shift_basis:'reference_process'};
  const evidence=productionEvidenceForOccurrence(occurrence,[nearby]);
  assert.equal(evidence.trusted,false);
  assert.equal(evidence.event_time,null);
  assert.equal(evidence.shift,null);
  assert.equal(evidence.operational_date,null);
});

test('exact 3022 reference context proves production fields',()=>{
  const exact={...occurrence,reference_station_code:'A5162',reference_event_time:'2026-10-15T09:30:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-10-15',production_shift_source:'3022',production_shift_basis:'reference_process'};
  const evidence=productionEvidenceForOccurrence(occurrence,[exact]);
  assert.equal(evidence.trusted,true);
  assert.equal(evidence.shift,'1st Shift');
  assert.equal(evidence.operational_date,'2026-10-15');
});

test('daily analytics does not use Defect Time as production fallback',()=>{
  const analytics=source('ames/daily-failure-analytics.mjs');
  assert.match(analytics,/productionEvidenceForOccurrence/);
  assert.match(analytics,/failure_record_date/);
  assert.match(analytics,/production_evidence_proven/);
  assert.doesNotMatch(analytics,/production_event_time\|\|r\.defect_time/);
  assert.doesNotMatch(analytics,/production_operational_date\|\|day\(r\.defect_time\)/);
  assert.doesNotMatch(analytics,/ctx\.production_operational_date\|\|day\(occ\.defect_time\)/);
  assert.match(analytics,/Registro da falha \(MES\)/);
  assert.match(analytics,/não é usado como fallback de produção/);
});

test('matching defect_key never overrides PCBA identity or conflicting explicit failure fields',()=>{
  const keyed={...occurrence,defect_key:'DUPLICATED-IN-ANOTHER-SNAPSHOT'};
  assert.equal(sameFailureOccurrence(keyed,{...keyed,pcba_sn:'P2'}),false);
  assert.equal(sameFailureOccurrence(keyed,{...keyed,pcba_sn:''}),false);
  assert.equal(sameFailureOccurrence({...keyed,pcba_sn:''},keyed),false);
  assert.equal(sameFailureOccurrence(keyed,{...keyed,defect_code:'WRONG'}),false);
  assert.equal(sameFailureOccurrence(keyed,{...keyed,defect_time:'2026-10-15T11:00:00-03:00'}),false);
  assert.equal(sameFailureOccurrence(keyed,{...keyed,defect_time:'2026-10-15T13:00:00Z'}),true);
  assert.equal(sameFailureOccurrence(keyed,{...keyed,defect_key:'OTHER-KEY'}),false);
});

test('the 3022 proof for another PCBA is rejected even when defect_key collides',()=>{
  const keyed={...occurrence,defect_key:'COLLISION'};
  const reference={reference_station_code:'A5100',reference_event_time:'2026-10-15T09:40:00-03:00',production_shift:'1st Shift',production_shift_source:'3022',production_shift_basis:'reference_process'};
  const wrong={...keyed,...reference,pcba_sn:'P2'};
  const exact={...keyed,...reference,reference_station_code:'A5162'};
  const untrusted=productionEvidenceForOccurrence(keyed,[wrong]);
  assert.equal(untrusted.trusted,false);
  assert.equal(untrusted.station,null);
  const trusted=productionEvidenceForOccurrence(keyed,[wrong,exact]);
  assert.equal(trusted.trusted,true);
  assert.equal(trusted.station,'A5162');
});
