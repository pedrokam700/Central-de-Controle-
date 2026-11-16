// Synthetic events only. Repeated fault codes never identify a repair/visit.
export function reuseTimelineFixture(){
 const scope={source_id:'SYNTH-SOURCE',snapshot_id:'11',snapshot_revision:16,line_id:'TAN10101'};
 const pcba_sn='SYNTH-PCBA-A';
 const history=[
  {...scope,pcba_sn,source_view:'2114',record_id:'H0',hist_seq:0,defect_code:'D1',defect_desc:'Repeated fault',defect_time:'2026-11-10 08:00:00',defect_type:'MainBoard',repair_status:'Y',defect_user:'SYNTH-F0',defect_user_name:'Autor histórico zero'},
  {...scope,pcba_sn,source_view:'2114',record_id:'H1',hist_seq:1,defect_code:'D1',defect_desc:'Repeated fault',defect_time:'2026-11-11 08:00:00',defect_type:'Phone Disassembly',repair_status:'N',defect_user:'SYNTH-F1',defect_user_name:'Autor histórico um'},
  {...scope,pcba_sn,source_view:'2114',record_id:'H2',hist_seq:2,defect_code:'D2',defect_desc:'Undated fault',defect_time:null,defect_type:'Phone Battery Cover',repair_status:'Y'}];
 const events=[
  {...scope,pcba_sn,source_view:'3028',record_id:'C0',defect_key:'K0',defect_code:'D1',defect_desc:'Current fault one',defect_time:'2026-11-15 10:00:00'},
  {...scope,pcba_sn,source_view:'3028',record_id:'C1',defect_key:'K1',defect_code:'D1',defect_desc:'Current fault two',defect_time:'2026-11-16 10:00:00'}];
 const repairs=[
  {...scope,pcba_sn,source_view:'3012',row_key:'R0',defect_code:'D1',defect_desc:'Repeated fault',defect_time:'2026-11-10 08:05:00',repair_time:'2026-11-10 09:00:00',repair_user:'SYNTH-R0',repair_user_name:'Reparadora Alfa',repair_comment:'Comentário completo Alfa\nSegunda linha Alfa'},
  {...scope,pcba_sn,source_view:'3012',row_key:'R1',defect_code:'OTHER',defect_desc:'Independent repair',defect_time:'2026-11-12 08:05:00',repair_time:'2026-11-12 09:00:00',repair_user:'SYNTH-R1',repair_user_name:'Reparador Beta',repair_comment:'Comentário independente Beta <seguro>'}];
 const operators=[{...scope,pcba_sn,source_view:'3022',event_id:'O0',hist_seq:20,station:'A6900',event_time:'2026-11-10 08:30:00',operator_id:'SYNTH-O0',operator_name:'Operadora Gama',operator_role:'observed_process_operator'}];
 const board={sn:pcba_sn,history_2114:history,events};
 const snapshot={...scope,revision:16,occurrences:events,pcba_history:{records:history},
  material_trace:{records:[{...scope,record_id:'B0',current_pcba_sn:pcba_sn,item_sn:'SYNTH-MATERIAL',item_type:'Screen',current_defect_key:'K0',defect_code:'D1',defect_time:events[0].defect_time,
    previous_pcbas_json:'["SYNTH-PCBA-OLD"]',usage_status:'Y',bind_time_utc:'2026-11-09T10:00:00Z'}]},
  process_timeline:{events:operators},insights:{ready:true,drilldowns:{}}};
 return {scope,board,snapshot,repairs,operators};
}
