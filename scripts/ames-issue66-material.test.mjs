import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMaterialSnInvestigation} from '../ames/console-sn-material-investigation.mjs';

const old={pcba_sn:'BOARD-A',history:{'Defect Code':'GN-CAM','Defect Description':'Rear camera','Defect Time':'2026-10-20 10:00:00'},
  reason:'defect_inside_proven_binding_interval'};
const now={pcba_sn:'BOARD-B',history:{'Defect Code':'GN-CAM','Defect Description':'Rear camera','Defect Time':'2026-10-22 10:00:00'},
  reason:'defect_inside_proven_binding_interval'};
const result={detected_type:'MATERIAL_SN',material_investigation:{query_material_sn:'CAM-001',
  observed_cycles:[{pcba_sn:'BOARD-A',bind_time_utc:'2026-10-19T09:00:00+00:00',iss_status_now:'N',event_count:2},
    {pcba_sn:'BOARD-B',bind_time_utc:'2026-10-21T09:00:00+00:00',iss_status_now:'Y',event_count:1}],
  known_use_count:2,distinct_pcba_count:2,omitted_pcba_count:0,coverage:'observed',
  failure_links:{proven:[old,now],candidates:[],excluded:[{pcba_sn:'BOARD-A'}]},
  recurrences:[{severity:'high',earlier:old,later:now,message:'recorrência compatível associada ao material; causalidade não comprovada'}]},
  trace_3012:{rows:[{pcba_sn:'BOARD-A',repair_comment:'Earlier camera review',repair_user:'TECH',repair_time:'2026-10-20 11:00:00'}]}};

test('material report shows bounded cycles, only temporally supported failures and migrant alert',()=>{
  const html=renderMaterialSnInvestigation(result,'pt-BR');
  assert.match(html,/CAM-001/);
  assert.match(html,/BOARD-A → BOARD-B/);
  assert.match(html,/data-sn-open-pcba="BOARD-A"/);
  assert.match(html,/2.*Falhas comprovadas dentro dos vínculos/s);
  assert.match(html,/Earlier camera review/);
  assert.match(html,/associação candidata à ocorrência/);
  assert.match(html,/causalidade não comprovada/);
  assert.match(html,/1 registros 2114 fora do período/);
});

test('HTML escapes untrusted MES data and material view is absent for PCBA lookup',()=>{
  assert.equal(renderMaterialSnInvestigation({detected_type:'PCBA',material_investigation:result.material_investigation}), '');
  const payload=structuredClone(result);payload.material_investigation.observed_cycles[0].pcba_sn='<img src=x onerror=alert(1)>';
  const html=renderMaterialSnInvestigation(payload,'pt-BR');
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('unknown intervals and omitted PCBAs are flagged, never counted as confirmed failure',()=>{
  const payload=structuredClone(result);
  payload.material_investigation.coverage='partial';payload.material_investigation.omitted_pcba_count=1;
  payload.material_investigation.failure_links={proven:[],candidates:[old],excluded:[]};
  payload.material_investigation.recurrences=[];
  const html=renderMaterialSnInvestigation(payload,'pt-BR');
  assert.match(html,/Cobertura parcial/);
  assert.match(html,/1 PCBAs não investigadas/);
  assert.match(html,/Falhas candidatas/);
  assert.doesNotMatch(html,/Alerta · possível recorrência/);
});
