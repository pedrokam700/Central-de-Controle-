import test from 'node:test';
import assert from 'node:assert/strict';
import {matchComponentToCurrentFailure,compatibleComponentReuseAlerts} from '../ames/data/component-failure-compatibility.mjs';
import {buildSmartSnAlerts,renderSmartSnAlerts} from '../ames/console-sn-smart-alerts.mjs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';
import {renderSnHistoryDetail} from '../ames/console-sn-history-detail.mjs';

test('GN06-X015 rear secondary camera matches the physical subtype, not front/main',()=>{
  const desc='Rear secondary camera no image';
  const good=matchComponentToCurrentFailure('Rear Camera Secondary','GN06-X015',desc);
  assert.equal(good.classification,'EXACT_COMPATIBLE');
  assert.match(good.version,/^2026/);
  assert.equal(matchComponentToCurrentFailure('Front Camera','GN06-X015',desc).classification,'UNKNOWN');
  assert.equal(matchComponentToCurrentFailure('Rear Camera Main','GN06-X015',desc).classification,'UNKNOWN');
  assert.equal(matchComponentToCurrentFailure('Camera','GN06-X015',desc).classification,'UNKNOWN');
  assert.equal(matchComponentToCurrentFailure('Rear Camera Secondary','GN06-X015','No defect rear secondary camera').classification,'UNKNOWN');
});

test('compatibility signal requires physical 3074 proof of reuse and current 2114 failure',()=>{
  const model={detected_type:'PCBA',current_pcba:'BOARD-NEW',
    current:{pcba_sn:'BOARD-NEW',defect_code:'GN06-X015',defect_desc:'Rear secondary camera no image',defect_time:'2026-10-22 10:00:00'},
    material_selection:{status:'selected_at_latest_2114_candidate',cycle_state:'last_failure_assembly'},
    materials:[{item_sn:'CAM-X',item_type:'Rear Camera Secondary',known_use_count:2,reuse_count:1,
      raw:{current_pcba_confirmed:true}},
      {item_sn:'CAM-FRONT',item_type:'Front Camera',known_use_count:3,raw:{current_pcba_confirmed:true}},
      {item_sn:'CAM-UNPROVEN',item_type:'Rear Camera Secondary',known_use_count:4,raw:{current_pcba_confirmed:false}}]};
  const alerts=compatibleComponentReuseAlerts(model);
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].kind,'COMPONENT_TYPE_COMPATIBLE');
  assert.equal(alerts[0].severity,'medium');
  assert.equal(alerts[0].root_cause_confirmed,false);
  assert.equal(alerts[0].item_sn,'CAM-X');
  const cards=buildSmartSnAlerts({...model,alerts},{});
  assert.equal(cards.length,1);
  assert.equal(cards[0].id,'component-compatible-failure');
  assert.match(renderSmartSnAlerts({...model,alerts},{}),/CAM-X/);
  assert.match(renderSmartSnAlerts({...model,alerts}, {}, 'en-US'),/compatible with the failure/);
  assert.equal(compatibleComponentReuseAlerts({...model,material_selection:{status:'current_mounting_new_cycle',cycle_state:'current_new_cycle'}}).length,0);
});

test('post-defect new assembly keeps latest 2114 as history, not current failure',()=>{
  const result={sn:'BOARD-X',detected_type:'PCBA',
    trace_2114:{current_failure:{pcba_sn:'BOARD-X','Defect Code':'GN06-X015',
      'Defect Description':'Rear secondary camera no image', 'Defect Time':'2026-10-22 10:00:00',
      'Defect Hist Seq':'5'},previous_failures:[]},
    trace_3074:{status:'complete',material_selection:{status:'current_mounting_new_cycle',cycle_state:'current_new_cycle'},
      query:{rows:[],no_data:true},component_usage:[]}};
  const model=buildLiveSnForensics(result);
  assert.equal(model.current,null);
  assert.equal(model.own_history.length,1);
  assert.equal(model.own_history[0].defect_code,'GN06-X015');
  assert.equal(model.alerts.length,0);
});

test('PCBA component card provides explicit Material SN drilldown with escaped identity',()=>{
  const html=renderSnHistoryDetail({current_pcba:'P1',own_history:[],materials:[{
    item_sn:'MAT-001',item_type:'Rear Camera Secondary',bindings:[],history:[],known_use_count:2
  }]},{},'pt-BR');
  assert.match(html,/data-sn-open-material="MAT-001"/);
  assert.match(html,/Investigar este Material SN na 3074/);
  const unsafe=renderSnHistoryDetail({current_pcba:'P1',own_history:[],materials:[{
    item_sn:'\"><script>alert(1)<\/script>',item_type:'Screen',bindings:[],history:[]
  }]},{},'en-US');
  assert.doesNotMatch(unsafe,/<script>/);
});

test('verified current Y material stays visible without a 2114 failure anchor',()=>{
  const model=buildLiveSnForensics({sn:'BOARD-X',detected_type:'PCBA',
    trace_3074:{status:'complete',query:{rows:[{'Barcode':'CAM-CURRENT','Sn Type':'Rear Camera','Iss Status':'Y'}]},
      material_selection:{status:'current_mounting_unanchored',cycle_state:'current_cycle_unanchored'},
      component_usage:[{item_sn:'CAM-CURRENT',item_type:'Rear Camera',current_pcba_confirmed:true,
        known_use_count:1,previous_pcbas:[],query:{rows:[],no_data:true}}]}});
  assert.equal(model.current,null);
  assert.equal(model.materials.length,1);
  assert.equal(model.materials[0].item_sn,'CAM-CURRENT');
  assert.equal(model.alerts.length,0);
});
