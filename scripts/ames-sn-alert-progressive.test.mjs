import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSnCorrelationAlerts} from '../ames/evidence-view.mjs';

const model={
  alerts:[
    {kind:'PCBA_SAME_FAILURE',severity:'high',pcba_sn:'PCB-A',evidence:{failure:{pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD',defect_time:'2026-10-10T10:00:00-03:00',source:'2114'},current_failure:{pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD',defect_time:'2026-10-17T10:00:00-03:00',source:'2114'},repairs:[{repair_user:'BRM00068',repair_time:'2026-10-10T11:00:00-03:00',source:'3012',repair_code:'REPAIR',repair_desc:'MainBoard repair',repair_comment:'Comentário completo'}]}},
    {kind:'COMPONENT_SAME_FAMILY',severity:'review',item_type:'LCM',item_sn:'LCM-1',pcba_sn:'PCB-OLD',evidence:{failure:{pcba_sn:'PCB-OLD',defect_code:'F2',defect_desc:'Display',defect_time:'2026-10-09T08:00:00-03:00',source:'2114'},current_failure:{pcba_sn:'PCB-A',defect_code:'F1',defect_desc:'LCD',defect_time:'2026-10-17T10:00:00-03:00',source:'2114'},binding:{item_sn:'LCM-1',previous_pcba:'PCB-OLD',current_pcba:'PCB-A',previous:{pcba_sn:'PCB-OLD',bind_time:'2026-10-01T08:00:00-03:00',unbind_time:'2026-10-09T09:00:00-03:00',offset:'-03:00'},current:{pcba_sn:'PCB-A',bind_time:'2026-10-10T08:00:00-03:00',unbind_time:null,offset:'-03:00'}}}}
  ],
  correlation_limits:[{code:'COMPONENT_BINDING_UNPROVEN',item_sn:'FPC-2'}]
};

test('correlation alerts keep the decision summary visible and collapse technical proof by default',()=>{
  const html=renderSnCorrelationAlerts(model,'pt-BR');
  assert.match(html,/ALERTA DE CORRELAÇÃO/);
  assert.match(html,/PCBA: 1/);
  assert.match(html,/Componentes: 1/);
  assert.match(html,/Alta prioridade: 1/);
  assert.equal((html.match(/data-correlation-evidence/g)||[]).length,2);
  assert.doesNotMatch(html,/data-correlation-evidence[^>]*\sopen(?:\s|>|=)/);
  assert.match(html,/Ver evidências completas/);
  assert.match(html,/Repair User: BRM00068/);
  assert.match(html,/Repair Comment: Comentário completo/);
  assert.match(html,/LCM-1/);
  assert.match(html,/data-correlation-limits/);
});

test('progressive correlation alert structure is bilingual without dropping exact evidence',()=>{
  const html=renderSnCorrelationAlerts(model,'en-US');
  assert.match(html,/CORRELATION ALERT — REVIEW REQUIRED/);
  assert.match(html,/Components: 1/);
  assert.match(html,/High priority: 1/);
  assert.match(html,/View full evidence/);
  assert.match(html,/Evidence limitations/);
  assert.match(html,/PCB-OLD/);
  assert.match(html,/F1/);
});

test('no-alert state remains explicit rather than becoming a zero-correlation claim',()=>{
  const html=renderSnCorrelationAlerts({alerts:[],correlation_limits:[{code:'CURRENT_TIME_UNPROVEN',pcba_sn:'PCB-A'}]},'pt-BR');
  assert.match(html,/Nenhuma correlação comprovada com as evidências disponíveis/);
  assert.match(html,/isso não prova ausência de histórico/);
  assert.doesNotMatch(html,/data-correlation-evidence/);
  assert.match(html,/Limites da evidência/);
});
