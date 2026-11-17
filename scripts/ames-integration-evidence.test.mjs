import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {buildReuseCohorts} from '../ames/data/reuse-cohorts.mjs';
import {buildReuseHistoryTimeline} from '../ames/data/reuse-history-timeline.mjs';
import {productionEvidenceForOccurrence} from '../ames/data/production-evidence.mjs';
import {failureOccurrenceEvidence} from '../ames/console-failure-evidence.mjs';
import {temporalProofForFailure} from '../ames/console-sn-temporal-proof.mjs';
import {buildDailyFailureRows} from '../ames/daily-failure-analytics.mjs';
import {renderBoardComparisonTable} from '../ames/console-reuse-cohorts.mjs';
test('one SQLite evidence set agrees on physical use, production, historical names, timeline and SN',()=>{
 const f=JSON.parse(execFileSync(process.env.PYTHON_BIN||'python3',['scripts/agent-integration-evidence.fixture.py'],{encoding:'utf8'}));
 const s=normalizeCanonical(f.current),old=normalizeCanonical(f.old),cohorts=buildReuseCohorts(s);
 assert.deepEqual(cohorts.pcbas.rows.map(r=>[r.sn,r.use_index]).sort(),[['P1',1],['P2',2],['P3',3],['P4',3]]);
 assert.deepEqual(cohorts.components.rows.map(r=>[r.sn,r.use_index]).sort(),[['M1',1],['M2',2],['M3',3],['M4',null]]);
 const daily=buildDailyFailureRows({read:line=>({snapshot:line===s.line_id?s:null})});
 for(const o of s.occurrences){
  const production=productionEvidenceForOccurrence(o,s.process_timeline.contexts);
  assert.equal(production.trusted,true);assert.equal(production.event_time,'2026-11-03T08:00:00-03:00');
  assert.equal(failureOccurrenceEvidence(s,o).production.event_time,production.event_time);
  assert.equal(temporalProofForFailure(o,{local_snapshot:{process_contexts:s.process_timeline.contexts}},o.pcba_sn).production.event_time,production.event_time);
  assert.equal(daily.find(r=>r.pcba===o.pcba_sn).production_event_time,production.event_time);
 }
 assert(old.occurrences.every(o=>!productionEvidenceForOccurrence(o,old.process_timeline.contexts).trusted));
 const board=s.occurrences.find(o=>o.pcba_sn==='P1');
 const events=buildReuseHistoryTimeline({failures:[...s.occurrences,...s.pcba_history.records],repairs:board.repair_evidence_3012,operators:s.process_timeline.events,pcbas:['P1']});
 assert(events.some(e=>e.source_view==='2114'&&String(e.hist_seq)==='0'&&e.defect_time==='2026-11-01 08:00:00'&&e.actors.some(a=>a.name==='Autor sintético')));
 assert(events.some(e=>e.source_view==='2114'&&e.defect_code==='UNDATED'&&e.defect_time===null));
 assert(events.some(e=>e.source_view==='3012'&&e.repair_comment==='Comentário sintético preservado'));
 assert(events.some(e=>e.source_view==='3022'&&e.actors.some(a=>a.name==='Pessoa sintética')));
 assert(f.sn.process_events.some(e=>e.operator_name==='Pessoa sintética'&&e.operator_role==='observed_process_operator'));
 const html=renderBoardComparisonTable(cohorts.pcbas.rows.find(r=>r.sn==='P1'),{repairs:board.repair_evidence_3012,operators:s.process_timeline.events});
 for(const text of ['Autor sintético','Pessoa sintética','Comentário sintético preservado','UNDATED'])assert(html.includes(text),text);
});
