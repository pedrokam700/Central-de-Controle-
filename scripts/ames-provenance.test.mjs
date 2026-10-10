import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectAgentRows } from '../ames/data/agent-contract.mjs';

test('views com refresh exibem proveniência sem aproximar CPH nem converter ausência em zero',()=>{
  const code=fs.readFileSync('ames/console-refresh-decorator.mjs','utf8');
  const css=fs.readFileSync('ames/console-r12-fidelity.css','utf8');
  for(const text of ['snapshot ','origem ','cobertura ','CPH não informado','sem snapshot · ausência não equivale a zero','product_key']) assert.ok(code.includes(text));
  assert.match(code,/new Set\(\(snapshot\?\.occurrences\|\|\[\]\)\.map\(row=>row\.product_key\)/);
  assert.match(code,/snapshot\.coverage\?\.status/);
  assert.match(code,/LINE_IDS\.includes/);
  assert.match(css,/ames-native-provenance/);
});

test('fallback R12 preserva contexto histórico seguro sem vazar raw payload',()=>{
  const rows=projectAgentRows([{
    line:'TAN10101',snapshot_id:'77',pcba_sn:'002527OLD',defect_code:'ANT1',
    line_candidates:['TAN10101','TAN10102','INVALID'],line_ambiguous:true,
    product_candidates:['CPH2817','CPH2819'],raw_json:'NAO_PODE_VAZAR',cookie:'NAO_PODE_VAZAR',
    provenance_contexts:[{
      line_id:'TAN10102',product:'CPH2819',pcba_sn:'002527CURRENT',material_sn:'MAT01',kind:'historical_context',context_key:'CTX-1',
      raw_json:'NAO_PODE_VAZAR',cookie:'NAO_PODE_VAZAR'
    }]
  }],'TAN10101','77');
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].line_candidates,['TAN10101','TAN10102']);
  assert.equal(rows[0].line_ambiguous,true);
  assert.deepEqual(rows[0].product_candidates,['CPH2817','CPH2819']);
  assert.deepEqual(rows[0].provenance_contexts,[{line_id:'TAN10102',product:'CPH2819',pcba_sn:'002527CURRENT',material_sn:'MAT01',kind:'historical_context',context_key:'CTX-1'}]);
  assert.equal(rows[0].raw_json,undefined);
  assert.equal(rows[0].cookie,undefined);
  assert.equal(rows[0].provenance_contexts[0].raw_json,undefined);
});
