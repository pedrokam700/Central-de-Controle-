import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSnTemporalProof,temporalProofForFailure} from '../ames/console-sn-temporal-proof.mjs';

const current={
  pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-17T10:00:00-03:00',source:'2114',
  analysis_event:{station:'A6900',operation_name:'Export Repair',event_time:'2026-10-17T10:20:00-03:00',operator_id:'BRM00075',operator_name:'João Silva'},
};
const model={current_pcba:'PCB-A',current,own_history:[]};

function exactContext(overrides={}){
  return {
    pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-17T10:00:00-03:00',
    production_shift_source:'3022',production_shift_basis:'reference_process',reference_station_code:'A5100',reference_operation_name:'OQC',reference_event_time:'2026-10-17T09:40:00-03:00',production_shift:'1st Shift',production_operational_date:'2026-10-17',
    repair_event_time:'2026-10-17T11:00:00-03:00',return_station_code:'A5400',return_operation_name:'RF TEST',return_event_time:'2026-10-17T11:30:00-03:00',
    ...overrides,
  };
}
function result(contexts=[exactContext()]){
  return {
    local_snapshot:{process_contexts:contexts},
    trace_3022:{process_passages:[
      {pcba_sn:'PCB-A',station:'A5000',operation_name:'Assembly',event_time:'2026-10-17T08:00:00-03:00',operator_id:'OP1',operator_name:'Maria'},
      {pcba_sn:'PCB-A',station:'A5100',operation_name:'OQC',event_time:'2026-10-17T09:40:00-03:00',operator_id:'OP2',operator_name:'Carlos'},
      {pcba_sn:'PCB-A',station:'A7000',operation_name:'After defect',event_time:'2026-10-17T10:30:00-03:00',operator_id:'OP3',operator_name:'Ana'},
      {pcba_sn:'OTHER',station:'X100',operation_name:'Other board',event_time:'2026-10-17T07:00:00-03:00',operator_id:'OPX',operator_name:'Outro'},
    ]},
  };
}

test('3022 temporal proof separates defect, prior production reference, repair and actual return',()=>{
  const proof=temporalProofForFailure(current,result(),'PCB-A');
  assert.equal(proof.production.trusted,true);
  assert.equal(proof.production.station,'A5100');
  assert.equal(proof.production.shift,'1st Shift');
  assert.equal(proof.production.operational_date,'2026-10-17');
  assert.equal(proof.return.proven,true);
  assert.equal(proof.return.station,'A5400');
  assert.equal(proof.return.operation,'RF TEST');
  assert.equal(proof.previous_passages.length,2);
  assert.deepEqual(proof.previous_passages.map(row=>row.station),['A5000','A5100']);

  const html=renderSnTemporalProof(model,result(),'pt-BR');
  assert.match(html,/2114 · Defect Time/);
  assert.match(html,/A5100 · OQC/);
  assert.match(html,/1st Shift/);
  assert.match(html,/2026-10-17/);
  assert.match(html,/3012 · Repair Time/);
  assert.match(html,/A5400 · RF TEST/);
  assert.match(html,/Ver passagens anteriores comprovadas \(2\)/);
  assert.match(html,/A5000/);
  assert.doesNotMatch(html,/A5201/);
  assert.doesNotMatch(html,/After defect/);
  assert.doesNotMatch(html,/Other board/);
});

test('another failure occurrence cannot donate production or return evidence',()=>{
  const foreign=exactContext({defect_code:'F2'});
  const proof=temporalProofForFailure(current,result([foreign]),'PCB-A');
  assert.equal(proof.production.trusted,false);
  assert.equal(proof.return.proven,false);
  const html=renderSnTemporalProof(model,result([foreign]),'pt-BR');
  assert.match(html,/Sem referência 3022 comprovada/);
  assert.doesNotMatch(html,/A5400 · RF TEST/);
});

test('return is only shown when it is later than the repair tied to the exact occurrence',()=>{
  const invalid=exactContext({repair_event_time:'2026-10-17T11:00:00-03:00',return_event_time:'2026-10-17T10:50:00-03:00'});
  const proof=temporalProofForFailure(current,result([invalid]),'PCB-A');
  assert.equal(proof.return.proven,false);
  const html=renderSnTemporalProof(model,result([invalid]),'pt-BR');
  assert.match(html,/Existe Repair Time, mas não há retorno 3022 posterior comprovado/);
});

test('associated analysis event remains process evidence and never becomes production fallback',()=>{
  const noContext=result([]);
  const proof=temporalProofForFailure(current,noContext,'PCB-A');
  assert.equal(proof.production.trusted,false);
  assert.equal(proof.analysis_event.station,'A6900');
  const html=renderSnTemporalProof(model,noContext,'pt-BR');
  assert.match(html,/A6900/);
  assert.match(html,/Export Repair/);
  assert.match(html,/não substitui Defect Time nem prova causa raiz/);
  assert.match(html,/Turno comprovado<\/small><b>—/);
});
