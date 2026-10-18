import test from 'node:test';
import assert from 'node:assert/strict';
import {MES_SOURCE_VIEWS,mesSourceProvenance,snapshotProvenance} from '../ames/data/observation-provenance.mjs';
import {renderFailureOccurrenceEvidence,failureOccurrenceEvidence} from '../ames/console-failure-evidence.mjs';
import {SOURCE_STATE} from '../ames/data/source-provenance.mjs';

const occurrence={pcba_sn:'PCBA-1',defect_code:'F1',defect_time:'2026-10-17T09:40:00-03:00',line_id:'TAN10101',product_model:'CPH2817'};
const partial=()=>({
  snapshot_id:'snap-42',line_id:'TAN10101',collected_at:'2026-10-17T12:00:00-03:00',
  source_id:'collector-1',revision:4,snapshot_revision:4,content_hash:'abcdef0123456789',
  coverage:{status:'partial'},occurrences:[occurrence],
  pcba_history:{status:'partial',records:[]},
  material_trace:{status:'unavailable',records:[]},
  process_timeline:{status:'error',error:'3022 timeout',events:[],contexts:[]},
  canonical:{summary:{period:{start_at:'2026-10-16T07:30:00-03:00',end_at:'2026-10-17T07:30:00-03:00'}}},
});
const local=snapshot=>({snapshot,source:'local',source_state:'ok',freshness:'fresh'});

test('provenance only reports explicit source, revision, period and workstation',()=>{
  const p=snapshotProvenance(local(partial()));
  assert.equal(p.snapshot_id,'snap-42');assert.equal(p.revision,4);
  assert.equal(p.source_id,'collector-1');assert.equal(p.workstation_id,null,'source ID is not a PC name');
  assert.equal(p.period_start,'2026-10-16T07:30:00-03:00');
  assert.equal(p.period_end,'2026-10-17T07:30:00-03:00');
  const withoutCanonical={...partial(),canonical:null};
  assert.equal(snapshotProvenance(local(withoutCanonical)).period_start,null,'collection time is not a MES query start');
  withoutCanonical.canonical={workstation_id:'FACTORY-PC-7'};
  assert.equal(snapshotProvenance(local(withoutCanonical)).workstation_id,'FACTORY-PC-7');
});

test('missing, unavailable, failed and partial sources never become a fabricated zero',()=>{
  assert.deepEqual(MES_SOURCE_VIEWS,['3028','2114','3074','3022','3012']);
  const snap=partial();
  assert.equal(mesSourceProvenance(local(snap),'3028').state,SOURCE_STATE.PARTIAL);
  assert.equal(mesSourceProvenance(local(snap),'2114').state,SOURCE_STATE.PARTIAL);
  assert.equal(mesSourceProvenance(local(snap),'2114').count,null);
  assert.equal(mesSourceProvenance(local(snap),'3074').state,SOURCE_STATE.UNAVAILABLE);
  assert.equal(mesSourceProvenance(local(snap),'3022').state,SOURCE_STATE.ERROR);
  assert.equal(mesSourceProvenance(local(snap),'3012').state,SOURCE_STATE.NOT_COLLECTED);
  assert.equal(mesSourceProvenance(local(snap),'3012',{observed:true}).state,SOURCE_STATE.PARTIAL);
  for(const source of MES_SOURCE_VIEWS){
    assert.notEqual(mesSourceProvenance(local(snap),source).count,0,source+' unproven zero');
    assert.equal(mesSourceProvenance({},source).state,SOURCE_STATE.NOT_COLLECTED);
  }
});

test('explicitly completed source can prove zero, but cached snapshot is not live',()=>{
  const snap={...partial(),material_trace:{status:'available',records:[]}};
  assert.deepEqual(
    [mesSourceProvenance(local(snap),'3074').state,mesSourceProvenance(local(snap),'3074').count],
    [SOURCE_STATE.ZERO,0]);
  const cached={snapshot:snap,source:'local_cache',source_state:'cached',freshness:'stale'};
  assert.equal(mesSourceProvenance(cached,'3074').state,SOURCE_STATE.CACHED);
  assert.equal(mesSourceProvenance(cached,'3022').state,SOURCE_STATE.ERROR,'cache cannot mask source error');
  const canonicalComplete={...snap,coverage:{status:'complete',datasets:{defects:{transport_complete:true,source_complete:true}}},occurrences:[]};
  assert.equal(mesSourceProvenance(local(canonicalComplete),'3028').state,SOURCE_STATE.ZERO);
  assert.equal(mesSourceProvenance(local({...snap,occurrences:[]}),'3028').count,null);
  const transported={...canonicalComplete,coverage:{status:'complete',datasets:{defects:{transport_complete:true}}}};
  assert.equal(mesSourceProvenance(local(transported),'3028').state,SOURCE_STATE.PARTIAL,'transport is not evidence of complete MES query');
});

test('the failure evidence UI shows per-source provenance, period and unknowns without a false zero',()=>{
  const snapshot=partial(),evidence=failureOccurrenceEvidence(snapshot,occurrence);
  const html=renderFailureOccurrenceEvidence(evidence,'pt-BR',local(snapshot));
  assert.match(html,/data-ames-snapshot-provenance/);
  assert.match(html,/data-ames-source-view="3022" data-ames-source-state="error"/);
  assert.match(html,/data-ames-source-view="3074" data-ames-source-state="unavailable"/);
  assert.match(html,/data-ames-source-view="2114" data-ames-source-state="partial"/);
  assert.match(html,/collector-1/);
  assert.match(html,/data-ames-source-view="3012" data-ames-source-state="not_collected"/,'3028 repair fields do not certify 3012');
  const confirmed=failureOccurrenceEvidence(snapshot,{...occurrence,repair_evidence_3012:[{pcba_sn:'PCBA-1',defect_code:'F1',repair_comment:'Linked 3012'}]});
  assert.equal(confirmed.repair.source_confirmed,true);
  assert.match(renderFailureOccurrenceEvidence(confirmed,'pt-BR',local(snapshot)),/data-ames-source-view="3012" data-ames-source-state="partial"/);
  assert.match(html,/2026-10-16T07:30:00-03:00/);
  assert.match(html,/Posto\/PC informado<\/span>|Posto\/PC informado/);
  assert.match(html,/2114<\/small><b>—/,'empty partial history cannot be shown as zero');
  assert.doesNotMatch(html,/>0<\/b>/);
  const english=renderFailureOccurrenceEvidence(evidence,'en-US',local(snapshot));
  assert.match(english,/Source evidence and gaps/);
  assert.match(english,/Source state/);
  assert.match(english,/Proven MES period/);
});
