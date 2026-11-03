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
  assert.doesNotMatch(html,/2114 · históricos no snapshot: 0/);
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
  assert.match(html,/2114 · históricos no snapshot: 0/);
  assert.match(html,/PCBAs consultadas: 2\/2/);
  assert.match(html,/sem dados confirmados: 2/);
});

test('job done never hides missing 3074 when stage progress still says 100%',()=>{
  const state=doneState({status:'complete',source_status:'COMPLETE'});
  state.job.result.stages={'3074':'error','2114':'done','3022':'partial'};
  const html=collectionStatus(state);
  assert.match(html,/data-trace-source-coverage/);
  assert.match(html,/3074: Falhou/);
  assert.match(html,/3022: Parcial/);
  assert.match(html,/data-trace-source-stage="3074"/);
  assert.match(html,/value="100"/,'progress alone is not completeness');
  assert.doesNotMatch(html,/3074: Completa/);
});

test('a source stage missing from an older job stays unverified, never implicitly complete',()=>{
  const state=doneState({status:'complete',source_status:'COMPLETE'});
  state.job.result.stages={'2114':'done','3022':'done'};
  const html=collectionStatus(state);
  assert.match(html,/3074: Não comprovada/);
  assert.match(html,/Job finalizado não significa fontes completas/);
});

test('complete source coverage has no warning and degraded source is translated to English',()=>{
  const state=doneState({status:'complete',source_status:'COMPLETE'});
  state.job.result.stages={'3074':'done','2114':'done','3022':'done'};
  assert.doesNotMatch(collectionStatus(state),/data-trace-source-coverage/);
  const prior=globalThis.document;
  try{
    globalThis.document={documentElement:{lang:'en-US'}};
    state.job.result.stages['3074']='not_run';
    const html=collectionStatus(state);
    assert.match(html,/Coverage not verified/);
    assert.match(html,/3074: Not collected/);
    assert.match(html,/Finished job does not mean complete sources/);
  }finally{
    if(prior===undefined)delete globalThis.document;
    else globalThis.document=prior;
  }
});

test('3074 partial collection names real query and pagination gaps, never equates job done with full',()=>{
 const state=doneState({status:'complete',source_status:'COMPLETE'});
 state.job.result.stages={'3074':'partial','2114':'done','3022':'done'};
 state.job.result.deep_trace.TAN10103['3074']={
   source_status:'PARTIAL',requested_pcba_count:97,processed_pcba_count:94,pcba_error_count:3,
   coverage_diagnostic:{requested_pcbas:97,processed_pcbas:94,pcba_errors:3,partial_page_count:2,
     reasons:['pcba_errors','extjs_pagination_incomplete'],
     partial_pages:[{pcba_index:3,reason:'page_timeout'}]},
   items:[{pcba_sn:'BOARD-A',status:'COMPLETE'},{pcba_sn:'BOARD-B',status:'ERROR'},{pcba_sn:'BOARD-C',status:'COMPLETE'}]
 };
 const html=collectionStatus(state);
 assert.match(html,/3074 parcial/);
 assert.match(html,/94\/97 PCBAs concluídas/);
 assert.match(html,/3 erro\(s\)/);
 assert.match(html,/2 páginas sem cobertura comprovada/);
 assert.match(html,/Páginas da 3074 não comprovadas/);
 assert.match(html,/PCBAs a conferir: BOARD-B, BOARD-C/);
 assert.match(html,/Cobertura não comprovada/);
});
test('a verified 3074 COMPLETE is not mislabeled partial or missing',()=>{
 const state=doneState({status:'complete',source_status:'COMPLETE'});
 state.job.result.stages={'3074':'done','2114':'done','3022':'done'};
 state.job.result.deep_trace.TAN10103['3074']={source_status:'COMPLETE',
   coverage_diagnostic:{requested_pcbas:3,processed_pcbas:3,pcba_errors:0,partial_page_count:0}};
 const html=collectionStatus(state);
 assert.match(html,/3\/3 PCBAs/);
 assert.match(html,/cobertura de extração comprovada/);
 assert.doesNotMatch(html,/data-trace-source-coverage/);
});
