import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSnForensics,provenPreviousFailures,failureOrder} from '../ames/data/sn-forensics.mjs';
import {renderSmartSnAlerts,buildSmartSnAlerts} from '../ames/console-sn-smart-alerts.mjs';
const pcba='TEST-PCBA-1',clock='2026-10-20T09:30:00-03:00';
const history=(seq,at,code='CAM-01',extra={})=>({pcba_sn:pcba,'Defect Hist Seq':seq,'Defect Code':code,
 'Defect Description':'Camera: front cameras failed', 'Defect Time':at,'Repair Status':seq===0?'Y':'N',
 'Defect Type':seq===0?'Phone Disassembly':'MainBoard',...extra});
const mk=(current,older,repairs=[])=>({sn:pcba,detected_type:'PCBA',
 trace_2114:{status:'COMPLETE',pcbas:[{pcba_sn:pcba,status:'COMPLETE',result:{rows:[older,current]}}]},
 trace_3012:{status:'COMPLETE',rows:repairs}});
const alertOf=m=>m.alerts.find(a=>a.kind==='PCBA_SAME_FAILURE');

test('two 2114 histories with same clock, code and PCBA but distinct Hist Seq produce high recurrence, not repair claim',()=>{
 const current=history(1,clock),previous=history(0,clock),data=mk(current,previous);
 const model=buildLiveSnForensics(data),alert=alertOf(model);
 assert.equal(model.current.hist_seq,1);assert.equal(model.own_history.length,1);
 assert(alert);assert.equal(alert.order_basis,'hist_seq_same_clock');
 assert.equal(alert.evidence.failure.hist_seq,0);assert.equal(alert.evidence.current_failure.hist_seq,1);
 assert.equal(alert.evidence.repairs.length,0);assert.equal(alert.root_cause_confirmed,false);
 const html=renderSmartSnAlerts(model,data);
 assert.match(html,/ALTA PRIORIDADE/);assert.match(html,/Hist Seq 0/);assert.match(html,/Hist Seq 1/);
 assert.match(html,/Phone Disassembly/);assert.match(html,/MainBoard/);
 assert.match(html,/Vínculo 2114/);assert.match(html,/não identifica reparo executado/);
 assert.doesNotMatch(html,/Falha reapareceu após MainBoard repair/);
});

test('without trustworthy sequence equal clock does not prove recurrence; contradicted sequence stays invalid',()=>{
 const previous=history(0,clock),current=history(1,clock);
 assert.equal(failureOrder(previous,current).prior,true);
 assert.equal(failureOrder({...previous,'Defect Hist Seq':null},{...current,'Defect Hist Seq':null}).prior,false);
 assert.equal(failureOrder(history(5,clock),current).prior,false);
 assert.equal(failureOrder(history(0,'2026-10-22T09:00:00-03:00'),current).prior,false);
 const noSeq=mk({...current,'Defect Hist Seq':null},{...previous,'Defect Hist Seq':null});
 assert.equal(buildLiveSnForensics(noSeq).own_history.length,0);
 assert.equal(alertOf(buildLiveSnForensics(noSeq)),undefined);
});

test('equal clock 3012 comments are visible only as unassigned candidates, never as two proven AT interventions',()=>{
 const row={pcba_sn:pcba,defect_code:'CAM-01',defect_desc:'Camera: front cameras failed',defect_time:clock,
 repair_time:'2026-10-20T10:00:00-03:00',repair_user:'BRM008',repair_comment:'<replace> camera cable',repair_code:'INSPECT',row_key:'TEST-01'};
 const input=mk(history(1,clock),history(0,clock),[row]);
 const model=buildLiveSnForensics(input),a=alertOf(model),html=renderSmartSnAlerts(model,input);
 assert(a);assert.equal(a.evidence.repairs.length,0);assert.equal(a.evidence.current_3012.length,0);
 assert.equal(a.evidence.ambiguous_3012.length,1);
 assert.match(html,/autoria por ocorrência indeterminada/);assert.match(html,/BRM008/);
 assert.match(html,/&lt;replace&gt;/);assert(!html.includes('<replace>'));
 assert(!model.alerts.some(x=>x.kind==='PCBA_MAINBOARD_REPAIR_RECURRENCE'));
});

test('separate timestamps allow prior and current 3012 comments to appear with their distinct source identities',()=>{
 const oldTime='2026-10-18T09:30:00-03:00',curTime='2026-10-20T09:30:00-03:00';
 const p=history(0,oldTime),n=history(1,curTime);
 const repairs=[{pcba_sn:pcba,defect_code:'CAM-01',defect_time:oldTime,repair_time:'2026-10-18T10:00:00-03:00',
 repair_user:'BRM001',repair_user_name:'Operador anterior',repair_comment:'Check flat cable',repair_code:'REPAIR'},
 {pcba_sn:pcba,defect_code:'CAM-01',defect_time:curTime,repair_time:'2026-10-20T10:00:00-03:00',
 repair_user:'BRM002',repair_user_name:'Operador atual',repair_comment:'New analysis',repair_code:'CHECK'}];
 const input=mk(n,p,repairs),model=buildLiveSnForensics(input),a=alertOf(model);
 assert(a);assert.equal(a.evidence.repairs.length,1);assert.equal(a.evidence.current_3012.length,1);
 const html=renderSmartSnAlerts(model,input);
 assert.match(html,/Check flat cable/);assert.match(html,/New analysis/);
 assert.match(html,/Operador anterior/);assert.match(html,/Operador atual/);
 assert.match(html,/análise atual candidata/);assert.doesNotMatch(html,/dois reparos comprovados/i);
});

test('three distinct unrelated historical failure records form medium alert, not a root-cause verdict',()=>{
 const current=history(4,'2026-10-20T09:30:00-03:00','CAM-01');
 const entries=[history(1,'2026-10-10T09:30:00-03:00','OTHER-1',{ 'Defect Description':'Charging unavailable'}),
 history(2,'2026-10-12T09:30:00-03:00','OTHER-2',{ 'Defect Description':'LCD leak'}),
 history(3,'2026-10-15T09:30:00-03:00','OTHER-3',{ 'Defect Description':'No audio speaker'})];
 const data={sn:pcba,detected_type:'PCBA',trace_2114:{status:'COMPLETE',current_failure:current,previous_failures:entries}};
 const model=buildLiveSnForensics(data);const alerts=buildSmartSnAlerts(model,data);
 const diverse=alerts.find(a=>a.id==='pcba-diverse-history');
 assert(diverse);assert.equal(diverse.severity,'medium');assert.equal(diverse.alerts[0].evidence.length,3);
 assert.match(renderSmartSnAlerts(model,data),/REVISAR/);
});