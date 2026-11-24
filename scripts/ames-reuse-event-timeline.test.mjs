import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBoardComparisonTable,renderComponentComparisonTable,consolidateComponentHistory} from '../ames/console-reuse-cohorts.mjs';
import {reuseTimelineFixture} from './fixtures/reuse-timeline.mjs';
import {buildReuseHistoryTimeline} from '../ames/data/reuse-history-timeline.mjs';
globalThis.document={documentElement:{lang:'pt-BR'}};

test('U1b: all eight source events share one table, independent clocks, people and comments',()=>{
 const f=reuseTimelineFixture(),html=renderBoardComparisonTable(f.board,{repairs:f.repairs,operators:f.operators});
 assert.equal((html.match(/<table[ >]/g)||[]).length,1);
 assert.equal((html.match(/data-reuse-timeline-row/g)||[]).length,8);
 for(const text of ['Autor histórico zero','Autor histórico um','Reparadora Alfa','Reparador Beta','Operadora Gama',
  'MainBoard','Phone Disassembly','Phone Battery Cover','Comentário completo Alfa','Segunda linha Alfa',
  'Comentário independente Beta &lt;seguro&gt;','Defect Time','Tran Time','Repair Time','SYNTH-SOURCE','Hist Seq 0'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/data-reuse-3012-timeline|<summary>\+\d|title="(?:Reparador|Comentário)/);
});
test('U1b: exact duplicates collapse but changed revision or author never disappears',()=>{
 const f=reuseTimelineFixture(),first=f.board.history_2114[0];
 f.board.history_2114=[first,structuredClone(first),{...first,snapshot_revision:17},{...first,defect_user_name:'Outro autor explícito'}];
 f.board.events=[];
 const html=renderBoardComparisonTable(f.board);
 assert.equal((html.match(/data-reuse-source-row/g)||[]).length,3);
 assert.ok(html.includes('Outro autor explícito'));
});
test('U1b: missing 2114 timestamp stays undated and receives no repair user or comment',()=>{
 const f=reuseTimelineFixture();f.board.history_2114=[f.board.history_2114[2]];f.board.events=[];
 const html=renderBoardComparisonTable(f.board,{repairs:f.repairs,operators:f.operators});
 const row=html.match(/<tr[^>]*data-source-view="2114"[\s\S]*?<\/tr>/)?.[0];
 assert.ok(row,'independent 2114 row');assert.match(row,/horário não comprovado/i);
 assert.doesNotMatch(row,/Reparadora Alfa|Reparador Beta|Operadora Gama|Comentário/);
});
test('U1b: component keeps different boards, explicit Y/N bindings and source identities',()=>{
 const f=reuseTimelineFixture();
 const bindings=[{pcba_sn:f.board.sn,role:'investigated',usage_status:'Y',bind_time_utc:'2026-11-09T10:00:00Z',failures:f.board.history_2114},
  {pcba_sn:'SYNTH-PCBA-OLD',role:'previous',usage_status:'N',unbind_time_utc:'2026-11-08T10:00:00Z',failures:[{...f.board.history_2114[0],pcba_sn:'SYNTH-PCBA-OLD',record_id:'OLD-H'}]}];
 const html=renderComponentComparisonTable(consolidateComponentHistory(bindings));
 assert.equal((html.match(/data-reuse-source-row/g)||[]).length,4);
 assert.match(html,/Vínculo 3074 · Y/);assert.match(html,/Vínculo 3074 · N/);
 assert.ok(html.includes('SYNTH-PCBA-OLD'));assert.ok(html.includes('SYNTH-SOURCE'));
});
test('U1b: scope differences survive as separate observations, no person borrowed from foreign source',()=>{
 const f=reuseTimelineFixture(),r={...f.repairs[0],repair_user_name:null,repair_user:'SYNTH-O0'};
 const foreign={...f.operators[0],source_id:'FOREIGN-SOURCE'};
 const html=renderBoardComparisonTable(f.board,{repairs:[r,{...f.repairs[1],pcba_sn:'FOREIGN-PCBA'}],operators:[foreign]});
 const repair=html.match(/<tr[^>]*data-source-view="3012"[\s\S]*?<\/tr>/)[0];
 assert.doesNotMatch(repair,/Operadora Gama/);assert.match(repair,/nome não comprovado/);
 assert.doesNotMatch(html,/FOREIGN-PCBA/);
 const h=f.board.history_2114[0];
 const observations=[h,{...h,source_id:'ANOTHER'},{...h,line_id:'TAN10103'},{...h,snapshot_id:'12'},{...h,snapshot_revision:17}];
 assert.equal(buildReuseHistoryTimeline({failures:observations}).length,5);
});
test('U1b: nested and raw 3022 duplicates preserve event metadata; contradictory actors stay unproven',()=>{
 const f=reuseTimelineFixture(),op=f.operators[0];
 const wrapper={...op,operator_id:undefined,operator_name:undefined,provenance:{adapter:{operator_evidence:op,operator_events:[op]}}};
 const events=buildReuseHistoryTimeline({failures:f.board.history_2114,operators:[wrapper]});
 const observed=events.filter(e=>e.source_view==='3022');
 assert.equal(observed.length,1);assert.equal(observed[0].event_id,'O0');assert.equal(observed[0].snapshot_revision,16);
 const html=renderBoardComparisonTable(f.board,{operators:[op,{...op,operator_name:'Nome contraditório'}]});
 assert.match(html,/Nomes conflitantes; autoria não comprovada/);
 const unknown=renderBoardComparisonTable(f.board,{operators:[{...op,operator_name:null}]});
 assert.match(unknown,/SYNTH-O0/);assert.match(unknown,/nome não comprovado/);
 const mixed={...wrapper,provenance:{adapter:{operator_evidence:{...op,source_id:'OTHER'}}}};
 assert.equal(buildReuseHistoryTimeline({failures:f.board.history_2114,operators:[mixed]}).filter(e=>e.source_view==='3022').length,0);
});
test('U1b: timestamps order events without filling missing clocks or mutating source',()=>{
 const f=reuseTimelineFixture(),input={failures:[...f.board.history_2114,...f.board.events],repairs:f.repairs,operators:f.operators};
 const before=structuredClone(input),events=buildReuseHistoryTimeline(input);
 assert.deepEqual(events.map(e=>e.record_id||e.row_key||e.event_id),['H0','R0','O0','H1','R1','C0','C1','H2']);
 assert.equal(events.at(-1).defect_time,null);assert.equal(events.at(-1).sort_at,null);
 assert.deepEqual(input,before);
});
test('U1b: a bound PCBA without history remains visible, without guessing Y/N or first use',()=>{
 const html=renderComponentComparisonTable(consolidateComponentHistory([{pcba_sn:'BOUND-EMPTY',role:'previous',failures:[]}]));
 assert.match(html,/BOUND-EMPTY/);assert.match(html,/Histórico não disponível/);assert.match(html,/Y\/N não comprovado/);
 assert.doesNotMatch(html,/1º uso|2º uso/);
});
test('U1b: repairs already loaded in the snapshot survive an unavailable local cache',()=>{
 const f=reuseTimelineFixture();
 f.board.history_2114[0].repair_evidence_3012=f.repairs;
 f.board.events[0].repair_evidence_3012=structuredClone(f.repairs);
 const html=renderBoardComparisonTable(f.board,{status:{'3012':'error'}});
 assert.equal((html.match(/data-reuse-3012-occurrence/g)||[]).length,2);
 assert.match(html,/Reparadora Alfa/);assert.match(html,/Reparador Beta/);
 assert.match(html,/indisponível.*preservadas/);
});
test('U1b: nested observation keeps its explicit origin and legacy operator field names',()=>{
 const f=reuseTimelineFixture();
 const entry={...f.scope,pcba_sn:f.board.sn,station:'A6900','Tran Time':'2026-11-10 08:30:00',
  'Employee ID':'SYNTH-LEGACY','Tran User Desc':'Pessoa legada'};
 const wrapper={pcba_sn:f.board.sn,event_id:'NESTED',provenance:{adapter:{operator_evidence:entry}}};
 const event=buildReuseHistoryTimeline({failures:f.board.history_2114,operators:[wrapper]}).find(e=>e.source_view==='3022');
 assert.equal(event.source_id,f.scope.source_id);assert.equal(event.snapshot_revision,16);
 assert.equal(event.actors[0].name,'Pessoa legada');
});
test('U1b: canonical and local copies of the same explicit 3022 event are shown once',()=>{
 const f=reuseTimelineFixture(),canonical={...f.operators[0],record_id:'CANONICAL-O0'};
 const local={...f.operators[0],snapshot_id:11,source_id:undefined,snapshot_revision:undefined,operator_role:'observed_process_operator'};
 let events=buildReuseHistoryTimeline({failures:f.board.history_2114,operators:[canonical,local]});
 assert.equal(events.filter(e=>e.source_view==='3022').length,1);
 assert.equal(events.find(e=>e.source_view==='3022').record_id,'CANONICAL-O0');
 events=buildReuseHistoryTimeline({failures:f.board.history_2114,operators:[canonical,{...local,snapshot_revision:17}]});
 assert.equal(events.filter(e=>e.source_view==='3022').length,2,'explicitly different revisions remain different observations');
});

test('snapshot and cache copies of one 3012 repair share a row and recover the explicit name',()=>{
 const f=reuseTimelineFixture();
 const partial={...f.repairs[0],repair_user_name:undefined,raw_ref:'sqlite:3012:R0'};
 const cached={...partial,raw_ref:undefined,raw:{repairUserDesc:'Nome registrado'}};
 const rows=buildReuseHistoryTimeline({repairs:[partial,cached,{...cached,row_key:'R1'}]});
 assert.equal(rows.length,2);
 assert.equal(rows.find(r=>r.row_key==='R0').actors[0].name,'Nome registrado');
 assert.equal(rows.find(r=>r.row_key==='R0').raw_ref,'sqlite:3012:R0');
 const conflict={...cached,repair_comment:'Revisão diferente'};
 assert.equal(buildReuseHistoryTimeline({repairs:[partial,conflict]}).length,2);
});

test('legacy 3022 code in Tran User does not shadow its explicit name; names stay on the same PCBA',()=>{
 const f=reuseTimelineFixture(), repair={...f.repairs[0],repair_user_name:undefined};
 const operator={pcba_sn:repair.pcba_sn,raw:{'Tran User Id':repair.repair_user,'Tran User':repair.repair_user,'Tran User Desc':'Pessoa do reparo'}};
 const html=renderBoardComparisonTable(f.board,{repairs:[repair],operators:[operator]});
 assert.match(html.match(/<tr[^>]*data-source-view="3012"[\s\S]*?<\/tr>/)[0],/Pessoa do reparo/);
});

test('durable 3022 passage with short operation and full terminal is only displayed once',()=>{
 const f=reuseTimelineFixture(),op={...f.operators[0],station:'A5160'};
 const events=buildReuseHistoryTimeline({pcbas:[f.board.sn],operators:[op,{...op,station:'TAN10101A516001'}]});
 assert.equal(events.length,1);
 assert.equal(buildReuseHistoryTimeline({pcbas:[f.board.sn],operators:[op,{...op,station:'TAN10102A516001'}]}).length,2);
});
