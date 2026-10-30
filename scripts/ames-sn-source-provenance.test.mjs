import test from 'node:test';
import assert from 'node:assert/strict';
import {SN_SOURCE_ORDER,snLiveSourceProvenance,renderSnLiveSourceProvenance} from '../ames/console-sn-source-provenance.mjs';
import {buildLiveSnForensics} from '../ames/data/sn-forensics.mjs';
import {operatorSummary,provenPcbaReuseCount} from '../ames/console-fastlane-sn-reuse.mjs';
import fs from 'node:fs';

const lookup=()=>({
  sn:'PCBA-A',detected_type:'PCBA',
  local_snapshot:{snapshot_id:'cached-41',collected_at:'2026-10-16T10:00:00-03:00'},
  trace_2114:{status:'complete',previous_failures:[],current_failure:{pcba_sn:'PCBA-A',defect_code:'F1',defect_time:'2026-10-17 10:30:00'},
    source_id:'mes-view-2114',snapshot_id:'snap-2114',snapshot_revision:3,collected_at:'2026-10-17T10:32:00-03:00',
    period:{start_at:'2026-10-17T07:30:00-03:00',end_at:'2026-10-17T10:30:00-03:00'}},
  trace_3074:{status:'error',error:'MES unavailable',reused_components:[]},
  trace_3022:{status:'partial',process_passages:[{pcba_sn:'PCBA-A',station:'A5100',event_time:'2026-10-17T10:00:00-03:00'}]},
  trace_3012:{status:'unavailable'},
});

test('SN provenance keeps independent states and never invents PC/line or collection timestamp',()=>{
  const result=lookup(),model=buildLiveSnForensics(result),rows=snLiveSourceProvenance(result,model);
  assert.deepEqual(rows.map(r=>r.view),SN_SOURCE_ORDER);
  assert.equal(rows.find(r=>r.view==='2114').source_id,'mes-view-2114');
  assert.equal(rows.find(r=>r.view==='2114').snapshot_revision,3);
  assert.equal(rows.find(r=>r.view==='2114').collected_at,'2026-10-17T10:32:00-03:00');
  assert.equal(rows.find(r=>r.view==='2114').period_start,'2026-10-17T07:30:00-03:00');
  assert.equal(rows.find(r=>r.view==='2114').workstation_id,null);
  assert.equal(rows.find(r=>r.view==='3074').state,'error');
  assert.equal(rows.find(r=>r.view==='3074').observed_count,null,'error cannot be displayed as observed zero');
  assert.equal(rows.find(r=>r.view==='3022').state,'partial');
  assert.equal(rows.find(r=>r.view==='3012').state,'unavailable');
  assert.equal(rows.find(r=>r.view==='3028').state,'cached');
  assert.equal(rows.find(r=>r.view==='3022').collected_at,null,'event time is not automatically collection time');
  assert.equal(rows.find(r=>r.view==='3022').period_start,null);
});

test('missing traces are explicitly not collected; only declared workstation and period appear',()=>{
  const result={sn:'PCBA-A'};
  const rows=snLiveSourceProvenance(result,buildLiveSnForensics(result));
  assert.ok(rows.every(row=>row.state==='not_collected'));
  assert.ok(rows.every(row=>row.collected_at===null&&row.workstation_id===null&&row.period_start===null));
  const one={sn:'PCBA-A',trace_2114:{status:'complete',workstation_id:'FACTORY-01',collected_at:'',period:{}}};
  const rows2=snLiveSourceProvenance(one,buildLiveSnForensics(one));
  assert.equal(rows2.find(row=>row.view==='2114').workstation_id,'FACTORY-01');
  assert.equal(rows2.find(row=>row.view==='2114').period_start,null);
});

test('failed 3074 live query does not erase 2114 evidence or report zero materials',()=>{
  const result=lookup();
  result.trace_3074={status:'error',error:'3074_TIMEOUT',query:null,query_row_count:null,
    query_no_data_confirmed:false,material_selection:{status:'not_collected'},components:[],reused_components:[]};
  const model=buildLiveSnForensics(result);
  assert.equal(model.source_states['3074'],'error');
  assert.equal(model.source_states['2114'],'ok');
  assert.equal(model.source_states['3022'],'partial');
  assert.equal(model.current.defect_code,'F1');
  assert.deepEqual(model.materials,[]);
  assert.equal(model.coverage['3074'],false);
  assert.equal(model.coverage['2114'],true);
  const provenance=snLiveSourceProvenance(result,model);
  assert.equal(provenance.find(r=>r.view==='3074').state,'error');
  assert.equal(provenance.find(r=>r.view==='3074').observed_count,null);
});

