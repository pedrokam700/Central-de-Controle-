import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import test from 'node:test';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(base,'ames/agent/ames_3012_live.py'),'utf8');
const match=source.match(/QUERY_3012_JS = r"""\n([\s\S]*?)\n"""/);
assert.ok(match,'embedded ExtJS query contract');
const query=new Function(`return (${match[1]})`)();

function fixture({wrongRequest=false, requestBrazil=false}={}){
  globalThis.window=globalThis;
  const components=[];
  const listeners=new Map();
  const makeField=(id,initial='')=>{
    const field={itemId:id,xtype:'textfield',hidden:false,value:initial,
      isVisible(){return true;},getValue(){return this.value;},
      getRawValue(){return this.value instanceof Date
        ?`${this.value.getHours()}:${String(this.value.getMinutes()).padStart(2,'0')}`:String(this.value);},
      setValue(value){this.value=value;},checkChange(){},focus(){},isValid(){return true;},fireEvent(){}};
    components.push(field);return field;
  };
  for(const id of ['txtSnImei','cdvDefectType','cdvRepairedCode','cdvDepartmentNew','cdvAreaNew',
    'cdvLineCodeNew','cdvProdModel','cdvDefectCode'])makeField(id);
  for(const root of ['dteFromDate','dteToDate']){
    makeField(root);makeField(root+'__Date');makeField(root+'__Time','00:00');
    makeField(root+'__Data','2026-03-31 23:59:59');
  }
  const store={pageSize:100,proxy:{extraParams:{}},currentPage:1,
    getProxy(){return this.proxy;},getModel(){return {getFields:()=>[
      {name:'repairComment'},{name:'repairUser'},{name:'repairTime'},{name:'defectCode'}]};},
    getAt(){return null;},getRange(){return [];},getTotalCount(){return 0;},isLoading(){return false;},
    on(event,fn){const group=listeners.get(event)||[];group.push(fn);listeners.set(event,group);},
    un(event,fn){listeners.set(event,(listeners.get(event)||[]).filter(v=>v!==fn));},
    emit(event,...args){for(const fn of listeners.get(event)||[])fn(...args);}};
  const button={itemId:'btnView',hidden:false,isVisible:()=>true,
    fireEvent(event){if(event!=='click')return;
      const from=components.find(f=>f.itemId==='dteFromDate__Data').value;
      const to=components.find(f=>f.itemId==='dteToDate__Data').value;
      const params={fromDate:from,toDate:wrongRequest?'2026-03-31 23:59:59':to};
      if(requestBrazil){params.fromDate='01/01/2026 00:00';params.toDate='06/11/2026 23:59';}
      store.proxy.extraParams=params;
      store.emit('beforeload',store,{getParams:()=>({...params})});
      store.emit('load',store,[],true);
    }};
  components.push(button,{itemId:'grdDefectRepair',hidden:false,isVisible:()=>true,getStore:()=>store});
  globalThis.Ext={ComponentManager:{all:{items:components}}};
  return {components,store};
}
const cfg={sn:'TEST',defectType:'',repairCode:'',line:'TAN10103',model:'',defectCode:'',
  dateFrom:'2026-01-01',timeFrom:'00:00',dateTo:'2026-11-06',timeTo:'23:59'};

test('hidden ExtJS backing dates are synchronized before query',async()=>{
  const {components}=fixture();
  const result=await query(cfg);
  assert.equal(result.queryProof.periodVerified,true);
  assert.equal(result.queryProof.actualWindow.to,'2026-11-06 23:59');
  assert.equal(components.find(c=>c.itemId==='dteToDate__Data').value,'2026-11-06 23:59:00');
});

test('actual request with stale March end-date refuses to certify coverage',async()=>{
  fixture({wrongRequest:true});
  await assert.rejects(query(cfg),error=>{
    assert.match(error.message,/3012_QUERY_PERIOD_MISMATCH/);
    assert.match(error.message,/observado 2026-01-01 00:00 -> 2026-03-31 23:59/);
    assert.doesNotMatch(error.message,/TEST/);
    return true;
  });
});

test('known Brazilian date request format is compared as local wall time',async()=>{
  fixture({requestBrazil:true});
  const result=await query(cfg);
  assert.equal(result.queryProof.actualWindow.to,'2026-11-06 23:59');
});
