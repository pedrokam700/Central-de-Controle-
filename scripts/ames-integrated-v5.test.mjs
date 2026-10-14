import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterRows} from '../ames/advanced-table.mjs';
import {reuseLinks,aggregatePcbas} from '../ames/data/reuse-analysis.mjs';
import {configuredShiftAt} from '../ames/console-shift-summary.mjs';

test('exact CPH and shift filters before PCBA aggregation',()=>{
 const rows=[{product:'CPH2819',production_shift:'1st Shift'},{product:'CPH2819V',production_shift:'1st Shift'},{product:'CPH2819',production_shift:'2nd Shift'}];
 assert.deepEqual(filterRows(rows,{filters:{product:'CPH2819',production_shift:'1st Shift'}}),[rows[0]]);
});

test('automatic shift uses factory timezone, never browser timezone',()=>{
 const config={timezone:'America/Sao_Paulo',work_shifts:{'1':{start:'07:30',end:'17:30'},'2':{start:'17:30',end:'07:30'}}};
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T10:29:59Z')),'2nd Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T10:30:00Z')),'1st Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T20:29:59Z')),'1st Shift');
 assert.equal(configuredShiftAt(config,new Date('2026-10-14T20:30:00Z')),'2nd Shift');
});

test('3012 ExtJS load event uses records argument and refuses stale timeout grid',async()=>{
 const py=fs.readFileSync('ames/agent/ames_3012_live.py','utf8'),js=py.split('QUERY_3012_JS = r"""')[1].split('"""')[0],query=eval('('+js+')');
 let handler;
 const fields=['sn','line','model','defect code','repair code','defect type','start time','end time'].map(fieldLabel=>({fieldLabel,setValue(v){this.value=v},getValue(){return this.value},isValid(){return true}}));
 for(const fieldLabel of ['defect time start','defect time end'])fields.push({fieldLabel,xtype:'datefield',setValue(v){this.value=v},getValue(){return this.value},isValid(){return true}});
 const record={getData:()=>({sn:'P',repairComment:'Synthetic'})};
 const store={currentPage:4,pageSize:100,getModel:()=>({getFields:()=>['repairComment','repairUser','defectCode'].map(name=>({name:name.replace(/([A-Z])/g,' $1')}))}),on:(name,fn)=>{handler=fn},un:()=>{},loadPage(){},getTotalCount:()=>1,getProxy:()=>({extraParams:{sn:'P'}})};
 const grid={getStore:()=>store};const button={text:'View',isButton:true,handler:()=>handler(store,[record],true)};
 globalThis.window={Ext:{}};globalThis.Ext={ComponentManager:{all:{items:[...fields,grid,button]}}};
 try{const result=await query({sn:'P',dateFrom:'2026-10-13',dateTo:'2026-10-13',timeFrom:'07:30',timeTo:'17:30'});assert.equal(result.records[0].sn,'P');assert.equal(store.currentPage,1);assert.ok(js.includes('grade antiga recusada'));}finally{delete globalThis.window;delete globalThis.Ext;}
});