test('3074 zero requires direct query proof; legacy empty arrays are incomplete',()=>{
  const old=lookup();
  old.trace_3074={status:'complete',reused_components:[],component_usage:[]};
  assert.equal(buildLiveSnForensics(old).source_states['3074'],'partial');
  const proven=lookup();
  proven.trace_3074={status:'complete',query:{rows:[],no_data:true},reused_components:[],component_usage:[]};
  const model=buildLiveSnForensics(proven);
  assert.equal(model.source_states['3074'],'zero');
  assert.equal(snLiveSourceProvenance(proven,model).find(r=>r.view==='3074').observed_count,0);
  const hasRows=lookup();
  hasRows.trace_3074={status:'complete',query:{rows:[{'Barcode':'CAM-USED'}],no_data:false},
    reused_components:[{item_sn:'CAM-USED',previous_pcbas:['PCBA-OLD']}]};
  assert.equal(buildLiveSnForensics(hasRows).source_states['3074'],'ok');
});

test('bilingual live SN details escape MES values and remain collapsed until requested',()=>{
  const result=lookup();result.trace_2114.source_id='<img src=x onerror=alert(1)>';
  const model=buildLiveSnForensics(result);
  const pt=renderSnLiveSourceProvenance(result,model,'pt-BR');
  assert.match(pt,/<details data-sn-live-provenance/);
  assert.match(pt,/Proveniência das fontes · consulta ao vivo/);
  assert.match(pt,/Período MES comprovado/);
  assert.match(pt,/Cache local/);
  assert.doesNotMatch(pt,/<img src=x/);
  assert.match(pt,/&lt;img src=x onerror=alert\(1\)&gt;/);
  const en=renderSnLiveSourceProvenance(result,model,'en-US');
  assert.match(en,/Source provenance · live lookup/);
  assert.match(en,/Proven MES period/);
  assert.match(en,/Local cache/);
  assert.doesNotMatch(en,/Proveniência das fontes/);
});

test('live SN UI adds the source details without invoking a new MES request',()=>{
  const source=fs.readFileSync(new URL('../ames/console-sn-offline-fastlane.mjs',import.meta.url),'utf8');
  assert.match(source,/renderSnLiveSourceProvenance\(result,model,locale\(\)\)/);
  assert.match(source,/section\.after\(panel\.firstElementChild\)/);
  assert.match(source,/renderLiveSources\(root,store\)/);
  const summary=fs.readFileSync(new URL('../ames/console-fastlane-sn-reuse.mjs',import.meta.url),'utf8');
  const specialized=fs.readFileSync(new URL('../ames/console-specialized-views.mjs',import.meta.url),'utf8');
  assert.match(summary,/provenPcbaReuseCount\(result,model\.source_states\['3074'\]\)/);
  assert.match(summary,/countVisible\?model\.materials\.length:'—'/);
  assert.match(specialized,/queryConfirmed3074/);
  assert.match(specialized,/fullyCollected3074/);
});

