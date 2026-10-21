import test from 'node:test';import assert from 'node:assert/strict';
import {componentMatrix} from '../ames/data/component-matrix.mjs';
import {componentMatrixHtml} from '../ames/console-component-matrix.mjs';
const row=(sn,prev=1)=>({'Material SN':sn,'Tipo material':'GENERIC','Reusos anteriores material':prev,'PCBAs desvinculadas':'OLD | OLD','PCBAs com mesma falha':1});
const fixture=()=>({source_id:'SOURCE',snapshot_id:'S',revision:2,line_id:'TAN10101',insights:{component_types:[{'Tipo material':'GENERIC','Materiais únicos no lote':2,'Reutilizados únicos':2,'2º uso':1,'3º+ uso':1,'Com mesma falha':2}],drilldowns:{component_type_items:[row('M1'),row('M1'),row('M2',2)],material_analysis:[row('M1')]}}});
test('TIPOS_COMPONENTE reconciles physical kit SNs and exact prior PCBA links',()=>{
 const s=fixture(),copy=structuredClone(s),m=componentMatrix(s)[0];
 assert.equal(m.metrics.total.value,2);assert.equal(m.metrics.second.value,1);assert.equal(m.metrics.third.value,1);
 assert.equal(m.metrics.links.value,2);assert.equal(m.metrics.same.value,2);assert.equal(m.component_failure,null);assert.equal(m.failure_rate,null);
 assert.equal(m.source_id,'SOURCE');assert.equal(m.revision,2);assert.deepEqual(s,copy);
});
test('incomplete old aggregate without physical details never invents zero or drilldown',()=>{
 const s=fixture();s.insights.drilldowns={};const m=componentMatrix(s)[0];assert.equal(m.metrics.total.value,null);assert.equal(m.metrics.total.declared,2);assert.equal(m.metrics.total.mismatch,true);assert.equal(m.metrics.same.value,null);
});
test('same SN in two physical types is not merged, unknown usage is not first use',()=>{
 const s=fixture();s.insights.drilldowns.component_type_items.push({...row('M1'), 'Tipo material':'OTHER','Reusos anteriores material':null});
 const other=componentMatrix(s).find(r=>r.type==='OTHER');assert.equal(other.metrics.total.value,1);assert.equal(other.metrics.reused.value,null);assert.equal(other.metrics.second.value,null);
});
test('conflicting use counts and contradictory aggregates remain unconfirmed',()=>{
 const s=fixture();s.insights.drilldowns.component_type_items.push(row('M1',3));
 const m=componentMatrix(s)[0];assert.equal(m.metrics.second.value,null);assert.equal(m.metrics.reused.value,null);
});
test('HTML evidence escapes raw SN, preserves full labels and PT/EN',()=>{
 const s=fixture();s.insights.drilldowns.component_type_items[0]['Material SN']='<img src=x>';
 globalThis.document={documentElement:{lang:'pt-BR'}};const pt=componentMatrixHtml(s);assert(!pt.includes('<img'));assert.match(pt,/&lt;img/);assert.match(pt,/não comprova defeito físico/);
 document.documentElement.lang='en';assert.match(componentMatrixHtml(s),/Physical type/);delete globalThis.document;
});
