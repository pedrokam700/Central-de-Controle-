import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';
import {renderSmartSnAlerts} from '../ames/console-sn-smart-alerts.mjs';

const board='00252700612635F300020827';
const at=['2026-10-21T09:00:00-03:00','2026-10-21T11:00:00-03:00','2026-10-21T17:00:00-03:00'];
const item=(seq)=>({pcba_sn:board,'Defect Hist Seq':seq,'Defect Code':'GN01-TX01',
  'Defect Description':'Antenna: ANT0 test failed','Defect Time':at[seq],
  'Defect Type':seq===0?'Phone Disassembly':'MainBoard','Repair Status':seq===2?'N':'Y'});
const repair=(id,comment,time,key)=>({pcba_sn:board,defect_code:'GN01-TX01',
  defect_time:at[0],repair_time:time,repair_user:id,repair_comment:comment,row_key:key});
function evidence(){
 const rows=[0,1,2].map(item);
 return {sn:board,detected_type:'PCBA',
  trace_2114:{status:'COMPLETE',pcbas:[{pcba_sn:board,status:'COMPLETE',result:{rows}}],
    current_failure:rows[2],previous_failures:rows.slice(0,2)},
  trace_3012:{status:'COMPLETE',rows:[
    repair('BRM00095','Reencaixar periféricos','2026-10-21T09:30:00-03:00','AT-1'),
    repair('BRM00061','RF mal posicionado','2026-10-21T11:30:00-03:00','AT-2'),
    repair('BRM00061','analise','2026-10-21T17:15:00-03:00','AT-3')
  ]},
  trace_3022:{status:'COMPLETE',process_passages:[
    {pcba_sn:board,operation_name:'Assembly frame',station:'A5150',event_time:'2026-10-21T08:45:00-03:00'}],
    operator_evidence:[{pcba_sn:board,'Tran User ID':'BRM00061','Tran User':'Luis Augusto'},
      {pcba_sn:board,'Tran User ID':'BRM00095','Tran User':'Alcilane Belarmino'}]},
  local_snapshot:{process_contexts:[{
    pcba_sn:board,defect_code:'GN01-TX01',defect_time:at[2],
    production_shift_source:'3022',production_shift_basis:'reference_process',
    reference_station_code:'A5150',reference_event_time:'2026-10-21T16:30:00-03:00',
    production_shift:'1º turno'
  }]}
 };
}

test('three real 2114 history sequences become exactly three distinct white proof cards',()=>{
 const result=evidence(),model=buildLiveSnForensics(result),html=renderSmartSnAlerts(model,result);
 assert.equal(model.own_history.length,2);
 assert.match(html,/Ver evidências \(2\)/);
 assert.equal((html.match(/data-sn-alert-2114-evidence/g)||[]).length,1);
 assert.equal((html.match(/class="ames-sn-smart-proof"/g)||[]).length,3,
  'one current and two prior white cards, not repeated per alert');
 for(const seq of [0,1,2])assert.equal((html.match(new RegExp('Hist Seq '+seq+'\\b','g'))||[]).length,1);
 assert.match(html,/Phone Disassembly/);
 assert.match(html,/MainBoard/);
 assert.match(html,/data-sn-alert-production/);
 assert.match(html,/Assembly frame|Passagem em montagem/);
 assert.match(html,/Horário da referência|Referência produtiva comprovada/);
 assert.doesNotMatch(html,/3012 · registro candidato, sem ciclo comprovado.*3012 · registro candidato, sem ciclo comprovado.*3012 · registro candidato/s);
});

test('distinct 3012 rows appear once each above evidence expander, without invented assignment',()=>{
 const result=evidence(),model=buildLiveSnForensics(result),html=renderSmartSnAlerts(model,result);
 const before=html.split('<details style="margin-top:8px">')[0],after=html.split('<details style="margin-top:8px">')[1];
 for(const msg of ['Reencaixar periféricos','RF mal posicionado','analise']){
   assert.equal((before.split(msg).length-1),1,'one compact white 3012 row per physical comment');
   assert.equal((after.split(msg).length-1),0,'3012 already visible; do not repeat in expanded proof');
 }
 assert.match(before,/Alcilane Belarmino/);
 assert.match(before,/Luis Augusto/);
 assert.match(before,/não são atribuídos individualmente/);
 assert.equal((before.match(/data-sn-alert-repair-row/g)||[]).length,3);
});

test('unproven montage remains unknown, no guess from arbitrary timestamps or other PCBA',()=>{
 const result=evidence();
 result.trace_3022.process_passages=[{pcba_sn:'OTHER',operation_name:'Assembly',station:'A5150',event_time:'2026-10-21T08:00:00-03:00'}];
 result.local_snapshot.process_contexts=[];
 const model=buildLiveSnForensics(result),html=renderSmartSnAlerts(model,result);
 assert.match(html,/Horário de montagem não comprovado/);
 assert.doesNotMatch(html,/08:00:00/);
});

test('2114 operational table omits technical code and never invents an assigned technician',()=>{
 const page=fs.readFileSync(new URL('../ames/console-specialized-views.mjs',import.meta.url),'utf8');
 assert.match(page,/Tipo de análise 2114/);
 assert.match(page,/Nomes dos ATs aparecem|nomes dos ATs aparecem/);
 assert.match(page,/sem atribuição a um Hist Seq/);
 assert.doesNotMatch(page,/rowsTable\(previous,\[\['Defect Code','Defect Code'\]/);
 const css=fs.readFileSync(new URL('../ames/console-operator-parity.css',import.meta.url),'utf8');
 assert.match(css,/ames-sn-alert-evidence-grid/);
 assert.match(css,/High-priority SN alert/);
});

test('fourth distinct 3012 row stays available in nested detail without hijacking 2114 expander',()=>{
 const result=evidence();
 result.trace_3012.rows.push(repair('BRM00061','Fourth unique technician note',
   '2026-10-21T17:25:00-03:00','AT-4'));
 const model=buildLiveSnForensics(result),html=renderSmartSnAlerts(model,result);
 assert.match(html,/ames-sn-alert-extra-repairs/);
 assert.equal((html.match(/data-sn-alert-repair-row/g)||[]).length,4);
 assert.match(html,/Fourth unique technician note/);
 const code=fs.readFileSync(new URL('../ames/console-sn-smart-alerts.mjs',import.meta.url),'utf8');
 assert.match(code,/querySelector\(':scope > details'\)/);
 assert.match(code,/key\+':extra'/);
});
