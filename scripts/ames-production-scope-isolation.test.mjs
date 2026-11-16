// Synthetic proof contract: one production 3022 reference cannot cross a
// different source, line, snapshot, revision or period, even with the same PCBA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sameFailureOccurrence, productionEvidenceForOccurrence, productionEvidenceGap}
  from '../ames/data/production-evidence.mjs';

const occurrence={
  pcba_sn:'AUDIT-P',defect_key:'D-17',defect_code:'GN01',
  defect_time:'2026-11-15T10:00:00-03:00',
  source_id:'SOURCE-A',line:'TAN10101',snapshot_id:'11',snapshot_revision:16,
  period:'2026-11-15'
};
const evidence={
  ...occurrence,production_shift_source:'3022',production_shift_basis:'reference_process',
  reference_station_code:'A5162',reference_event_time:'2026-11-15T09:00:00-03:00',
  production_shift:'T1',production_operational_date:'2026-11-15'
};

test('S1: matching metadata, occurrence and preceding 3022 pass remain trusted',()=>{
  assert.equal(sameFailureOccurrence(occurrence,evidence),true);
  assert.equal(productionEvidenceForOccurrence(occurrence,[evidence]).trusted,true);
});

for(const [label,change] of Object.entries({
  source:{source_id:'SOURCE-B'},
  line:{line:'TAN10103'},
  snapshot:{snapshot_id:'13'},
  revision:{snapshot_revision:1},
  period:{period:'2026-11-14'}
})){
  test('S1: reject conflicting explicit '+label+' despite matching PCBA/defect',()=>{
    const foreign={...evidence,...change};
    assert.equal(sameFailureOccurrence(occurrence,foreign),false);
    assert.equal(productionEvidenceForOccurrence(occurrence,[foreign]).trusted,false);
    assert.match(productionEvidenceGap(occurrence,[foreign]),/sem correlação exata/);
  });
}

test('S1: line and revision aliases cannot bypass explicit conflict',()=>{
  const source={...evidence};
  delete source.line;
  delete source.snapshot_revision;
  source.line_id='TAN10103';
  source.revision='1';
  assert.equal(productionEvidenceForOccurrence(occurrence,[source]).trusted,false);
});

test('S1: missing optional legacy metadata is not invented as a conflict',()=>{
  const legacy={...evidence};
  for(const key of ['source_id','line','snapshot_id','snapshot_revision','period'])delete legacy[key];
  assert.equal(sameFailureOccurrence(occurrence,legacy),true);
  assert.equal(productionEvidenceForOccurrence(occurrence,[legacy]).trusted,true);
});

test('S1: equally scoped strings and numbers for snapshot identity are equivalent',()=>{
  const compatible={...evidence,snapshot_id:11,snapshot_revision:'16'};
  assert.equal(productionEvidenceForOccurrence(occurrence,[compatible]).trusted,true);
});
