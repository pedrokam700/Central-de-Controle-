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

test('N-only 3074 history remains inspectable without claiming current mounting or last-failure reuse',()=>{
  const data=structuredClone(sample);
  const scope=data.trace_3074.mounting_views;
  scope.current={status:'not_proven',component_usage:[],reused_components:[],reused_count:null};
  scope.last_failure={status:'no_2114_anchor',component_usage:[],reused_components:[],reused_count:null};
  scope.history_audit=[{item_sn:'LCD-N-HIST',item_type:'LCD',iss_status_now:'N',bind_time_utc:'2026-10-20T12:00:00Z',unbind_time_utc:'2026-10-26T12:00:00Z',binding_operation:'A5150'}];
  const html=renderSnMountingViews(data);
  assert.match(html,/data-sn-3074-history-audit/);
  assert.match(html,/LCD-N-HIST/);
  assert.match(html,/vínculo N atual não prova/);
  assert.match(html,/montagem histórica indeterminada/);
  assert.doesNotMatch(html,/Reuso identificado na montagem da última falha/);
  assert.doesNotMatch(html,/0 materiais de 2º\+ uso comprovados/);
});

test('historical audit must coexist with the preexisting smart alert renderer',()=>{
  const live=readFileSync(new URL('../ames/console-sn-live-context.mjs',import.meta.url),'utf8');
  assert.match(live,/renderSnMountingViews\(result,lang\(\),mountingMode\)/);
  assert.match(live,/decorateSmartSnAlerts\(root,evidence.model,result\)/);
  assert.match(live,/decorateSnHistoryDetail\(root,evidence.model,result\)/);
});

test('real 3074 response exposes raw row count without pretending reuse is verified',()=>{
  const data=structuredClone(sample);
  data.trace_3074.query={rows:[
    {'Barcode':'LCD-OLD','Sn Type':'LCD','Iss Status':'N'},
    {'Barcode':'LCD-PRESENT','Sn Type':'LCD','Iss Status':'Y'},
    {'Barcode':'LCD-UNKNOWN','Sn Type':'LCD'}
  ],no_data:false};
  const html=renderSnMountingViews(data);
  assert.match(html,/data-sn-3074-coverage/);
  assert.match(html,/3074 retornou/);
  assert.match(html,/3 linhas/);
  assert.match(html,/Y: 1/);
  assert.match(html,/N: 1/);
  assert.match(html,/sem status/);
});
test('unanchored 3074 N material remains actionable only as individual investigation',()=>{
  const data=structuredClone(sample);
  data.trace_3074.query={rows:[{'Barcode':'LCD-PAST','Sn Type':'LCD','Iss Status':'N'}]};
  data.trace_3074.mounting_views={
    current:{status:'not_proven',component_usage:[],candidates:[
      {item_sn:'LCD-UNCERTAIN',item_type:'LCD',iss_status_now:'Y',temporal_reason:'time_unknown'}],reused_count:null},
    last_failure:{status:'no_2114_anchor',component_usage:[],candidates:[],reused_count:null},
    history_audit:[{item_sn:'LCD-PAST',item_type:'LCD',iss_status_now:'N',
      bind_time_utc:'2026-10-21T12:00:00Z',unbind_time_utc:'2026-10-22T12:00:00Z'}],
    comparison:{only_current:[],only_last_failure:[],in_both:[]}
  };
  for(const mode of ['compare','current','failure']){
    const html=renderSnMountingViews(data,'pt-BR',mode);
    assert.match(html,/3074 retornou/);
    assert.match(html,/data-sn-3074-history-audit/);
    assert.match(html,/LCD-PAST/);
    assert.match(html,/LCD-UNCERTAIN/);
    assert.match(html,/data-sn-open-material="LCD-PAST"/);
    assert.match(html,/data-sn-open-material="LCD-UNCERTAIN"/);
    assert.match(html,/Última falha 2114 sem horário comprovado/);
    assert.doesNotMatch(html,/Reuso identificado na montagem da última falha/);
    assert.doesNotMatch(html,/0 materiais de 2º\+ uso comprovados/);
  }
  const source=readFileSync(new URL('../ames/console-sn-live-context.mjs',import.meta.url),'utf8');
  assert.match(source,/\[data-sn-open-pcba\],\[data-sn-open-material\]/);
  assert.match(source,/\[data-sn-run\]/);
});
test('explicit confirmed empty 3074 is not conflated with unavailable data',()=>{
  const data=structuredClone(sample);
  data.trace_3074.query={rows:[],no_data:true};
  assert.match(renderSnMountingViews(data),/3074 confirmou grade vazia/);
  data.trace_3074.query={rows:[],no_data:false};
  assert.match(renderSnMountingViews(data),/3074 não comprovou linhas utilizáveis/);
});
