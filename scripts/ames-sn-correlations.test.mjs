import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSnForensics,buildLocalSnForensics} from '../ames/data/sn-forensics.mjs';

const stamp=(day,hour=10)=>`2026-10-${day}T${String(hour).padStart(2,'0')}:00:00-03:00`;
const failure=(day,code='LCM-1',pcba='P')=>({pcba_sn:pcba,defect_code:code,defect_desc:'LCM image failure',defect_time:stamp(day),failure_family:'DISPLAY_LCD'});
const repair=(f,day,hour=11,extra={})=>({...f,repair_time:stamp(day,hour),repair_code:'REPAIR',repair_desc:'MainBoard repair',repair_user:'TECH-1',repair_comment:'Placa reparada e retestada',...extra});
const fixture=()=>{
 const old=failure(12),current=failure(15);
 return {sn:'P',detected_type:'PCBA',trace_2114:{status:'ok',current_failure:current,previous_failures:[old]},trace_3012:{status:'ok',rows:[repair(old,12)]}};
};
const kinds=m=>m.alerts.map(a=>a.kind);
const board=m=>m.alerts.find(a=>['PCBA_REPEATED_MAINBOARD_REPAIR','PCBA_MAINBOARD_REPAIR_HISTORY'].includes(a.kind));

test('future repair never becomes evidence of an earlier failure or MainBoard recurrence',()=>{
 const input=fixture();input.trace_3012.rows[0].repair_time=stamp(20);
 const model=buildLiveSnForensics(input);
 assert.deepEqual(kinds(model),['PCBA_SAME_FAILURE']);
 assert.deepEqual(model.alerts[0].evidence.repairs,[]);
 assert.equal(model.alerts[0].technician_comment,null);
 assert.equal(model.repairs.length,1,'keep future observation in source history');
});

test('unknown, date-only, equal and future failure times do not establish prior recurrence',()=>{
 for(const time of [null,'2026-10-12','bad',stamp(15),stamp(16)]){
  const input=fixture();input.trace_2114.previous_failures[0].defect_time=time;
  assert.deepEqual(buildLiveSnForensics(input).alerts,[],String(time));
 }
 const input=fixture();input.trace_2114.current_failure.defect_time=null;
 assert.deepEqual(buildLiveSnForensics(input).alerts,[]);
});

test('same-PCBA candidates, mismatched occurrence and missing repair time never prove intervention',()=>{
 for(const patch of [{defect_code:'OTHER'},{defect_time:stamp(11)},{pcba_sn:'OTHER'},{repair_time:null},{repair_time:stamp(11)}]){
  const input=fixture();Object.assign(input.trace_3012.rows[0],patch);
  const model=buildLiveSnForensics(input);
  assert.equal(board(model),undefined,JSON.stringify(patch));
  assert.deepEqual(model.alerts[0].evidence.repairs,[]);
 }
});

test('one intervention associated with two simultaneous defects is counted once across revisions',()=>{
 const input=fixture(),other=failure(12,'LCM-2');input.trace_2114.previous_failures.push(other);
 const row=input.trace_3012.rows[0];
 input.trace_3012.rows.push({...row,row_key:'new-observation',repair_comment:'Updated comment'},repair(other,12));
 const model=buildLiveSnForensics(input);
 assert.equal(board(model).repair_count,1);
 assert.equal(board(model).evidence.length,1);
 assert.equal(board(model).evidence[0].associated_failures.length,2);
 assert(!kinds(model).includes('PCBA_REPEATED_MAINBOARD_REPAIR'));
});

test('two actual board interventions count twice, sorted by repair time with the latest comment',()=>{
 const input=fixture(),earlier=failure(10);input.trace_2114.previous_failures.push(earlier);
 input.trace_3012.rows.unshift(repair(earlier,10,11,{repair_comment:'Older comment'}));
 const model=buildLiveSnForensics(input);
 assert.equal(board(model).kind,'PCBA_REPEATED_MAINBOARD_REPAIR');
 assert.equal(board(model).repair_count,2);
 assert.equal(board(model).technician_comment,'Placa reparada e retestada');
});

