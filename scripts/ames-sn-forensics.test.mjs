import assert from 'node:assert/strict';
import {buildLiveSnForensics,buildLocalSnForensics,preferredAnalysisEvent} from '../ames/data/sn-forensics.mjs';

const live={
 sn:'PCBA-CURRENT',detected_type:'PCBA',
 trace_2114:{
  current_failure:{'Defect Code':'GN-CAM','Defect Description':'Camera scratched','Defect Time':'2026-10-14 09:10:00','Manual/Automatic':'Manual'},
  previous_failures:[{'Defect Code':'GN-OLD-PCBA','Defect Description':'Receiver noise','Defect Time':'2026-09-20 10:00:00','relation':'FALHA_DIFERENTE'}],
 },
 trace_3074:{reused_components:[{item_sn:'MAT-CAM-1',item_type:'前置摄像头',known_use_count:2,reuse_count:1,previous_pcbas:['PCBA-OLD'],relation_to_current_failure:'FALHA_DIFERENTE',previous_pcba_evidence:[{pcba_sn:'PCBA-OLD',relation:'FALHA_DIFERENTE',history:{'Defect Code':'GN-OLD-CAM','Defect Description':'Camera no function','Defect Time':'2026-08-11 08:03:00'}}]}]},
 trace_3012:{rows:[
  {row_key:'r0',pcba_sn:'PCBA-CURRENT',defect_code:'GN-CAM',defect_time:'2026-10-14 09:10:00',repair_user:'BRM00999',repair_time:'2026-10-14 09:40:00',repair_code:'SWAP',repair_comment:'camera scratched; replaced module'},
  {row_key:'r1',pcba_sn:'PCBA-OLD',defect_code:'GN-OLD-CAM',defect_time:'2026-08-11 08:03:00',repair_user:'BRM00068',repair_time:'2026-08-11 09:00:00',repair_code:'REPAIR',repair_comment:'old camera analysed'},
 ]},
 trace_3022:{operator_evidence:[
  {pcba_sn:'PCBA-CURRENT',station:'A6900',operation_name:'Export Repair',event_time:'2026-10-14 09:31:00',operator_id:'BRM00068',operator_name:'Irlane',source:'3022'},
  {pcba_sn:'PCBA-OLD',station:'A6900',operation_name:'Export Repair',event_time:'2026-08-11 08:55:00',operator_id:'BRM00111',operator_name:null,source:'3022'},
 ]},
};
const story=buildLiveSnForensics(live);
assert.equal(story.current.defect_desc,'Camera scratched');
assert.equal(story.current.repairs[0].repair_comment,'camera scratched; replaced module');
assert.equal(story.analysis_event.station,'A6900');
assert.equal(story.analysis_event.operator_name,'Irlane');
assert.equal(story.materials[0].history[0].pcba_sn,'PCBA-OLD');
assert.equal(story.materials[0].history[0].failure.defect_code,'GN-OLD-CAM');
assert.equal(story.materials[0].history[0].failure.defect_desc,'Camera no function');
assert.equal(story.materials[0].history[0].failure.repairs[0].repair_user,'BRM00068');
assert.equal(story.materials[0].history[0].failure.repairs[0].repair_comment,'old camera analysed');
assert.equal(story.materials[0].history[0].failure.analysis_event.operator_id,'BRM00111');
assert.equal(story.materials[0].history[0].failure.analysis_event.operator_name,null,'operator name must not be invented from ID');
assert.equal(preferredAnalysisEvent([{pcba_sn:'P',station:'A5200',operation_name:'Assembly',operator_id:'X'},{pcba_sn:'P',station:'A6900',operation_name:'Export Repair'}],'P').station,'A6900','A6900 / Export Repair must be preferred when present');
assert.equal(preferredAnalysisEvent([{station:'A6900',operation_name:'Export Repair',operator_id:'CURRENT'}],'PCBA-OLD'),null,'3022 evidence without explicit historical PCBA identity must not leak to another board');
assert.equal(preferredAnalysisEvent([{pcba_sn:'PCBA-CURRENT',station:'A6900',operation_name:'Export Repair',operator_id:'CURRENT'}],'PCBA-OLD'),null,'3022 evidence from the current PCBA must not be attached to an old PCBA');

