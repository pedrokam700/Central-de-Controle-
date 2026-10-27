import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSmartSnAlerts,renderSmartSnAlerts} from '../ames/console-sn-smart-alerts.mjs';

const failure=(pcba='PCB-A')=>({pcba_sn:pcba,defect_code:'F1',defect_desc:'LCD LEAK',defect_time:'2026-10-10T10:00:00-03:00',source:'2114'});
const proof=(pcba='PCB-A')=>({current_failure:failure('PCB-A'),failure:failure(pcba),repairs:[{repair_code:'MB_REPAIR',repair_user:'BRM00075',repair_time:'2026-10-10T11:00:00-03:00',repair_comment:'Reparo realizado',source:'3012'}]});

function model(){
  return {
    current_pcba:'PCB-A',current:{...failure('PCB-A'),raw:{}},own_history:[],process_contexts:[],materials:[],correlation_limits:[],
    alerts:[
      {kind:'PCBA_SAME_FAILURE',severity:'high',pcba_sn:'PCB-A',prior_defect_code:'F1',prior_defect_time:'2026-10-10T10:00:00-03:00',sources:['2114'],evidence:proof('PCB-A')},
      {kind:'COMPONENT_SAME_FAILURE',severity:'high',item_type:'LCM',item_sn:'LCM-1',pcba_sn:'PCB-OLD-1',prior_defect_code:'F1',prior_defect_time:'2026-10-08T10:00:00-03:00',sources:['3074','2114'],evidence:{...proof('PCB-OLD-1'),binding:{item_sn:'LCM-1',previous_pcba:'PCB-OLD-1',current_pcba:'PCB-A'}}},
      {kind:'COMPONENT_SAME_FAILURE',severity:'high',item_type:'CAMERA',item_sn:'CAM-2',pcba_sn:'PCB-OLD-2',prior_defect_code:'F1',prior_defect_time:'2026-10-07T10:00:00-03:00',sources:['3074','2114'],evidence:{...proof('PCB-OLD-2'),binding:{item_sn:'CAM-2',previous_pcba:'PCB-OLD-2',current_pcba:'PCB-A'}}},
      {kind:'PCBA_MAINBOARD_REPAIR_RECURRENCE',severity:'high',pcba_sn:'PCB-A',prior_defect_code:'F1',prior_defect_time:'2026-10-10T10:00:00-03:00',sources:['2114','3012','3022'],evidence:{...proof('PCB-A'),return:{station:'A5400',operation:'RF TEST',time:'2026-10-10T12:00:00-03:00'}}},
    ],
  };
}
const reusedResult={trace_insights:{pcba_rows:[{PCBA:'PCB-A','Defect Code atual':'F1','Defect Time atual':'2026-10-10T10:00:00-03:00','_pcba_use_index':2,'Usos conhecidos da PCBA':2,'Reusos anteriores da PCBA':1,source:'V0.16'}]}};

test('smart alerts promote proven second-use PCBA plus same-failure recurrence without claiming cause',()=>{
  const alerts=buildSmartSnAlerts(model(),reusedResult);
  assert.equal(alerts[0].id,'pcba-same-failure');
  assert.equal(alerts[0].title,'PCBA 2º+ uso com mesma falha');
  assert.equal(alerts[0].severity,'high');
  assert.equal(alerts[0].usage.use_index,2);
  assert.ok(alerts.some(alert=>alert.id==='mainboard-recurrence'));
  const html=renderSmartSnAlerts(model(),reusedResult,'pt-BR');
  assert.match(html,/PCBA 2º\+ uso com mesma falha/);
  assert.match(html,/Falha reapareceu após MainBoard repair/);
  assert.match(html,/Correlação técnica — não confirma causa raiz/);
  assert.match(html,/Ver evidências/);
  assert.match(html,/A5400/);
});

test('component alerts aggregate by distinct reused material and keep exact evidence',()=>{
  const alerts=buildSmartSnAlerts(model(),reusedResult);
  const grouped=alerts.find(alert=>alert.id==='component-same-failure');
  assert.equal(grouped.alerts.length,2);
  assert.equal(grouped.title,'2 componentes reutilizados com mesma falha');
  const html=renderSmartSnAlerts(model(),reusedResult,'pt-BR');
  assert.match(html,/2 componentes reutilizados com mesma falha/);
  assert.match(html,/LCM-1/);
  assert.match(html,/CAM-2/);
  assert.match(html,/PCB-OLD-1/);
  assert.match(html,/PCB-OLD-2/);
  assert.match(html,/3074/);
});

test('missing PCBA-use evidence never upgrades same-failure history to second-use alert',()=>{
  const alerts=buildSmartSnAlerts(model(),{});
  const board=alerts.find(alert=>alert.id==='pcba-same-failure');
  assert.equal(board.title,'Mesma falha já ocorreu nesta PCBA');
  assert.equal(board.usage,null);
  const html=renderSmartSnAlerts(model(),{},'pt-BR');
  assert.doesNotMatch(html,/PCBA 2º\+ uso com mesma falha/);
  assert.match(html,/Mesma falha já ocorreu nesta PCBA/);
});

test('smart alert surface is bilingual while technical IDs and evidence remain exact',()=>{
  const html=renderSmartSnAlerts(model(),reusedResult,'en-US');
  assert.match(html,/2nd\+ use PCBA with the same failure/);
  assert.match(html,/2 reused components with the same failure/);
  assert.match(html,/Failure reappeared after MainBoard repair/);
  assert.match(html,/Technical correlation — does not confirm root cause/);
  assert.match(html,/BRM00075/);
  assert.match(html,/LCM-1/);
});

test('no correlation stays explicit unknown rather than zero alerts',()=>{
  const m={current_pcba:'PCB-A',current:{...failure(),raw:{}},own_history:[],materials:[],alerts:[],correlation_limits:[]};
  const html=renderSmartSnAlerts(m,{},'pt-BR');
  assert.equal(html,'','No provable alert must produce no alert box');
  assert.equal(html,'','Unproven source coverage must be handled by provenance, not an alert');
  assert.doesNotMatch(html,/>0 alert/);
});

test('empty unproven technical evidence does not render an alert panel',()=>{
  assert.equal(renderSmartSnAlerts({current_pcba:'PCB-A',alerts:[],own_history:[],materials:[]}), '');
});

test('historical 2114 same-failure alert clearly separates new mounting',()=>{
  const m=model();
  m.current=null;
  m.board_reference_is_historical=true;
  m.board_failure_reference={...failure('PCB-A'),hist_seq:1};
  m.own_history=[{...failure('PCB-A'),hist_seq:0}];
  m.alerts=[{kind:'PCBA_SAME_FAILURE',severity:'high',
    board_reference_is_historical:true,pcba_sn:'PCB-A',
    prior_defect_code:'F1',prior_hist_seq:0,evidence:{
      ...proof('PCB-A'),failure:{...failure('PCB-A'),hist_seq:0},
      current_failure:{...failure('PCB-A'),hist_seq:1},
    }}];
  const html=renderSmartSnAlerts(m);
  assert.match(html,/Recorrência histórica desta PCBA/);
  assert.match(html,/componentes do novo ciclo/);
  assert.match(html,/Hist Seq 0/);
  assert.match(html,/Hist Seq 1/);
});