test('SN operator summary never presents missing or failed 3074/3022/3012 as confirmed zero',()=>{
  const original=globalThis.document;
  globalThis.document={documentElement:{lang:'pt-BR'}};
  const base={sn:'PCB-QUERY',detected_type:'PCBA',trace_2114:{status:'complete',current_failure:null,previous_failures:[]}};
  const cards=result=>operatorSummary(result,result.trace_3012?.rows||[]);
  const metric=(html,label)=>html.match(new RegExp(`aria-label="${label}"[^>]*><small>[^<]*<\\/small><b>([^<]+)<\\/b>`))?.[1];
  try{
    const missing=cards(base);
    assert.match(missing,/3074 não coletada: não é possível concluir sobre reuso/);
    assert.equal(metric(missing,'Materiais 2º\\+ uso'),'—');
    assert.equal(metric(missing,'Eventos 3022'),'—');
    assert.equal(metric(missing,'Reparos 3012'),'—');
    const failed=cards({...base,trace_3074:{status:'error',error:'timeout',reused_components:[]},
      trace_3022:{status:'error',process_passages:[]},trace_3012:{status:'error',rows:[]}});
    assert.match(failed,/A consulta 3074 falhou; reuso desconhecido/);
    assert.doesNotMatch(failed,/Nenhum material 2º\+ uso confirmado nesta resposta/);
    assert.equal(metric(failed,'Materiais 2º\\+ uso'),'—');
    assert.equal(metric(failed,'Eventos 3022'),'—');
    assert.equal(metric(failed,'Reparos 3012'),'—');
    const failed2114=cards({...base,trace_2114:{status:'error',previous_failures:[]}});
    assert.equal(metric(failed2114,'Falha atual'),'—');
    assert.equal(metric(failed2114,'Falhas antigas PCBA'),'—');
    assert.equal(metric(failed2114,'Histórias 2114'),'—');
    const mixed=cards({...base,trace_3022:{status:'partial',process_passages:[],rows:[{pcba_sn:'PCB-QUERY',station:'A5100'}]}});
    assert.equal(metric(mixed,'Eventos 3022'),'1','non-empty 3022 rows are not hidden behind an empty passage placeholder');
    const noRows=cards({...base,trace_2114:{status:'complete'},trace_3022:{status:'complete'},summary:{'3022_events':0}});
    assert.equal(metric(noRows,'Falha atual'),'—','completed response without 2114 rows cannot prove absence of a failure');
    assert.equal(metric(noRows,'Eventos 3022'),'—','summary zero alone cannot prove an empty 3022 extraction');
    const embedded=cards({...base,trace_2114:{status:'complete',previous_failures:[],
      current_failure:{pcba_sn:'PCB-QUERY',defect_code:'TEST',defect_time:'2026-10-22 09:00:00',repair_evidence_3012:[{repair_comment:'observed nested'}]}}});
    assert.equal(metric(embedded,'Reparos 3012'),'—','nested 3012 evidence is not a proven zero top-level 3012 count');
    const complete=cards({...base,trace_3074:{status:'complete',query:{rows:[],no_data:true},reused_components:[]},
      trace_3022:{status:'complete',process_passages:[]},trace_3012:{status:'complete',rows:[]}});
    assert.match(complete,/Nenhum material 2º\+ uso observado nesta consulta 3074 confirmada; não é zero global/);
    assert.equal(metric(complete,'Materiais 2º\\+ uso'),'0');
    assert.equal(metric(complete,'Eventos 3022'),'0');
    assert.equal(metric(complete,'Reparos 3012'),'0');
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('3074 complete does not imply a PCBA reuse zero when target or component investigations are unproven',()=>{
  const old=globalThis.document;
  globalThis.document={documentElement:{lang:'pt-BR'}};
  const base={sn:'QUERY',detected_type:'PCBA',trace_2114:{status:'complete',current_failure:null,previous_failures:[]}};
  const cards=data=>operatorSummary(data,[]);
  const metric=html=>html.match(/aria-label="Materiais 2º\+ uso"[^>]*><small>[^<]*<\/small><b>([^<]+)<\/b>/)?.[1];
  const grid={status:'complete',query:{rows:[{Barcode:'CAM-1', 'Sn Type':'Rear Camera'}],no_data:false},
    material_selection:{status:'current_mounting_new_cycle'},components:[{item_sn:'CAM-1'}],component_usage:[{item_sn:'CAM-1',is_reused:null}],reused_components:[]};
  try{
    assert.equal(provenPcbaReuseCount({...base,trace_3074:grid},'ok'),false);
    assert.equal(metric(cards({...base,trace_3074:grid})),'—','complete 3074 grid is not complete component reuse');
    const proven={...grid,component_usage:[{item_sn:'CAM-1',is_reused:false}]};
    assert.equal(provenPcbaReuseCount({...base,trace_3074:proven},'ok'),true);
    assert.equal(metric(cards({...base,trace_3074:proven})),'0','zero only after each selected material has a proven non-reuse result');
    const unknown=cards({...base,detected_type:'SN_INDETERMINADO',trace_3074:proven});
    assert.equal(metric(unknown),'—');
    assert.match(unknown,/Tipo de SN indeterminado/);
    const material=cards({...base,detected_type:'MATERIAL_SN',trace_3074:{...proven,
      query:{rows:[{Barcode:'PCBA-OLD', 'Sn Type':'PCBA'}],no_data:false}}});
    assert.equal(metric(material),'—');
    assert.match(material,/Esta é uma consulta de Material SN/);
    const failedMaterial={...grid,component_usage:[{item_sn:'CAM-1',is_reused:null,error:'3074_TIMEOUT'}]};
    assert.equal(metric(cards({...base,trace_3074:failedMaterial})),'—');
    const positive={...grid,reused_components:[{item_sn:'CAM-1',previous_pcbas:['PCBA-OLD']}]};
    assert.equal(metric(cards({...base,trace_3074:positive})),'1','one observed reuse stays visible even if others lack proof');
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