test('repair cannot cross the next failure boundary even when still before the current failure',()=>{
 const input=fixture();input.trace_2114.previous_failures.push(failure(13,'OTHER'));
 input.trace_3012.rows[0].repair_time=stamp(14);
 assert.equal(board(buildLiveSnForensics(input)),undefined);
 input.trace_3012.rows[0].repair_time=stamp(13);
 assert.equal(board(buildLiveSnForensics(input)),undefined);
});

test('same code, explicit same family and different family remain separate correlations',()=>{
 const input=fixture();input.trace_2114.previous_failures.push(failure(11,'LCM-2'),{...failure(10,'AUDIO-1'),failure_family:'AUDIO'});
 const model=buildLiveSnForensics(input);
 assert(model.alerts.some(a=>a.kind==='PCBA_SAME_FAILURE'));
 assert(model.alerts.some(a=>a.kind==='PCBA_SAME_FAMILY'&&a.prior_defect_code==='LCM-2'));
 assert(!model.alerts.some(a=>a.prior_defect_code==='AUDIO-1'));
 input.trace_2114.current_failure.failure_family='OUTRO';
 for(const f of input.trace_2114.previous_failures)f.failure_family='OUTRO';
 assert(!kinds(buildLiveSnForensics(input)).includes('PCBA_SAME_FAMILY'));
});

test('MainBoard mention, negation, replacement or future plan is not a completed board repair',()=>{
 for(const patch of [{repair_desc:'Inspection',repair_code:'CHECK',repair_comment:'MainBoard suspected'},
  {repair_comment:'MainBoard repair not performed'}, {repair_comment:'Sem reparo na placa'},
  {repair_comment:'MainBoard repair pending'}, {repair_desc:'MainBoard replacement'}]){
  const input=fixture();Object.assign(input.trace_3012.rows[0],patch);
  assert.equal(board(buildLiveSnForensics(input)),undefined,JSON.stringify(patch));
 }
});

test('post-repair recurrence carries exact 3012 evidence; a return station requires its own 3022 proof',()=>{
 const input=fixture();const model=buildLiveSnForensics(input);
 const alert=model.alerts.find(a=>a.kind==='PCBA_MAINBOARD_REPAIR_RECURRENCE');
 assert(alert);assert.equal(alert.evidence.return,null);assert(!alert.sources.includes('3022'));
 input.local_snapshot={process_contexts:[{pcba_sn:'P',source:'3022',defect_code:'LCM-1',defect_time:stamp(12),repair_event_time:stamp(12,11),return_event_time:stamp(12,12),return_station_code:'A5240'}]};
 const proved=buildLiveSnForensics(input).alerts.find(a=>a.kind===alert.kind);
 assert.equal(proved.evidence.return.station,'A5240');
 input.local_snapshot.process_contexts[0].return_event_time=stamp(16);
 assert.equal(buildLiveSnForensics(input).alerts.find(a=>a.kind===alert.kind).evidence.return,null);
});

function componentsFixture(){
 const input=fixture();input.trace_3074={reused_components:[],component_usage:[]};
 for(const [sn,type,code] of [['FPC-1','FPC','LCM-2'],['LCM-1','LCM','LCM-1']]){
  const old=failure(11,code,'OLD');
  input.trace_3074.reused_components.push({item_sn:sn,item_type:type,previous_pcbas:['OLD'],previous_pcba_evidence:[{pcba_sn:'OLD',relation:code==='LCM-1'?'MESMA_FALHA':'FALHA_SIMILAR',history:old}]});
  input.trace_3074.component_usage.push({item_sn:sn,query:{rows:[
   {Barcode:'P','Sn Type':'PCBA','Bind Time':'2026-10-14 12:00:00','Unbind Time':'','Iss Status':'Y'},
   {Barcode:'OLD','Sn Type':'PCBA','Bind Time':'2026-10-10 12:00:00','Unbind Time':'2026-10-12 12:00:00','Iss Status':'N'}]}});
  input.trace_3012.rows.push(repair(old,11,11,{repair_desc:'FPC removal',repair_comment:'FPC desmontado na análise LCM; placa condenada'}));
 }
 return input;
}

