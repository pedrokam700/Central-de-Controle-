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

test('a partial matching context cannot hide a later complete reference for the same occurrence',()=>{
  const partial={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A9999'};
  const complete={...partial,reference_station_code:'A5100',reference_event_time:'2026-10-15T09:10:00-03:00',production_shift:'1st Shift'};
  const evidence=productionEvidenceForOccurrence(occurrence,[partial,complete]);
  assert.equal(evidence.trusted,true);
  assert.equal(evidence.station,'A5100');
  assert.equal(evidence.shift,'1st Shift');
});

test('two different proven references for one occurrence are ambiguous rather than selected by list order',()=>{
  const base={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A5100',reference_event_time:'2026-10-15T09:10:00-03:00',production_shift:'1st Shift'};
  const other={...base,reference_station_code:'A5162'};
  const first=productionEvidenceForOccurrence(occurrence,[base,other]);
  const reverse=productionEvidenceForOccurrence(occurrence,[other,base]);
  assert.equal(first.trusted,false);
  assert.equal(reverse.trusted,false);
  assert.equal(first.shift,null);
  assert.equal(reverse.station,null);
  // Repeated equivalent evidence, even in UTC, is not a conflict.
  const duplicate={...base,reference_event_time:'2026-10-15T12:10:00Z'};
  const same=productionEvidenceForOccurrence(occurrence,[base,duplicate]);
  assert.equal(same.trusted,true);
  assert.equal(same.station,'A5100');
});

test('future or unparseable 3022 reference times cannot prove earlier production',()=>{
  const template={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A5100',production_shift:'1st Shift'};
  const future={...template,reference_event_time:'2026-10-15T10:10:00-03:00'};
  const unknown={...template,reference_event_time:'invalid'};
  const prior={...template,reference_event_time:'2026-10-15T09:50:00-03:00'};
  assert.equal(productionEvidenceForOccurrence(occurrence,[future]).trusted,false);
  assert.equal(productionEvidenceForOccurrence(occurrence,[unknown]).trusted,false);
  assert.equal(productionEvidenceForOccurrence({...occurrence,defect_time:'2026-10-15'},[prior]).trusted,false);
  assert.equal(productionEvidenceForOccurrence(occurrence,[future,prior]).station,'A5100');
  const contaminated={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A5100'};
  const missingTime={...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',reference_event_time:'2026-10-15T09:50:00-03:00'};
  assert.equal(productionEvidenceForOccurrence(contaminated,[missingTime]).trusted,false,'partial fields from different records must not be merged into proof');
});
