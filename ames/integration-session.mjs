import {createAgentClient} from './agent-client.mjs';
import {createMesSync} from './sync.mjs';

// Lifecycle of the existing client and publisher, owned by the authenticated
// Central session, not a view. This only reads SQLite snapshots; it never starts MES jobs.
export function createMesIntegration(store, remote, {changed=()=>{}, transport={}, syncOptions={}, schedule=setTimeout, unschedule=clearTimeout, interval=15000}={}) {
  let active=false, uid=null, generation=0, timer;
  const notify=()=>{if(active)changed();};
  const sync=createMesSync(store,remote,{...syncOptions,changed:notify});
  const capture=()=>sync.capture().catch(error=>{
    if(active){store.updateAgent({sync:{...store.agent().sync,status:'error',error:error.message}});notify();}
  });
  const client=createAgentClient(store,{...transport,changed(){if(active){notify();void capture();}}});
  async function tick(g){
    if(!active||g!==generation)return;
    try{
      if(store.agent().status==='connected')await client.refresh();
      else if(client.paired())await client.connect({quiet:true});
      if(active&&g===generation){sync.ensureOperationalDay();await capture();}
    }catch{ /* client owns local diagnostics; cloud reading remains independent */ }
    finally{if(active&&g===generation)timer=schedule(()=>tick(g),interval);}
  }
  return {
    client,sync,
    start(user){
      if(active&&uid===user)return;
      this.stop();active=true;uid=user;sync.start(user);void tick(generation);
    },
    async verify(){
      if(!active)return;
      // A missing local agent must not suppress the independent Firebase retry.
      return Promise.allSettled([sync.retry(),store.agent().status==='connected'?client.refresh():client.connect({quiet:true})]);
    },
    stop(){active=false;uid=null;generation++;unschedule(timer);client.clear();sync.stop();}
  };
}
