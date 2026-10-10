import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAgentRead } from '../ames/data/agent-contract.mjs';
import { productFixture } from './ames-fixtures.mjs';

const line='TAN10101';

test('removed_defects fica separado e não infla ocorrências/defect_count atuais',()=>{
  const legacy=productFixture(line,2).payload,sid=String(legacy.summary.snapshot_id);
  legacy.defects.forEach(row=>row.snapshot_id=sid);
  const payload={legacy,datasets:{
    removed_defects:[{line,defect_key:'OLD-1',pcba_sn:'PCBA-OLD',defect_code:'D-OLD',defect_desc:'Falha antiga',defect_time:'2026-10-08T08:00:00-03:00',product_model:'CPH2859V',repair_comment:'validar AT',repair_status_current:'N',defect_type_current:'MainBoard',repair_state_current:'REMOVED_FROM_LATEST',raw_json:'NAO_PODE_VAZAR'}],
    pcba_history:[],material_reuse:[],history_contexts:[],process_events:[],process_defect_contexts:[]
  },insights:null};
  const normalized=normalizeAgentRead(payload);
  assert.equal(normalized.occurrences.length,2);
  assert.equal(normalized.summary.defect_count,200);
  assert.equal(normalized.removed_occurrences.length,1);
  const removed=normalized.removed_occurrences[0];
  assert.equal(removed.pcba_sn,'PCBA-OLD');
  assert.equal(removed.product_key,'CPH2859V');
  assert.equal(removed.present_in_3028,false);
  assert.equal(removed.identity_kind,'legacy_removed_row');
  assert.equal(removed.raw_json,undefined);
  assert.ok(!normalized.occurrences.some(row=>row.evidence_ref===removed.evidence_ref));
  assert.ok(normalized.coverage.reasons.includes('removed_defects_loaded_separately'));
});

test('fallback lê dataset removido e Falhas não mistura removidas nos contadores N/Y atuais',()=>{
  const client=fs.readFileSync('ames/agent-client.mjs','utf8');
  const view=fs.readFileSync('ames/console-legacy-parity.mjs','utf8');
  assert.match(client,/\['defects','removed_defects','pcba_history'/);
  assert.match(view,/snapshot\?\.removed_occurrences/);
  assert.match(view,/status==='REMOVED'\?removed/);
  assert.match(view,/status==='N'\?!removed/);
  assert.match(view,/currentRows\.filter/);
  assert.match(view,/Removida do export/);
  assert.match(view,/snapshot===lastSnapshot/);
});
