import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionStatus} from '../ames/collection-status.mjs';

function doneState(trace2114, trace3022={status:'complete',requested:2,processed:2,errors:0,events:5,contexts:2,timing:{query_avg_ms:3100}}){
  return {
    job:{
      id:'J-TRACE',kind:'deep_trace',status:'done',stage:'done',message:'finalizado',scope:{trace_mode:'full'},
      stage_progress:{
        '3074':{line:'TAN10103',current:1,total:1,line_percent:100,status:'COMPLETE'},
        '2114':{line:'TAN10103',current:2,total:2,line_percent:100,status:trace2114.source_status||trace2114.status},
        '3022':{line:'TAN10103',current:2,total:2,line_percent:100,status:'COLLECTED',phase:'mes',query_ms:3100,detail:'0025276382'}
      },
      result:{deep_trace:{TAN10103:{scope:{records:1,unique_pcbas:1},enrichment:{material_rows:1,history_rows:0},'2114':trace2114,'3022':trace3022}}}
    },
    error:'',submitting:false
  };
}

test('2114 source failure is never rendered as a successful zero',()=>{
  const html=collectionStatus(doneState({
    status:'partial',source_status:'ERROR',source_error:'Shift não confirmado no campo principal',
    requested_pcba_count:2,processed_pcba_count:0,pcba_error_count:2,pcba_no_data_count:0
  }));
  assert.match(html,/2114 indisponível/);
  assert.match(html,/Shift não confirmado/);
  assert.match(html,/0\/2 consultadas/);
  assert.doesNotMatch(html,/2114 · históricos persistidos: 0/);
});

test('2114 partial state and 3022 MES/local phase remain visible',()=>{
  const html=collectionStatus(doneState({
    status:'partial',source_status:'PARTIAL',requested_pcba_count:2,processed_pcba_count:1,pcba_error_count:1,pcba_no_data_count:1
  }));
  assert.match(html,/2114 parcial/);
  assert.match(html,/1\/2 consultadas/);
  assert.match(html,/leitura A-MES/);
  assert.match(html,/média MES 3100 ms/);
});

test('confirmed complete 2114 may report a real zero only with completed source evidence',()=>{
  const html=collectionStatus(doneState({
    status:'complete',source_status:'COMPLETE',requested_pcba_count:2,processed_pcba_count:2,pcba_error_count:0,pcba_no_data_count:2
  }));
  assert.match(html,/2114 · históricos persistidos: 0/);
  assert.match(html,/PCBAs consultadas: 2\/2/);
  assert.match(html,/sem dados confirmados: 2/);
});