test('FPC/LCM and multiple components retain individual bindings, old board/failure and technician evidence',()=>{
 const model=buildLiveSnForensics(componentsFixture()),alerts=model.alerts.filter(a=>a.kind.startsWith('COMPONENT'));
 assert.equal(alerts.length,2);assert.deepEqual(alerts.map(a=>a.item_sn),['FPC-1','LCM-1']);
 assert.equal(alerts[0].relation,'FALHA_SIMILAR');assert.equal(alerts[1].relation,'MESMA_FALHA');
 for(const a of alerts){assert.equal(a.pcba_sn,'OLD');assert.equal(a.evidence.binding.current.pcba_sn,'P');
  assert.equal(a.evidence.repairs[0].repair_user,'TECH-1');assert.equal(a.evidence.repairs[0].repair_time,stamp(11,11));
  assert.match(a.technician_comment,/FPC/);assert.equal(a.root_cause_confirmed,false);assert.equal(a.classification,'correlation');}
});

test('future, missing or ended bindings cannot establish component correlation at the failure',()=>{
 for(const patch of [{'Bind Time':'2026-10-16 12:00:00'},{'Bind Time':''},{'Unbind Time':'2026-10-14 14:00:00'}]){
  const input=componentsFixture();for(const u of input.trace_3074.component_usage)Object.assign(u.query.rows[0],patch);
  assert(!kinds(buildLiveSnForensics(input)).some(k=>k.startsWith('COMPONENT')));
 }
 const input=componentsFixture();for(const u of input.trace_3074.component_usage)u.query.rows[1]['Unbind Time']='2026-10-10 13:00:00';
 assert(!kinds(buildLiveSnForensics(input)).some(k=>k.startsWith('COMPONENT')));
 const noUnbind=componentsFixture();
 for(const usage of noUnbind.trace_3074.component_usage)usage.query.rows[1]['Unbind Time']='';
 assert(!kinds(buildLiveSnForensics(noUnbind)).some(k=>k.startsWith('COMPONENT')),
   'historical N binding without an unbind time is candidate evidence, not proven presence');
});

test('aggregate relation does not leak to another historical occurrence',()=>{
 const input=componentsFixture(),item=input.trace_3074.reused_components[0];
 item.relation_to_current_failure='FALHA_SIMILAR';delete item.previous_pcba_evidence[0].relation;
 item.previous_pcba_evidence[0].history.failure_family='AUDIO';
 assert(!buildLiveSnForensics(input).alerts.some(a=>a.item_sn==='FPC-1'));
});

test('equivalent UTC/local timestamps associate exactly and do not duplicate repair observations',()=>{
 const input=fixture();input.trace_3012.rows[0].defect_time='2026-10-12T13:00:00Z';
 input.trace_3012.rows.push({...input.trace_3012.rows[0],repair_time:'2026-10-12T14:00:00Z',row_key:'other'});
 assert.equal(board(buildLiveSnForensics(input)).repair_count,1);
});

