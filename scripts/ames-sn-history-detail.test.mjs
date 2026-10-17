import test from 'node:test';
import assert from 'node:assert/strict';
import {pcbaUsageEvidence,renderSnHistoryDetail} from '../ames/console-sn-history-detail.mjs';

const repair=(overrides={})=>({
  association:'exact_occurrence',pcba_sn:'PCB-A',defect_code:'F1',defect_time:'2026-10-10T10:00:00-03:00',
  repair_user:'BRM00075',repair_time:'2026-10-10T11:00:00-03:00',repair_code:'REPAIR',repair_desc:'MainBoard repair',repair_comment:'Primeiro comentário',source:'3012',
  ...overrides,
});

function model(){
  const previous={
    pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-10T10:00:00-03:00',manual_or_auto:'Manual',repair_status:'Y',failure_family:'DISPLAY',source:'2114',raw:{'Defect Hist Seq':'1'},
    repairs:[repair(),repair({repair_time:'2026-10-10T12:30:00-03:00',repair_code:'RETEST',repair_comment:'Segundo comentário\nlinha 2'})],
    analysis_event:{station:'A6900',operation_name:'Export Repair',event_time:'2026-10-10T12:45:00-03:00',operator_id:'BRM00075',operator_name:'João Silva'},
  };
  const current={
    pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-17T09:00:00-03:00',manual_or_auto:'Automatic',repair_status:'N',failure_family:'DISPLAY',source:'2114',raw:{'Defect Hist Seq':'2'},repairs:[],analysis_event:null,
  };
  return {
    current_pcba:'PCB-A',current,own_history:[previous],process_contexts:[],
    materials:[{
      item_sn:'LCM-001',item_type:'LCM',known_use_count:2,reuse_count:1,relation:'MESMA_FALHA',
      bindings:[
        {pcba_sn:'PCB-OLD',bind_time:'2026-10-01T08:00:00Z',unbind_time:'2026-10-09T09:00:00Z',offset:'+00:00',event_count:1,source:'3074'},
        {pcba_sn:'PCB-A',bind_time:'2026-10-11T08:00:00Z',unbind_time:null,offset:'+00:00',event_count:1,source:'3074'},
      ],
      history:[{pcba_sn:'PCB-OLD',relation:'MESMA_FALHA',reason:'Mesmo Defect Code',failure:{
        pcba_sn:'PCB-OLD',defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-08T08:00:00-03:00',manual_or_auto:'Manual',repair_status:'Y',source:'2114',raw:{'Defect Hist Seq':'4'},
        repairs:[repair({pcba_sn:'PCB-OLD',defect_time:'2026-10-08T08:00:00-03:00',repair_time:'2026-10-08T09:00:00-03:00',repair_user:'BRM00090',repair_comment:'Comentário da PCBA antiga'})],
      }}],
    }],
  };
}

const result={
  sn:'PCB-A',
  trace_insights:{pcba_rows:[{
    PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-17T09:00:00-03:00',
    '_pcba_use_index':3,'Usos conhecidos da PCBA':3,'Reusos anteriores da PCBA':2,source:'V0.16',
  }]},
  trace_3022:{operator_evidence:[{pcba_sn:'PCB-A',operator_id:'BRM00075',operator_name:'João Silva'}]},
};

test('detailed history keeps PCBA use evidence separate from failure count',()=>{
  const evidence=pcbaUsageEvidence(model(),result);
  assert.deepEqual(evidence,{proven:true,use_index:3,known_uses:3,previous_uses:2,source:'V0.16'});
  const html=renderSnHistoryDetail(model(),result,'pt-BR');
  assert.match(html,/3º uso/);
  assert.match(html,/Usos conhecidos da PCBA/);
  assert.match(html,/>3</);
  assert.match(html,/Falhas anteriores 2114/);
  assert.match(html,/Reparo 1/);
  assert.match(html,/Reparo 2/);
  assert.match(html,/Primeiro comentário/);
  assert.match(html,/Segundo comentário\nlinha 2/);
  assert.match(html,/João Silva \(BRM00075\)/);
});

test('reused component timeline numbers only proven 3074 bindings and keeps previous PCBA evidence',()=>{
  const html=renderSnHistoryDetail(model(),result,'pt-BR');
  assert.match(html,/Histórico detalhado dos componentes reutilizados/);
  assert.match(html,/LCM-001/);
  assert.match(html,/1º uso/);
  assert.match(html,/2º uso/);
  assert.match(html,/PCB-OLD/);
  assert.match(html,/PCB-A/);
  assert.match(html,/Mesmo Defect Code/);
  assert.match(html,/Comentário da PCBA antiga/);
  assert.match(html,/Contexto não significa causa do componente/);
});

test('unknown or aggregated evidence never manufactures a PCBA use number or binding order',()=>{
  const m=model();
  m.current.raw={};m.process_contexts=[];
  m.materials[0].bindings=[{pcba_sn:'PCB-OLD',bind_time:'2026-10-01T08:00:00Z',unbind_time:'2026-10-09T09:00:00Z',event_count:2,source:'3074'}];
  const html=renderSnHistoryDetail(m,{sn:'PCB-A'},'pt-BR');
  assert.match(html,/O número de uso da própria PCBA não foi comprovado/);
  assert.match(html,/Ordem não comprovada/);
  assert.doesNotMatch(html,/1º uso/);
  assert.doesNotMatch(html,/2º uso/);
});

test('history detail remains bilingual while preserving raw technical identifiers',()=>{
  const html=renderSnHistoryDetail(model(),result,'en-US');
  assert.match(html,/Detailed PCBA history/);
  assert.match(html,/3rd use/);
  assert.match(html,/Detailed reused-component history/);
  assert.match(html,/Binding timeline/);
  assert.match(html,/BRM00075/);
  assert.match(html,/LCM-001/);
});
