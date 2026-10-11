import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCoraMesExternalContext,projectCoraMesExternalSummary,CORA_MES_EXTERNAL_SCHEMA} from '../ames/data/cora-external.mjs';
import {assertCoraExternalRequest} from '../core/cora-egress-transport.mjs';

function sensitiveContext(product='CPH2859V'){
  return {
    schema:'central-mes-context-v1',status:'partial',origin:'MES',source:'local',freshness:'fresh',
    line_id:'TAN10101',product,defect_code:'D001',snapshot_id:'snap-secret',collected_at:'2026-10-11T12:00:00Z',snapshot_revision:7,
    pcba_sn:'002527SECRETPCBA',material_sn:'MATERIAL-SECRET',
    pcba_history_2114:[{pcba_sn:'002527OLD',defect_oper:'operator-secret'}],
    material_3074:[{material_sn:'MATERIAL-SECRET',current_pcba_sn:'002527SECRETPCBA'}],
    process_timeline:[{operation_code:'3022',comment:'secret comment'}],
    coverage:{status:'partial',reason:'bounded'},matched_rows:3,included_rows:1,
    facts:[{
      kind:'observed_fact',evidence_status:'source_observation',evidence_ref:'private-ref',occurrence_id:'occ-private',
      line_id:'TAN10101',product,pcba_sn:'002527SECRETPCBA',source_view:'3012',defect_code:'D001',
      defect_desc:'LCD black stain',defect_time:'2026-10-11T09:00:00',repair_status:'repaired'
    }],
    correlations:[],hypotheses:[],human_confirmed_causes:[],rules:'local reasoning text'
  };
}

test('projeção externa remove SNs, operador, histórico bruto, evidência e texto local',()=>{
  const out=projectCoraMesExternalContext(sensitiveContext());
  const text=JSON.stringify(out);
  for(const forbidden of ['002527SECRETPCBA','002527OLD','MATERIAL-SECRET','operator-secret','secret comment','private-ref','occ-private','snap-secret','local reasoning text']){
    assert.equal(text.includes(forbidden),false,forbidden);
  }
  for(const forbiddenKey of ['pcba_sn','material_sn','pcba_history_2114','material_3074','process_timeline','defect_oper','evidence_ref','occurrence_id','defect_time']){
    assert.equal(Object.prototype.hasOwnProperty.call(out,forbiddenKey),false,forbiddenKey);
  }
});

test('projeção preserva somente contexto técnico allowlisted necessário',()=>{
  const out=projectCoraMesExternalContext(sensitiveContext());
  assert.deepEqual(out,{
    analysis_kind:'mes_context',
    line_id:'TAN10101',
    product:'CPH2859V',
    defect_code:'D001',
    snapshot_revision:7,
    source_view:'MES',
    coverage_status:'partial',
    quantity:3,
    defect_rows:[{
      line_id:'TAN10101',product:'CPH2859V',source_view:'3012',defect_code:'D001',defect_desc:'LCD black stain',repair_status:'repaired'
    }]
  });
  assert.equal(Object.isFrozen(out),true);
  assert.equal(Object.isFrozen(out.defect_rows),true);
  assert.equal(Object.isFrozen(out.defect_rows[0]),true);
});

test('projeção já nasce aprovada pelo guard de failure-analysis sanitizado',()=>{
  const out=projectCoraMesExternalContext(sensitiveContext());
  const verdict=assertCoraExternalRequest({path:'/api/failure-analysis',method:'POST',payload:out,sanitized:true});
  assert.equal(verdict.permitted,true);
});

test('CPH exato é preservado; CPH2859V não é normalizado para CPH2859',()=>{
  assert.equal(projectCoraMesExternalContext(sensitiveContext('CPH2859V')).product,'CPH2859V');
  assert.equal(projectCoraMesExternalContext(sensitiveContext('CPH2859')).product,'CPH2859');
  assert.notEqual(projectCoraMesExternalContext(sensitiveContext('CPH2859V')).product,projectCoraMesExternalContext(sensitiveContext('CPH2859')).product);
});

test('contexto ausente continua seguro e explícito sem inventar zero de MES',()=>{
  const out=projectCoraMesExternalContext({status:'not_selected'});
  assert.equal(out.coverage_status,'not_selected');
  assert.equal(out.line_id,null);
  assert.equal(out.product,null);
  assert.equal(out.defect_code,null);
  assert.equal(out.quantity,0);
  assert.deepEqual(out.defect_rows,[]);
  const summary=projectCoraMesExternalSummary({status:'not_selected'});
  assert.equal(summary.schema,CORA_MES_EXTERNAL_SCHEMA);
  assert.equal(summary.coverage_status,'not_selected');
  assert.equal(summary.defect_rows,0);
});
