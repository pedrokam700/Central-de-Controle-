import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
 assert.match(html,/Vínculo 2114/);
 assert.match(html,/Tipos de análise diferentes na 2114/);assert.match(html,/não identifica reparo executado/);
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
 assert.match(html,/não atribuído à sequência 2114/);assert.match(html,/BRM008/);
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
 assert.match(html,/registro atual candidato/);assert.doesNotMatch(html,/dois reparos comprovados/i);
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
 assert.match(renderSmartSnAlerts(model,data),/PRIORIDADE MÉDIA/);
});
test('explicit current without Hist Seq may inherit only the exactly matching latest raw 2114 sequence',()=>{
 const older=history(0,clock),recent=history(1,clock);
 const data=mk(recent,older);
 data.trace_2114.current_failure={...recent,'Defect Hist Seq':null};
 const m=buildLiveSnForensics(data);
 assert.equal(m.current.hist_seq,1);assert.equal(m.own_history.length,1);
 assert.equal(alertOf(m).order_basis,'hist_seq_same_clock');
 data.trace_2114.current_failure['Defect Code']='DIFFERENT-CODE';
 const unsafe=buildLiveSnForensics(data);
 assert.equal(unsafe.current.hist_seq,null,'do not guess sequence from a mismatched raw row');
 assert.equal(alertOf(unsafe),undefined);
});

test('2114 raw rows without PCBA inherit the verified container, not a different board',()=>{
 const old={...history(0,clock)},current={...history(1,clock)};
 delete old.pcba_sn;delete current.pcba_sn;
 const data=mk(current,old);
 const model=buildLiveSnForensics(data);
 assert.equal(model.current.pcba_sn,pcba);
 assert.equal(model.own_history.length,1);
 assert(alertOf(model),'both scoped rows are from same proven PCBA container');
 data.trace_2114.pcbas[0].result.rows[0].pcba_sn='OTHER-BOARD';
 const safe=buildLiveSnForensics(data);
 assert.equal(safe.own_history.length,0,'explicit cross-board row must be ignored');
});

test('three distinct 2114 sequences at one minute keep two separate prior alerts without duplicated repair',()=>{
 const a=history(0,clock),b=history(1,clock),current=history(2,clock);
 const input=mk(current,a);
 input.trace_2114.pcbas[0].result.rows=[a,b,current];
 const model=buildLiveSnForensics(input);
 const alerts=model.alerts.filter(x=>x.kind==='PCBA_SAME_FAILURE');
 assert.equal(model.own_history.length,2);
 assert.equal(alerts.length,2,'each proven Defect Hist Seq is a distinct recurrence');
 assert.deepEqual(alerts.map(x=>x.prior_hist_seq).sort(),[0,1]);
 const html=renderSmartSnAlerts(model,input);
 assert.match(html,/Ver evidências \(2\)/);
 assert(!model.alerts.some(x=>x.kind==='PCBA_MAINBOARD_REPAIR_RECURRENCE'));
});

test('two distinct 3012 comments on one PCBA appear in the ONE organized alert with 3022 Tran User human name',()=>{
 const repairs=[
   {pcba_sn:pcba,defect_code:'CAM-01',defect_time:clock,repair_time:'2026-10-20T10:00:00-03:00',
    repair_user:'BRM00061',repair_comment:'First AT checked antenna connector',row_key:'ROW-1'},
   {pcba_sn:pcba,defect_code:'CAM-01',defect_time:clock,repair_time:'2026-10-20T11:00:00-03:00',
    repair_user:'BRM00061',repair_comment:'Second AT replaced antenna assembly',row_key:'ROW-2'},
 ];
 const input=mk(history(1,clock),history(0,clock),repairs);
 input.trace_3022={rows:[{pcba_sn:pcba,'Tran User ID':'BRM00061','Tran User':'Technician From MES'}]};
 const model=buildLiveSnForensics(input),html=renderSmartSnAlerts(model,input);
 assert.match(html,/Hist Seq 0/);assert.match(html,/Hist Seq 1/);
 assert.match(html,/Phone Disassembly/);assert.match(html,/MainBoard/);
 assert.match(html,/First AT checked antenna connector/);
 assert.match(html,/Second AT replaced antenna assembly/);
 assert.match(html,/Technician From MES/);
 assert.equal((html.match(/3012 · não atribuído à sequência 2114/g)||[]).length,2);
 assert.doesNotMatch(html,/dois reparos comprovados/i);
});
test('one live SN alert surface is rendered, not legacy duplicated correlation card',()=>{
 const source=fs.readFileSync('ames/console-fastlane-sn-reuse.mjs','utf8');
 assert(!source.includes('${renderSnCorrelationAlerts(model,'));
});
