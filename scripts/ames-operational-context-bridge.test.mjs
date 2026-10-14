import test from 'node:test';
import assert from 'node:assert/strict';
import {installOperationalContextBridge} from '../ames/operational-context-bridge.mjs';

test('newly rendered view adopts the shared operational line',async()=>{
  const listeners=new Map();let dispatched=0;
  const select={
    value:'TAN10101',options:[{value:'TAN10101'},{value:'TAN10102'},{value:'TAN10103'}],
    closest(){return null;},
    dispatchEvent(event){dispatched++;const handler=listeners.get(event.type);handler?.({target:this});return true;}
  };
  const document={
    documentElement:{},__amesOperationalContextBridge:false,
    querySelectorAll(selector){return selector==='[data-failure-line]'?[select]:[];},
    addEventListener(type,handler){listeners.set(type,handler);},
    removeEventListener(type){listeners.delete(type);}
  };
  const updates=[];
  const store={context:()=>({line_id:'TAN10102'}),preferredLine:()=> 'TAN10102',updateContext:patch=>updates.push(patch)};
  const dispose=installOperationalContextBridge(document,store);
  await Promise.resolve();
  assert.equal(select.value,'TAN10102');
  assert.equal(dispatched,1);
  assert.deepEqual(updates.at(-1),{line_id:'TAN10102'});
  dispose();
});

test('user line change updates the same shared context',async()=>{
  const listeners=new Map();
  const select={value:'TAN10103',options:[{value:'TAN10103'}],closest(){return null;},dispatchEvent(){return true;}};
  const document={documentElement:{},querySelectorAll(){return[];},addEventListener(type,handler){listeners.set(type,handler);},removeEventListener(type){listeners.delete(type);}};
  const updates=[];const store={context:()=>({line_id:'TAN10102'}),preferredLine:()=> 'TAN10102',updateContext:patch=>updates.push(patch)};
  const dispose=installOperationalContextBridge(document,store);
  listeners.get('change')({target:{closest:()=>select}});
  assert.deepEqual(updates.at(-1),{line_id:'TAN10103'});
  dispose();
});
