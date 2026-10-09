import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAmesStore } from '../ames/data/store.mjs';
import { selectCoraContext, MES_REASONING_RULES } from '../ames/data/cora.mjs';
import { productFixture } from './ames-fixtures.mjs';
test('CORA scopes facts by exact CPH/line, caps context and never promotes cause/reuse',()=>{
  const s=createAmesStore(),doc=productFixture();doc.payload.defects[0].cause='confirmed';doc.payload.password='secret';s.replaceRemoteDocuments([doc,productFixture('TAN10102')]);
  const m=selectCoraContext(s,{line_id:'TAN10101',product:'2859v'});
  assert.equal(m.facts.length,25);assert.equal(m.matched_rows,30);assert.equal(m.context_truncated,true);
  assert(m.facts.every(r=>r.line_id==='TAN10101'&&r.product==='CPH2859V'&&r.kind==='observed_fact'));
  assert.deepEqual(m.human_confirmed_causes,[]);assert.deepEqual(m.correlations,[]);assert.deepEqual(m.hypotheses,[]);
  assert.equal(m.coverage.status,'partial');assert(!JSON.stringify(m).includes('secret'));
  assert.equal(selectCoraContext(s).status,'not_selected');assert.throws(()=>selectCoraContext(s,{line_id:'all'}),/line/);
  assert(selectCoraContext(s,{line_id:'TAN10101',product:'CPH2859'}).facts.every(r=>r.product==='CPH2859'));
  s.clear();assert.equal(selectCoraContext(s,{line_id:'TAN10101'}).status,'unavailable');
});
test('CORA reads corrections immediately and preserves provenance',()=>{
  const s=createAmesStore(),d=productFixture();s.replaceRemoteDocuments([d]);
  const f={line_id:'TAN10101'},before=selectCoraContext(s,f);
  d.payload.defects[0].defect_desc='corrected';s.replaceRemoteDocuments([d]);const after=selectCoraContext(s,f);
  assert.equal(after.snapshot_id,before.snapshot_id);assert.notEqual(after.facts[0].defect_desc,before.facts[0].defect_desc);
  assert.equal(after.facts[0].defect_desc,'corrected');assert.equal(after.source,'remote');assert(after.collected_at);
});
test('real prompt preserves structured MES separately from legacy Central truncation',()=>{
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const code=app.slice(app.indexOf('    function aiBuildPromptText('),app.indexOf('    function aiPageState('));
  const ctx=vm.createContext({AI_SYSTEM_PROMPT:'system',MES_REASONING_RULES,currentLanguage:'pt-BR'});
  vm.runInContext(code,ctx);
  const prompt=ctx.aiBuildPromptText({centralData:{reports:'X'.repeat(20000),mes:{snapshot_id:'CURRENT-SNAPSHOT',facts:[],status:'partial'}}});
  assert(prompt.includes('CURRENT-SNAPSHOT'));assert(prompt.includes(MES_REASONING_RULES));
  const memoryCode=app.slice(app.indexOf('    function aiBuildMemoryContext('),app.indexOf('    function aiIsGreeting('));
  const memory=vm.createContext({state:{aiKnowledge:[{kind:'ames_shared_snapshot',text:'UNSCOPED MES'}]},AI_SEED_KNOWLEDGE:[],aiScoreText:()=>1,aiRelevantText:()=>''});
  vm.runInContext(memoryCode,memory);assert.equal(memory.aiBuildMemoryContext('CPH2859').length,0);
});
