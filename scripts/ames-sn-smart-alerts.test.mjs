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


test('four priority levels preserve original SN evidence and restore clean segmented presentation',()=>{
  const m=model();
  const originalProof=m.alerts[0].evidence;
  const baseline=renderSmartSnAlerts(m,reusedResult,'pt-BR');
  assert.match(baseline,/data-sn-alert-current-prior/);
  assert.match(baseline,/data-sn-alert-components/);
  assert.match(baseline,/ames-sn-alert-summary-card/);
  assert.match(baseline,/data-sn-alert-severity="high"/);
  assert.match(baseline,/ames-sn-alert-tech-preview/);
  assert.equal(m.alerts[0].evidence,originalProof,'render must not replace or destroy source proof');
  assert.equal(m.alerts[0].evidence.repairs.length,1,'3012 source evidence remains intact');
});
test('same proven board failure seen at three distinct 2114 sequences becomes VERY HIGH, two remain HIGH',()=>{
  const f=(seq)=>({...failure('PCB-A'),hist_seq:seq,defect_time:'2026-10-10T0'+(8+seq)+':00:00-03:00'});
  const m={...model(),current:f(2),own_history:[f(0),f(1)],
    alerts:[{kind:'PCBA_SAME_FAILURE',pcba_sn:'PCB-A',prior_defect_code:'F1',prior_hist_seq:1,
      evidence:{failure:f(1),current_failure:f(2)}}]};
  const result=buildSmartSnAlerts(m,reusedResult);
  assert.equal(result[0].severity,'critical');
  const html=renderSmartSnAlerts(m,reusedResult);
  assert.match(html,/MUITO ALTA/);
  assert.match(html,/data-sn-alert-current-prior/);
  assert.match(html,/Hist Seq 2/);
});
test('three reused same-failure components yield very high; same-family is medium and compatible-only is low',()=>{
  const m=model();
  m.alerts.push({kind:'COMPONENT_SAME_FAILURE',pcba_sn:'PCB-OLD-3',item_type:'BATTERY',item_sn:'BAT-3',
    prior_defect_code:'F1',evidence:{failure:failure('PCB-OLD-3'),binding:{item_sn:'BAT-3',previous_pcba:'PCB-OLD-3',current_pcba:'PCB-A'}}});
  m.alerts.push({kind:'COMPONENT_TYPE_COMPATIBLE',pcba_sn:'PCB-A',item_type:'SPEAKER',item_sn:'SPEAKER-5',
    evidence:{failure:failure('OTHER'),binding:{item_sn:'SPEAKER-5',previous_pcba:'OTHER',current_pcba:'PCB-A'}}});
  m.alerts.push({kind:'COMPONENT_SAME_FAMILY',pcba_sn:'OTHER',item_type:'LCD',item_sn:'LCD-7',
    evidence:{failure:failure('OTHER'),binding:{item_sn:'LCD-7',previous_pcba:'OTHER',current_pcba:'PCB-A'}}});
  const alerts=buildSmartSnAlerts(m,reusedResult);
  assert.equal(alerts.find(x=>x.id==='component-same-failure').severity,'critical');
  assert.equal(alerts.find(x=>x.id==='component-same-family').severity,'medium');
  assert.equal(alerts.find(x=>x.id==='component-compatible-failure').severity,'low');
  assert.deepEqual(alerts.map(x=>x.severity),[...alerts].sort((a,b)=>
    ({critical:0,high:1,medium:2,low:3}[a.severity]-{critical:0,high:1,medium:2,low:3}[b.severity])).map(x=>x.severity));
});
test('one physical technician comment in multiple alerts appears once, with no invented 2114 attribution',()=>{
  const m=model();
  const comment='Checked antenna RF connector';
  const repair={pcba_sn:'PCB-A',row_key:'REPAIR-CANONICAL-1',
    repair_user:'BRM00061',repair_comment:comment,repair_time:'2026-10-10T10:30:00-03:00'};
  for(const alert of m.alerts)alert.evidence={...alert.evidence,repairs:[repair],ambiguous_3012:[repair]};
  const before=JSON.stringify(m.alerts);
  const html=renderSmartSnAlerts(m,reusedResult);
  assert.equal((html.match(/data-sn-alert-technician-preview/g)||[]).length,1);
  assert.equal((html.match(/data-sn-alert-repair-row/g)||[]).length,1);
  assert.equal(JSON.stringify(m.alerts),before,'UI must never mutate model evidence');
});