const rawOnly=buildLiveSnForensics({
 sn:'PCBA-CURRENT',detected_type:'PCBA',
 trace_2114:{pcbas:[
  {pcba_sn:'PCBA-CURRENT',status:'COMPLETE',result:{rows:[
   {'Lot Id':'PCBA-CURRENT','Defect Hist Seq':'1','Defect Code':'GN-OLD','Defect Description':'Old receiver issue','Defect Time':'2026-10-10 10:00:00'},
   {'Lot Id':'PCBA-CURRENT','Defect Hist Seq':'2','Defect Code':'GN-NOW','Defect Description':'Current camera issue','Defect Time':'2026-10-14 10:00:00'},
  ]}},
  {pcba_sn:'PCBA-OLD',status:'COMPLETE',result:{rows:[
   {'Lot Id':'PCBA-OLD','Defect Hist Seq':'4','Defect Code':'GN-HIST','Defect Description':'Historical camera failure','Defect Time':'2026-09-01 08:00:00'},
  ]}},
 ]},
 trace_3074:{reused_components:[{item_sn:'MAT-1',item_type:'前置摄像头',previous_pcbas:['PCBA-OLD'],known_use_count:2,reuse_count:1,relation_to_current_failure:'FALHA_DIFERENTE',previous_pcba_evidence:[]}]},
});
assert.equal(rawOnly.current.defect_code,'GN-NOW','raw 2114 rows must recover the newest current PCBA failure when the preselected field is missing');
assert.equal(rawOnly.current.source,'2114-raw');
assert.equal(rawOnly.own_history[0].defect_code,'GN-OLD','older raw history must remain separated from the current occurrence');
assert.equal(rawOnly.materials[0].history[0].failure.defect_code,'GN-HIST','previous PCBA raw 2114 rows must fill a missing previous_pcba_evidence history');
assert.equal(rawOnly.materials[0].history[0].failure.source,'2114-raw');

const local={query_sn:'PCBA-CURRENT',detected_type:'PCBA',pcba_history:[{pcba_sn:'PCBA-CURRENT',defect_code:'GN-CAM',defect_desc:'Camera scratched',defect_time:'2026-10-14 09:10:00'},{pcba_sn:'PCBA-OLD',defect_code:'GN-OLD-CAM',defect_desc:'Camera no function',defect_time:'2026-08-11 08:03:00'}],material_reuse:[{current_pcba_sn:'PCBA-CURRENT',item_sn:'MAT-CAM-1',item_type:'前置摄像头',previous_pcbas_json:'["PCBA-OLD"]',previous_pcba_count:1,total_pcba_count_known_now:2}],repair_3012:[live.trace_3012.rows[1]],process_events:[live.trace_3022.operator_evidence[1]],coverage:{2114:true,3074:true,3012:true,3022:true}};
const offline=buildLocalSnForensics(local);
assert.equal(offline.materials[0].history[0].failure.defect_desc,'Camera no function');
assert.equal(offline.materials[0].history[0].failure.repairs[0].repair_comment,'old camera analysed');
assert.equal(offline.materials[0].history[0].failure.analysis_event.operator_id,'BRM00111');

console.log('PASS: SN story joins 3074 + 2114 + 3012 + 3022, recovers current/previous failures from raw 2114 rows, prefers A6900/Export Repair, never invents employee names, and rejects cross-PCBA process leakage.');


{
  // Factory observation: 2114 hist seq 0 and 1 share a code, but the
  // component assembly may have a NEW post-failure Y cycle. Do not erase the
  // proven recurrence of the BOARD or attribute it to that new LCD.
  const sn='SYNTHETIC-PCBA-2114';
  const rows=[0,1].map(seq=>({
    'Lot Id':sn,'Defect Hist Seq':seq,'Defect Code':'GN11-CN05',
    'Defect Description':'USB charging test failed',
    'Defect Type':seq===0?'Phone Disassembly':'MainBoard',
    'Repair Status':seq===0?'Y':'N',
  }));
  const fixture={
    sn,detected_type:'PCBA',trace_2114:{
      current_failure:rows[1],previous_failures:[rows[0]],rows,
      pcbas:[{pcba_sn:sn,status:'COMPLETE',result:{rows}}],
    },
    trace_3074:{
      material_selection:{cycle_state:'current_new_cycle',status:'current_mounting_new_cycle'},
      query:{rows:[],no_data:false},reused_components:[],
    },
  };
  const model=buildLiveSnForensics(fixture);
  assert.equal(model.current,null,'new Y parts are not assigned old failure');
  assert.equal(model.board_failure_reference.hist_seq,1);
  assert(model.alerts.some(a=>a.kind==='PCBA_SAME_FAILURE'&&a.board_reference_is_historical),
         'two same-code 2114 occurrences must still alert for the board');
  assert(!model.alerts.some(a=>a.kind.startsWith('COMPONENT_')),
         'no component recurrence may be invented without proof');
}
