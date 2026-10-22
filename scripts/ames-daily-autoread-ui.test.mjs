import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchesSavedTodayCapture,matchesReadingPeriod} from '../ames/data/reading-period.mjs';
import {evidenceCountLabel} from '../ames/failure-group-evidence.mjs';
const src=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('saved today is a read-only partial observation, not a promoted live/custom day',()=>{
 const p={summary:{period:{mode:'custom',start_at:'2026-10-21T07:00',end_at:'2026-10-21T17:36'}}};
 const selected={mode:'today',start:'2026-10-21T07:00',end:'2026-10-22T07:00'};
 assert.equal(matchesSavedTodayCapture(p,selected),true);
 assert.equal(matchesReadingPeriod(p,selected),false,'live head contract stays strict');
 p.summary.period.start_at='2026-10-21T08:00';
 assert.equal(matchesSavedTodayCapture(p,selected),false);
 p.summary.period.start_at='2026-10-21T07:00';
 p.summary.period.end_at='2026-10-22T08:00';
 assert.equal(matchesSavedTodayCapture(p,selected),false);
});
test('monitor auto-loads saved current-day index and labels partial scope',()=>{
 const view=src('ames/console-view.mjs'),store=src('ames/data/store.mjs'),line=src('ames/console-legacy-parity.mjs');
 assert.match(view,/refreshTodaySavedIndex\(\);/);
 assert.match(view,/periodController\.select\('today'\)/);
 assert.match(store,/saved_today:!!savedToday/);
 assert.match(line,/ÚLTIMA COLETA SALVA DE HOJE/);
 assert.match(line,/Período efetivamente consultado/);
});
test('historical Base local reuses operational table instead of vertical key/value JSON',()=>{
 const read=src('ames/console-reading-period.mjs'),base=src('ames/console-base-view.mjs');
 assert.match(read,/renderOperationalTable\(rows\.slice/);
 assert.match(read,/operationalColumns\(rows,dataset/);
 assert.doesNotMatch(read,/<ol class="mes-record-list"/);
 assert.match(base,/export function operationalColumns/);
 assert.match(base,/export const renderOperationalTable=table/);
});
test('operator screens prioritize description and PCBA, retain technical code only in evidence',()=>{
 const failures=src('ames/console-legacy-parity.mjs'),css=src('ames/console-operator-parity.css');
 assert.doesNotMatch(failures,/<th>Código técnico<\/th>/);
 assert.match(failures,/ames-pcba-id/);
 assert.match(css,/\.ames-failures-table \.ames-pcba-id/);
 assert.equal(evidenceCountLabel({count:3,exact:false}),'≥ 3');
 assert.equal(evidenceCountLabel({count:3,exact:true}),'3');
});
test('inconclusive reuse outcomes are explained, not treated as no-failure proof',()=>{
 const cohort=src('ames/console-reuse-cohorts.mjs');
 assert.match(cohort,/Sem registro de falha não comprova ausência/);
 assert.match(cohort,/verified_no_failure!==null/);
 assert.match(cohort,/data-cohort-limits/);
});
