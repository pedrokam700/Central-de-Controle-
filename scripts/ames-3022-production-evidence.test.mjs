import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCanonical} from '../ames/data/canonical.mjs';
import {productionEvidenceForOccurrence,trustedProductionEvidence,productionEvidenceGap} from '../ames/data/production-evidence.mjs';
import {failureOccurrenceEvidence} from '../ames/console-failure-evidence.mjs';
import {canonicalAgentFixture,productFixture} from './ames-fixtures.mjs';
import {execFileSync} from 'node:child_process';
import {buildDailyFailureRows} from '../ames/daily-failure-analytics.mjs';
import {filterProcessScope} from '../ames/console-specialized-views.mjs';
import {temporalProofForFailure} from '../ames/console-sn-temporal-proof.mjs';
const occurrence={pcba_sn:'SYNTHETIC-0001',line:'TAN10101',defect_code:'CAM-D',defect_time:'2026-11-16T10:00:00-03:00',defect_key:'K'};
const evidence={...occurrence,source:'3022',reference_station_code:'A5162',reference_event_time:'2026-11-16T12:00:00Z',
 production_event_time:'2026-11-16T09:00:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-11-16',
 production_shift_source:'3022',production_shift_basis:'reference_process'};
function fixture(contexts=[]){
 const f=productFixture('TAN10101',1);f.payload.defects=[{...occurrence,product_model:'CPH2859'}];
 const p=canonicalAgentFixture(f);p.process_contexts=contexts.map(c=>({...c,line:p.line_id,snapshot_id:p.snapshot_id}));return p;
}
test('failure inspector must use later complete exact context when earlier matching one is partial',()=>{
 const partial={...evidence,reference_event_time:null,production_event_time:null};
 const snapshot={process_timeline:{contexts:[partial,evidence]}};
 assert.equal(productionEvidenceForOccurrence(occurrence,[partial,evidence]).trusted,true);
 assert.equal(failureOccurrenceEvidence(snapshot,occurrence).production.trusted,true);
});
test('failure inspector cannot pick array order when two exact references conflict',()=>{
 const other={...evidence,reference_station_code:'A5150'};
 assert.equal(failureOccurrenceEvidence({process_timeline:{contexts:[evidence,other]}},occurrence).production.trusted,false);
});
test('own production fields cannot bypass contradictory exact context',()=>{
 const other={...evidence,reference_station_code:'A5150'};
 assert.equal(productionEvidenceForOccurrence({...occurrence,...evidence},[other]).trusted,false);
});
test('trust helper rejects invalid future AT and contradictory reference clocks',()=>{
 for(const change of [{production_event_time:'bad',reference_event_time:'bad'},
  {production_event_time:'2026-02-30T12:00:00Z',reference_event_time:'2026-02-30T12:00:00Z'},
  {production_event_time:'2026-11-16T15:00:00Z',reference_event_time:'2026-11-16T15:00:00Z'},
  {reference_station_code:'A6900'},{production_event_time:'2026-11-16T12:30:00Z'}]){
  assert.equal(trustedProductionEvidence({...evidence,...change}).trusted,false,JSON.stringify(change));
 }
});
test('canonical normalization preserves contradictory contexts instead of last-key-wins',()=>{
 const p=fixture([evidence,{...evidence,reference_station_code:'A5150'}]);
 const s=normalizeCanonical(p);
 assert.equal(productionEvidenceForOccurrence(s.occurrences[0],s.process_timeline.contexts).trusted,false);
 assert.equal(s.process_timeline.contexts.length,2);
});
test('canonical rejects contradictory explicit context source even when occurrence fields match',()=>{
 const p=fixture([{...evidence,source_id:'FOREIGN'}]);
 assert.throws(()=>normalizeCanonical(p),/context|identity|source|lineage/i);
});
test('nested timeline context cannot be restamped from another snapshot',()=>{
 const p=fixture();p.capabilities.process_timeline=true;
 p.datasets.process_timeline=[{record_id:'E',line_id:p.line_id,snapshot_id:p.snapshot_id,snapshot_revision:p.snapshot_revision,
  pcba_sn:occurrence.pcba_sn,station:'A5162',event_time:evidence.reference_event_time,
  provenance:{adapter:{defect_contexts:[{...evidence,snapshot_id:'FOREIGN'}]}}}];
 p.coverage.process_timeline.stored_total=1;
 const s=normalizeCanonical(p);
 assert.equal(productionEvidenceForOccurrence(s.occurrences[0],s.process_timeline.contexts).trusted,false);
});
test('identical duplicated evidence remains usable, not a conflict or a new occurrence',()=>{
 const p=fixture([evidence,{...evidence}]);const s=normalizeCanonical(p);
 assert.equal(productionEvidenceForOccurrence(s.occurrences[0],s.process_timeline.contexts).trusted,true);
 assert.equal(s.occurrences.length,1);
});
test('missing context and missing time remain pending without borrowing 3028/3012 clocks',()=>{
 const o={...occurrence,repair_time:'2026-11-16T16:00:00Z'};
 assert.equal(productionEvidenceForOccurrence(o,[]).event_time,null);
 assert.match(productionEvidenceGap(o,[]),/sem contextos/);
 assert.equal(productionEvidenceForOccurrence(o,[{...evidence,reference_event_time:null,production_event_time:null}]).trusted,false);
});
test('same SQLite evidence agrees across daily Dashboard, Falhas, Processo and Consulta SN',()=>{
 const f=JSON.parse(execFileSync(process.env.PYTHON_BIN||'python3',['scripts/agent-3022-production-evidence.test.py','--fixture'],{encoding:'utf8'}));
 const current=normalizeCanonical(f.after),old=normalizeCanonical(f.before),other=normalizeCanonical(f.other_line);
 const contexts=current.process_timeline.contexts;
 const rows=buildDailyFailureRows({read:line=>({snapshot:line===current.line_id?current:line===other.line_id?other:null})});
 const codes=Object.fromEntries(f.after.production_diagnostics.map(d=>[d.pcba_sn,d.code]));
 assert.deepEqual(codes,{CONFLICT:'CONFLICTING_REFERENCES',DUPLICATE:'PROVEN',EMPTY:'NO_REFERENCE_PASSAGE',GOOD:'PROVEN',
  INVALID:'INVALID_REFERENCE_TIME',NO_MATCH:'NO_EXACT_OCCURRENCE',PARTIAL:'PARTIAL_QUERY',RAW_ONLY:'CONTEXT_NOT_LOADED',TIMEZONE:'TIMEZONE_CONFLICT',UNMAPPED:'REFERENCE_UNMAPPED',UNQUERIED:'PCBA_NOT_QUERIED'});
 const good=rows.filter(r=>r.pcba==='GOOD').sort((a,b)=>a.defect_time.localeCompare(b.defect_time));
 assert.deepEqual(good.map(r=>r.production_event_time),['2026-11-16T09:00:00-03:00','2026-11-16T10:30:00-03:00']);
 for(const occurrence of current.occurrences){
  const expected=productionEvidenceForOccurrence(occurrence,contexts);
  assert.equal(failureOccurrenceEvidence(current,occurrence).production.trusted,expected.trusted);
  assert.equal(temporalProofForFailure(occurrence,{local_snapshot:{process_contexts:contexts}},occurrence.pcba_sn).production.trusted,expected.trusted);
  assert.equal(rows.find(r=>r.pcba===occurrence.pcba_sn&&r.defect_time===occurrence.defect_time).production_evidence_proven,expected.trusted);
 }
 const conflict=filterProcessScope(contexts,[],{pcba:'CONFLICT'});
 assert(conflict.contexts.every(row=>row.production_evidence_proven===false));
 assert.equal(filterProcessScope(contexts,[]).contexts.filter(row=>row.production_evidence_proven).length,3);
 assert.equal(rows.filter(r=>r.production_evidence_proven).length,3);
 assert(old.occurrences.every(o=>!productionEvidenceForOccurrence(o,old.process_timeline.contexts).trusted));
 assert(other.occurrences.every(o=>!productionEvidenceForOccurrence(o,contexts).trusted));
 assert.match(rows.find(r=>r.pcba==='RAW_ONLY').generation_evidence_gap,/resposta salva/);
 assert.match(rows.find(r=>r.pcba==='PARTIAL').generation_evidence_gap,/consulta parcial/);
});
