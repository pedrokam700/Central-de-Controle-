import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDebouncedAction} from '../ames/ui-scheduler.mjs';

function clock(){
  let id=0;const pending=new Map();
  return {
    schedule(fn,delay){const key=++id;pending.set(key,{fn,delay});return key;},
    cancel(key){pending.delete(key);},
    run(){const batch=[...pending.values()];pending.clear();for(const item of batch)item.fn();},
    size(){return pending.size;},
    delays(){return [...pending.values()].map(x=>x.delay);},
  };
}

test('debounce coalesces rapid input and keeps only the latest arguments',()=>{
  const c=clock(),calls=[];
  const action=createDebouncedAction((...args)=>calls.push(args),140,{schedule:c.schedule,cancel:c.cancel});
  action.schedule('c');action.schedule('ca');action.schedule('camera');
  assert.equal(c.size(),1);assert.deepEqual(c.delays(),[140]);
  c.run();assert.deepEqual(calls,[['camera']]);assert.equal(action.pending(),false);
});

test('flush executes pending work once and cancel/dispose never leak a late callback',()=>{
  const c=clock(),calls=[];
  const action=createDebouncedAction(value=>calls.push(value),140,{schedule:c.schedule,cancel:c.cancel});
  action.schedule('first');action.flush();assert.deepEqual(calls,['first']);assert.equal(c.size(),0);
  action.schedule('cancelled');action.cancel();c.run();assert.deepEqual(calls,['first']);
  action.schedule('disposed');action.dispose();c.run();action.schedule('ignored');assert.deepEqual(calls,['first']);
});

test('delay is bounded to avoid accidental multi-second UI stalls',()=>{
  const c=clock();
  createDebouncedAction(()=>{},99999,{schedule:c.schedule,cancel:c.cancel}).schedule();
  assert.deepEqual(c.delays(),[1000]);
});
