import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAgentRead } from '../ames/data/agent-contract.mjs';
import { productFixture } from './ames-fixtures.mjs';

const line='TAN10101';
function legacyPayload(){
  const legacy=productFixture(line,2).payload,sid=String(legacy.summary.snapshot_id);
  legacy.defects.forEach(row=>row.snapshot_id=sid);
  return {legacy,sid};
}

test('removed_defects fica separado e não infla ocorrências/defect_count atuais',()=>{
  const {legacy}=legacyPayload();
  const payload={legacy,datasets:{
    removed_defects:[{line,defect_key:'OLD-1',pcba_sn:'PCBA-OLD',defect_code:'D-OLD',defect_desc:'Falha antiga',defect_time:'2026-10-08T08:00:00-03:00',product_model:'CPH2859V',repair_comment:'validar AT',repair_status_current:'N',defect_type_current:'MainBoard',repair_state_current:'REMOVED_FROM_LATEST',raw_json:'NAO_PODE_VAZAR'}],
    pcba_history:[],material_reuse:[],history_contexts:[],process_events:[],process_defect_contexts:[]
  },insights:null};
  const normalized=normalizeAgentRead(payload);
  assert.equal(normalized.occurrences.length,2);
  assert.equal(normalized.summary.defect_count,200);
  assert.equal(normalized.removed_occurrences_status,'available');
  assert.equal(normalized.removed_occurrences.length,1);
  const removed=normalized.removed_occurrences[0];
  assert.equal(removed.pcba_sn,'PCBA-OLD');
  assert.equal(removed.product_key,'CPH2859V');
  assert.equal(removed.present_in_3028,false);
  assert.equal(removed.identity_kind,'legacy_removed_row');
  assert.equal(removed.raw_json,undefined);
  assert.ok(!normalized.occurrences.some(row=>row.evidence_ref===removed.evidence_ref));
  assert.ok(normalized.coverage.reasons.includes('removed_defects_loaded_separately'));
  assert.ok(!normalized.coverage.reasons.includes('removed_defects_unavailable'));
});

test('dataset removidas disponível e vazio representa zero real',()=>{
  const {legacy}=legacyPayload();
  const normalized=normalizeAgentRead({legacy,datasets:{removed_defects:[],pcba_history:[],material_reuse:[],history_contexts:[],process_events:[],process_defect_contexts:[]},removed_defects_available:true,insights:null});
  assert.equal(normalized.removed_occurrences_status,'available');
  assert.deepEqual(normalized.removed_occurrences,[]);
  assert.ok(!normalized.coverage.reasons.includes('removed_defects_unavailable'));
});

test('dataset removidas ausente continua indisponível e nunca vira zero',()=>{
  const {legacy}=legacyPayload();
  const normalized=normalizeAgentRead({legacy,datasets:{removed_defects:[],pcba_history:[],material_reuse:[],history_contexts:[],process_events:[],process_defect_contexts:[]},removed_defects_available:false,insights:null});
  assert.equal(normalized.removed_occurrences_status,'unavailable');
  assert.deepEqual(normalized.removed_occurrences,[]);
  assert.ok(normalized.coverage.reasons.includes('removed_defects_unavailable'));
});

test('fallback tenta removidas de forma opcional e Falhas não mistura dimensão ausente com zero',()=>{
  const client=fs.readFileSync('ames/agent-client.mjs','utf8');
  const view=fs.readFileSync('ames/console-legacy-parity.mjs','utf8');
  assert.match(client,/let removedDefectsAvailable=true/);
  assert.match(client,/dataset=removed_defects/);
  assert.match(client,/removedDefectsAvailable=false/);
  assert.match(client,/removed_defects_available:removedDefectsAvailable/);
  assert.match(view,/removed_occurrences_status==='available'/);
  assert.match(view,/status==='REMOVED'\?removed/);
  assert.match(view,/status==='N'\?!removed/);
  assert.match(view,/currentRows\.filter/);
  assert.match(view,/Removida do export/);
  assert.match(view,/dimensão indisponível/);
  assert.match(view,/ausência de dataset não equivale a zero removidas/);
  assert.match(view,/removedAvailable\?'':' disabled'/);
  assert.match(view,/snapshot===lastSnapshot/);
});
