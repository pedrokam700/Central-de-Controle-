import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../ames/daily-failure-summary.mjs',import.meta.url),'utf8');

test('daily summary scopes period by MES record while production fields require 3022 proof',()=>{
  assert.match(src,/productionEvidenceForOccurrence/);
  assert.match(src,/failure_record_date/);
  assert.match(src,/production_evidence_proven/);
  assert.match(src,/Registro MES/);
  assert.match(src,/produção só são usados quando comprovados pela 3022/);
  assert.doesNotMatch(src,/production_operational_date\|\|row\.defect_time/);
  assert.doesNotMatch(src,/day\(row\.production_operational_date\|\|row\.defect_time\)/);
});

test('unknown shift keeps failures visible instead of manufacturing zero',()=>{
  assert.match(src,/base\.some\(row=>row\.production_evidence_proven&&row\.production_shift\)/);
  assert.match(src,/Turno não classificado pela 3022/);
  assert.match(src,/não foram convertidas em zero/);
});

test('FPY quantity require proven production scope for selected period',()=>{
  assert.match(src,/periodRows\.every\(row=>row\.production_evidence_proven&&row\.production_operational_date===period\.from\)/);
  assert.match(src,/FPY\/Quantity aparecem como — quando a 3022 não prova/);
});