test('local SQLite projection and live payload yield the same correlations without modifying inputs',()=>{
 const live=componentsFixture();
 // A complete live query returns both old-board occurrences for each component.
 const histories=live.trace_3074.reused_components.flatMap(m=>m.previous_pcba_evidence);
 for(const item of live.trace_3074.reused_components)item.previous_pcba_evidence=histories;
 const before=JSON.stringify(live),online=buildLiveSnForensics(live);
 const local={query_sn:'P',pcba_history:[live.trace_2114.current_failure,...live.trace_2114.previous_failures,
  ...histories.map(h=>h.history)],repair_3012:live.trace_3012.rows,
  material_reuse:live.trace_3074.reused_components.map(m=>({current_pcba_sn:'P',item_sn:m.item_sn,item_type:m.item_type,previous_pcbas_json:'["OLD"]',bind_time_utc:'2026-10-14T12:00:00Z',iss_status_now:'Y',raw_json:JSON.stringify({all_pcba_history:[{pcba_sn:'OLD',bind_time_utc:'2026-10-10T12:00:00Z',unbind_time_utc:'2026-10-12T12:00:00Z',event_count:1}]})})),coverage:{2114:true,3012:true,3074:true}};
 const offline=buildLocalSnForensics(local);
 assert.deepEqual(kinds(offline).sort(),kinds(online).sort());assert.equal(JSON.stringify(live),before);
 assert.deepEqual(kinds(buildLocalSnForensics({cached_lookup:live})).sort(),kinds(online).sort());
 assert(offline.alerts.every(a=>a.evidence&&a.root_cause_confirmed===false));
});

test('family context is applied only to the exact PCBA and occurrence; no family is guessed from component type',()=>{
 const input=fixture(),old=input.trace_2114.previous_failures[0],cur=input.trace_2114.current_failure;
 old.defect_code='LCM-2';delete old.failure_family;delete cur.failure_family;
 input.local_snapshot={process_contexts:[old,cur].map(f=>({...f,source:'3022',failure_family:'DISPLAY_LCD'}))};
 assert(kinds(buildLiveSnForensics(input)).includes('PCBA_SAME_FAMILY'));
 input.local_snapshot.process_contexts[0].pcba_sn='OTHER';
 assert(!kinds(buildLiveSnForensics(input)).includes('PCBA_SAME_FAMILY'));
});

test('missing binding evidence is explicit and does not erase source histories',()=>{
 const input=componentsFixture();input.trace_3074.component_usage=[];
 const model=buildLiveSnForensics(input);
 assert.equal(model.materials.length,2);
 assert(model.correlation_limits.some(l=>l.code==='COMPONENT_BINDING_UNPROVEN'&&l.item_sn==='FPC-1'));
 assert.equal(model.source_states['3074'],'ok');
 const empty=buildLiveSnForensics({});assert.equal(empty.source_states['3012'],'not_collected');
 assert.deepEqual(empty.alerts,[]);assert.equal(empty.correlation_limits[0].code,'CURRENT_TIME_UNPROVEN');
});

import {renderSnCorrelationAlerts} from '../ames/evidence-view.mjs';
test('shared live/offline alert renderer exposes all component evidence in PT/EN and escapes raw comments',()=>{
 const input=componentsFixture();input.trace_3012.rows[1].repair_comment='<script>alert(1)</script>';
 const model=buildLiveSnForensics(input);
 for(const locale of ['pt-BR','en-US']){
  const html=renderSnCorrelationAlerts(model,locale);
  assert.match(html,/FPC-1/);assert.match(html,/LCM-1/);assert.match(html,/OLD/);assert.match(html,/TECH-1/);
  assert.match(html,/3012/);assert.match(html,/(?:Comentário|Comment)/);assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/2026-10-11T/);
  assert.match(html,locale==='pt-BR'?/Correlação não confirma causa raiz/:/Correlation does not confirm root cause/);
 }
});

test('equivalent duplicate history rows emit only one same-failure alert',()=>{
 const input=fixture();input.trace_2114.previous_failures.push({...input.trace_2114.previous_failures[0],defect_time:'2026-10-12T13:00:00Z'});
 assert.equal(buildLiveSnForensics(input).alerts.filter(a=>a.kind==='PCBA_SAME_FAILURE').length,1);
});
