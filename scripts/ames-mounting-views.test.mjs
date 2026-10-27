import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSnMountingViews,mountingScopeDetails} from '../ames/console-sn-mounting-views.mjs';

const source=readFileSync(new URL('../ames/console-view.mjs',import.meta.url),'utf8');
const engine=readFileSync(new URL('../ames/agent/engine_bridge.py',import.meta.url),'utf8');

test('historical trace form remains visible for exact local revision enrichment',()=>{
  assert.doesNotMatch(source,/querySelectorAll\('\[data-trace-form\][^']*'\)/);
  assert.match(source,/Changing|historical 3028|Historical 3028/);
});

test('individual material queries reactivate the 3074 view after 2114/3022',()=>{
  assert.match(engine,/for idx, comp in enumerate\(components, start=1\):[\s\S]*?nav\.ensure_3074\(\)[\s\S]*?item_query = tela3074\.consultar\(item_sn\)/);
  assert.match(engine,/for comp in failure_components:[\s\S]*?nav\.ensure_3074\(\)/);
});

const sample={detected_type:'PCBA',trace_3074:{mounting_views:{
  current:{status:'current_new_cycle',component_usage:[{item_sn:'LCD-NEW',item_type:'LCD',is_reused:false,known_use_count:1,previous_pcbas:[]}],reused_components:[],reused_count:0,incomplete_count:0},
  last_failure:{status:'observed',defect_time:'2026-10-22 10:00:00',component_usage:[{item_sn:'LCD-OLD',item_type:'LCD',is_reused:true,known_use_count:3,previous_pcbas:['BOARD-A','BOARD-B']}],reused_components:[{item_sn:'LCD-OLD'}],reused_count:1,incomplete_count:0},
  comparison:{only_current:['LCD-NEW'],only_last_failure:['LCD-OLD'],in_both:[]},
}}};

test('comparison never sums current and last-failure reuse counts',()=>{
  const html=renderSnMountingViews(sample);
  assert.match(html,/Comparar ambas/);
  assert.match(html,/LCD-NEW/);
  assert.match(html,/LCD-OLD/);
  assert.match(html,/Reuso identificado na montagem da última falha/);
  assert.match(html,/0 materiais de 2º\+ uso comprovados/);
  assert.match(html,/1 materiais de 2º\+ uso comprovados/);
  assert.match(html,/BOARD-A, BOARD-B/);
  assert.doesNotMatch(renderSnMountingViews(sample,'pt-BR','current'),/LCD-OLD<\/strong>/);
  assert.doesNotMatch(renderSnMountingViews(sample,'pt-BR','failure'),/LCD-NEW<\/strong>/);
});

test('incomplete 3074 material lookup does not display zero as proven',()=>{
  const html=mountingScopeDetails({component_usage:[{item_sn:'LCD-OLD',is_reused:null,error:'input missing'}],reused_count:null});
  assert.match(html,/Reuso não totalmente verificado/);
  assert.match(html,/Zero não comprovado/);
  assert.doesNotMatch(html,/0 materiais de 2º\+ uso comprovados/);
});

test('material SN queries cannot borrow the PCBA mounting widget',()=>{
  assert.equal(renderSnMountingViews({...sample,detected_type:'MATERIAL_SN'}),'');
});