test('SN alert attributes the fault to A6900 rather than the later 3012 routing operator',()=>{
  const m=model(),repair={pcba_sn:'PCB-A',row_key:'ANALYSIS-1',defect_code:'F1',
    defect_time:'2026-10-10 10:00:00',repair_time:'2026-10-10 11:00:00',
    repair_user:'BRM90001',repair_comment:'Analysed faulty connector'};
  m.alerts[0].evidence.repairs=[repair];
  const result={...reusedResult,trace_3022:{operator_evidence:[
    {pcba_sn:'PCB-A',station:'A5265',event_time:'2026-10-10 10:40:00',operator_id:'BRM90001',operator_name:'Routing Operator'},
    {pcba_sn:'PCB-A',station:'A6900',event_time:'2026-10-10 10:30:00',operator_id:'BRM90002',operator_name:'Fault Analyst'},
    {pcba_sn:'PCB-FOREIGN',station:'A6900',event_time:'2026-10-10 10:35:00',operator_id:'BRM90003',operator_name:'Wrong Board'},
  ]}};
  const html=renderSmartSnAlerts(m,result,'pt-BR');
  assert.match(html,/Fault Analyst \(BRM90002\)/);
  assert.match(html,/Usuário do reparo 3012/);
  assert.match(html,/Routing Operator \(BRM90001\)/);
  assert.doesNotMatch(html,/Wrong Board/);
  const noA6900={...result,trace_3022:{operator_evidence:result.trace_3022.operator_evidence.filter(e=>e.station!=='A6900')}};
  assert.match(renderSmartSnAlerts(m,noA6900,'pt-BR'),/Técnico da falha A6900 não comprovado/);
});


test('prior component board facts show 2114 failure, time, and only exact-PCBA 3012 technician',()=>{
  const m=model(),component=m.alerts.find(a=>a.item_sn==='LCM-1');
  component.evidence.failure={...failure('PCB-OLD-1'),defect_desc:'LCD: Leakage',defect_time:'2026-10-07T08:00:00-03:00'};
  component.evidence.repairs=[
    {pcba_sn:'PCB-OLD-1',row_key:'old-board-1',repair_user:'BRM-OLD',repair_time:'2026-10-07T10:00:00-03:00',repair_comment:'Reconnected display cable'},
    {pcba_sn:'PCB-OTHER',row_key:'other-1',repair_user:'BRM-FOREIGN',repair_time:'2026-10-07T10:01:00-03:00',repair_comment:'Foreign board note'}];
  const html=renderSmartSnAlerts(m,reusedResult);
  const componentCard=html.split('data-sn-alert-component-segment')[1]||'';
  assert.match(componentCard,/Falha da PCBA anterior/);
  assert.match(componentCard,/LCD: Leakage/);
  assert.match(componentCard,/PCB-OLD-1/);
  assert.match(componentCard,/Reconnected display cable/);
  assert.doesNotMatch(componentCard.split('</div></div>')[0],/Foreign board note/,
    'a foreign 3012 repair must never be attributed to the reused component');
});

test('low-risk alert retains historic technician and comments even when a higher-priority PCBA card exists',()=>{
 const m=model(),board='PCB-A';
 const repairs=[
  {pcba_sn:board,row_key:'R-1',defect_code:'F1',defect_time:'2026-11-09 10:11:00',repair_time:'2026-11-09 10:12:09',repair_user:'BRM00151',repair_comment:'Primeira solucao'},
  {pcba_sn:board,row_key:'R-2',defect_code:'F1',defect_time:'2026-11-09 10:11:00',repair_time:'2026-11-09 10:12:09',repair_user:'BRM00151',repair_comment:'Segunda solucao'},
  {pcba_sn:board,row_key:'R-3',defect_code:'F1',defect_time:'2026-11-10 16:50:00',repair_time:'2026-11-10 16:54:05',repair_user:'BRM00075',repair_comment:'Terceira solucao'}
 ];
 m.repairs=repairs;
 m.alerts.push({kind:'COMPONENT_TYPE_COMPATIBLE',item_type:'LCM',item_sn:'COMP-1',pcba_sn:board,sources:['3074','2114'],
  evidence:{failure:failure(board),current_failure:failure(board)}});
 const result={...reusedResult,trace_3012:{rows:repairs},
  trace_3022:{operator_evidence:[
   {pcba_sn:board,station:'A6900',event_time:'2026-11-09 09:12:18',operator_id:'BRM00151',operator_name:'Jamile Maria'},
   {pcba_sn:board,station:'A6900',event_time:'2026-11-10 16:54:05',operator_id:'BRM00075',operator_name:'Jonathan Pires'},
  ]}};
 const html=renderSmartSnAlerts(m,result,'pt-BR');
 assert.match(html,/data-smart-alert="component-compatible-failure"/);
 const low=html.split('data-smart-alert="component-compatible-failure"')[1].split('</article>')[0];
 for(const name of ['Jamile Maria','Jonathan Pires','Primeira solucao','Segunda solucao','Terceira solucao'])
  assert.ok(low.includes(name),'low risk must show: '+name);
 assert.equal((low.match(/data-sn-alert-repair-row/g)||[]).length,3);
 assert.ok(!low.includes('Outros comentários 3012'));
});
