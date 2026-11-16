import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBoardComparisonTable,renderComponentComparisonTable,consolidateComponentHistory} from '../ames/console-reuse-cohorts.mjs';
import {reuseTimelineFixture} from './fixtures/reuse-timeline.mjs';
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
