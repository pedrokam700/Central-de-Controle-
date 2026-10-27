import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {filterRows,orderRows,csv} from '../ames/advanced-table.mjs';import {reuseLinks,aggregatePcbas,reuseKpis,componentFamily} from '../ames/data/reuse-analysis.mjs';import {REUSE_PRESETS} from '../ames/reuse-table-view.mjs';
const sha256=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const shiftSelector=()=>{const py=spawnSync('python',['-c',"import sys;sys.path.insert(0,'ames/factory-engine');from ames.shift_2114 import SELECT_SHIFT_JS;print(SELECT_SHIFT_JS)"],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);return eval('('+py.stdout+')');};
test('frozen 3028 matches physical CLEAN V3 hashes',()=>{for(const [name,sha] of Object.entries({ames_3028:'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1',ames_3028_live:'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}))assert.equal(sha256('ames/agent/'+name+'.py'),sha);});
test('unrelated essential engine remains byte-for-byte CLEAN V3',()=>{const manifest=JSON.parse(fs.readFileSync('docs/ames/clean-v3-source-manifest.json'));for(const name of ['ames/browser.py','core/fluxo_3028_3074.py'])assert.equal(sha256('ames/factory-engine/'+name),manifest[name],name);});
test('Issue #66 3074 View-response correction is explicit and source-pinned',()=>{
  const manifest=JSON.parse(fs.readFileSync('docs/ames/clean-v3-source-manifest.json'));
  const path='ames/factory-engine/ames/tela_3074.py';
  assert.notEqual(sha256(path),manifest['ames/tela_3074.py']);
  // Baseline manifesto is immutable; only this Issue #66 revision has a new
  // pinned source hash. All unchanged CLEAN V3 source gates remain active.
  assert.equal(sha256(path),'3bf9cb415b9fe69fe6dbc1305ac2c54a92685741e6eff9ccec465db121d0f4d4');
  const src=fs.readFileSync(path,'utf8');
  assert.match(src,/STORE_REFRESH_AFTER_VIEW/);
  assert.match(src,/visible_only=True/);
  assert.match(src,/self\._store_response\(frame, armed_grid_id, "arm", response_token\)/);
  assert.match(src,/not rows and loading is not True and fresh/);
});
test('approved temporal 3074 policy is explicitly pinned rather than mistaken for unchanged CLEAN V3',()=>{
  const original=JSON.parse(fs.readFileSync('docs/ames/clean-v3-source-manifest.json'));
  const path='ames/factory-engine/core/temporal_3074.py';
  // This file was intentionally changed after CLEAN V3; other frozen sources
  // still have to match that original baseline byte-for-byte.
  assert.notEqual(sha256(path),original['core/temporal_3074.py']);
  // Issue #66 extends ONLY the individual SN/material temporal policy with
  // conservative mounting-cycle selection. CLEAN V3 and frozen 3028 are not
  // modified. Pin the approved reviewable source exactly on this draft PR.
  assert.equal(sha256(path),'91a689ffd939c2daf2db2ca64c5b9372907e7fb9a2988989d65ba7f51ae5b09a');
});
test('targeted 3022 physical fix is explicit and rejects hidden stale Ext inputs',()=>{const manifest=JSON.parse(fs.readFileSync('docs/ames/clean-v3-source-manifest.json'));const name='ames/tela_3022.py',path='ames/factory-engine/'+name;assert.notEqual(sha256(path),manifest[name],name+' must be an explicit physical-gate delta');const src=fs.readFileSync(path,'utf8');assert.match(src,/c\.isVisible\s*&&\s*!c\.isVisible\(true\)/);assert.match(src,/getBoundingClientRect\(\)/);assert.match(src,/#\{meta\['inputId'\]\}:visible/);assert.match(src,/input_ready_timeout_s/);assert.match(src,/while time\.time\(\) < input_deadline:/);assert.match(src,/if saw_ext:\s*\n\s*return None/);assert.match(src,/mark\("view_located"\)/);assert.doesNotMatch(src,/campo\.click\(timeout=3000\)/);assert.match(src,/3022 não encontrou um campo SN\/IMEI visível e estável/);});
test('targeted 2114 physical fix is explicit and preserves fail-closed source boundaries',()=>{const manifest=JSON.parse(fs.readFileSync('docs/ames/clean-v3-source-manifest.json'));for(const name of ['ames/navigation.py','ames/tela_2114.py','core/fluxo_2114.py'])assert.notEqual(sha256('ames/factory-engine/'+name),manifest[name],name+' must be an explicit physical-gate delta');const nav=fs.readFileSync('ames/factory-engine/ames/navigation.py','utf8'),tela=fs.readFileSync('ames/factory-engine/ames/tela_2114.py','utf8'),flow=fs.readFileSync('ames/factory-engine/core/fluxo_2114.py','utf8'),shift=fs.readFileSync('ames/factory-engine/ames/shift_2114.py','utf8');assert.match(nav,/strict:\s*bool\s*=\s*False/);assert.match(nav,/if strict:\s*\n\s*raise/);assert.match(tela,/SHIFT_UNCONFIRMED/);assert.match(tela,/ensure_shift\(page/);assert.match(flow,/_unavailable_result/);assert.match(flow,/3074\/3022 podem continuar/);assert.match(flow,/"status": "partial"/);assert.match(shift,/lookup_grid/);assert.match(shift,/gridpanel/);assert.match(shift,/getSubmitValue/);assert.match(shift,/findRecordByValue/);});
const rows=[{pcba:'P1',material:'M1',line:'TAN10103',product:'CPH2819',family:'Front Camera',usage:'2º uso',relations:'MESMA FALHA',defect_time:'2026-10-13T09:00',previous_pcbas:'OLD1'},{pcba:'P1',material:'M2',line:'TAN10103',product:'CPH2819',family:'Speaker',usage:'2º uso',relations:'OUTRA FALHA',defect_time:'2026-10-13T09:00',previous_pcbas:'OLD1'},{pcba:'P2',material:'M3',line:'TAN10103',product:'CPH2819',family:'Front Camera',usage:'2º uso',relations:'MESMA FALHA',defect_time:'2026-10-13T10:00',previous_pcbas:'OLD2'}];
test('material links remain exact while PCBA aggregation and KPIs use distinct identities',()=>{const grouped=aggregatePcbas(rows);assert.equal(grouped.length,2);assert.equal(grouped[0].materials,2);assert.deepEqual(grouped[0]._links.map(r=>r.material),['M1','M2']);assert.deepEqual(reuseKpis(rows),{pcbas:2,materials:3,groups:3,links:3,same:2,family:0,other:1});});
test('combined filters apply to the same link before aggregation, with range and sorting',()=>{const result=filterRows(rows,{filters:{line:'TAN10103',product:'CPH2819',family:'Front Camera',usage:'2º uso',relations:'MESMA FALHA'},from:'2026-10-13',to:'2026-10-13'});assert.equal(result.length,2);assert.equal(aggregatePcbas(result).length,2);assert.equal(filterRows(rows,{filters:{family:'Speaker',relations:'MESMA_FALHA'}}).length,0);assert.equal(orderRows(result,{key:'pcba',desc:true})[0].pcba,'P2');});
test('unknown component codes stay unknown; original material IDs are preserved',()=>{assert.equal(componentFamily('H1#62102200131661F140871'),null);assert.equal(componentFamily('front_camera'),'Front Camera');const links=reuseLinks({line_id:'TAN10101',material_trace:{records:[{current_pcba_sn:'P',item_sn:'H1#EXACT',item_type:'Front Camera',previous_pcbas_json:'["OLD"]',total_pcba_count_known_now:2}]}});assert.equal(links[0].material,'H1#EXACT');assert.equal(links[0].family,'Front Camera');assert.equal(links[0].history_code,null);});
test('five presets have valid columns and CSV neutralizes spreadsheet formula execution',()=>{assert.equal(REUSE_PRESETS.length,5);assert.match(csv([{sn:'=1+1'}],[{key:'sn',label:'SN'}]),/'=1\+1/);});
test('ExtJS shift commits actual record and events even when visible text already matches',()=>{
 const select=shiftSelector();
 const dom={offsetParent:{},value:'1st Shift'},record={data:{code:'S1',desc:'1st Shift'},get(k){return this.data[k];}},events=[];
 const combo={inputEl:{dom},valueField:'code',displayField:'desc',value:'stale',raw:'1st Shift',getStore:()=>({getRange:()=>[record]}),getValue(){return this.value;},getSubmitValue(){return this.value;},getRawValue(){return this.raw;},findRecordByValue(v){return v==='S1'?record:null;},select(r){this.value=r.get('code');this.raw=r.get('desc');dom.value=r.get('desc');},fireEvent(...args){events.push(args);},isValid:()=>true};
 globalThis.document={querySelectorAll:()=>[dom]};globalThis.Ext={ComponentQuery:{query:q=>q==='combobox'||q==='field'||q==='triggerfield'?[combo]:[]},getVersion:()=>({major:4})};
 try{dom.value='';assert.equal(select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:false}).ok,false);assert.equal(select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:true}).ok,true);assert.equal(select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:false}).submitted,'S1');assert.equal(events[0][0],'select');assert.equal(events[0][2][0],record);combo.getSubmitValue=()=>'';assert.equal(select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:false}).ok,false);assert.equal(select({label:'2nd Shift',labels:['1st Shift','2nd Shift'],apply:true}).ok,false);}finally{delete globalThis.document;delete globalThis.Ext;}
});
test('physical 2114 lookup grid selects exact shift row and confirms parent field',()=>{
 const select=shiftSelector(),dom={offsetParent:{},value:''},chosen=[];
 const rec1={data:{Name:'1',Time:'7:30-17:30',Desc:'1st Shift'},get(k){return this.data[k];}},rec2={data:{Name:'2',Time:'17:30-07:30',Desc:'2nd Shift'},get(k){return this.data[k];}};
 const owner={inputEl:{dom},xtype:'triggerfield'};
 const view={getNode:()=>({dispatchEvent(){}}),focusRow(){},fireEvent(type,_view,rec){if(type==='itemdblclick'){dom.value=rec.data.Desc;chosen.push(rec.data.Name);}}};
 const grid={xtype:'gridpanel',isVisible:()=>true,getId:()=> 'shift-grid',getStore:()=>({isLoading:()=>false,getRange:()=>[rec1,rec2]}),getSelectionModel:()=>({select(rec){chosen.push('select:'+rec.data.Name);}}),getView:()=>view,fireEvent(type,_grid,rec){if(type==='itemdblclick')dom.value=rec.data.Desc;}};
 globalThis.document={querySelectorAll:()=>[dom]};globalThis.Ext={ComponentQuery:{query:q=>(q==='combobox'?[]:(q==='field'||q==='triggerfield'?[owner]:(q==='gridpanel'?[grid]:[])))}};
 try{const before=select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:false});assert.equal(before.ok,false);assert.equal(before.strategy,'lookup_grid');const applied=select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:true});assert.equal(applied.ok,true);assert.equal(applied.strategy,'lookup_grid');assert.equal(applied.record.Desc,'1st Shift');assert.equal(dom.value,'1st Shift');assert.ok(chosen.includes('select:1'));assert.ok(!chosen.includes('select:2'));const confirmed=select({label:'1st Shift',labels:['1st Shift','2nd Shift'],apply:false});assert.equal(confirmed.ok,true);assert.equal(confirmed.strategy,'existing_lookup_dom');}finally{delete globalThis.document;delete globalThis.Ext;}
});
