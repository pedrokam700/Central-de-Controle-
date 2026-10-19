import {createAgentClient} from './agent-client.mjs';
import {createMesSync} from './sync.mjs';

// Lifecycle of the existing client and publisher, owned by the authenticated
// Central session, not a view. This only reads SQLite snapshots; it never starts MES jobs.
export function createMesIntegration(store, remote, {changed=()=>{}, transport={}, syncOptions={}, schedule=setTimeout, unschedule=clearTimeout, interval=15000}={}) {
  let active=false, uid=null, generation=0, timer,historyBusy=false,historyCursor=null,lastHistoryScan=0;
  const notify=()=>{if(active)changed();};
  const sync=createMesSync(store,remote,{...syncOptions,changed:notify});
  const capture=()=>sync.capture().catch(error=>{
    if(active){store.updateAgent({sync:{...store.agent().sync,status:'error',error:error.message}});notify();}
  });
  const client=createAgentClient(store,{...transport,changed(){if(active){notify();void capture();}}});
  async function reconcileHistory(g){
    if(historyBusy||!active||g!==generation||store.agent().status!=='connected')return;
    historyBusy=true;
    try{
      const batch=await client.historyCandidates({before:historyCursor,limit:8});
      if(!active||g!==generation)return;
      for(const candidate of batch.candidates){
        if(!active||g!==generation)return;
        const marker=[candidate.line_id,candidate.snapshot_id,candidate.epoch].join(':');
        if(await sync.hasHistoricalMarker(marker))continue;
        try{
          const payload=await client.historicalPayload(candidate.snapshot_id,candidate.line_id);
          if(!active||g!==generation)return;
          if(String(payload.summary?.period?.mode||'')!==String(candidate.mode||'')||
             String(payload.summary?.period?.start_at||'')!==String(candidate.period_start||''))continue;
          await sync.stageHistorical(payload,{marker});
        }catch(error){
          if(active&&g===generation)store.updateAgent({history_sync_warning:'Leitura histórica parcial: '+error.message});
        }
      }
      if(active&&g===generation)historyCursor=batch.next_cursor??null;
    }catch(error){
      if(active&&g===generation)store.updateAgent({history_sync_warning:'Índice histórico indisponível: '+error.message});
    }finally{historyBusy=false;}
  }
  async function tick(g){
    if(!active||g!==generation)return;
    try{
      if(store.agent().status==='connected')await client.refresh();
      else if(client.paired())await client.connect({quiet:true});
      if(active&&g===generation){
        sync.ensureOperationalDay();await capture();
        // SQLite-only index, capped to 8 snapshots per pass. Does not launch MES.
        if(Date.now()-lastHistoryScan>=90000&&!historyBusy){
          lastHistoryScan=Date.now();void reconcileHistory(g);
        }
      }
    }catch{ /* client owns local diagnostics; cloud reading remains independent */ }
    finally{if(active&&g===generation)timer=schedule(()=>tick(g),interval);}
  }
  return {
    client,sync,
    start(user){
      if(active&&uid===user)return;
      this.stop();active=true;uid=user;historyCursor=null;lastHistoryScan=0;sync.start(user);void tick(generation);
    },
    async verify(){
      if(!active)return;
      // A missing local agent must not suppress the independent Firebase retry.
      return Promise.allSettled([sync.retry(),store.agent().status==='connected'?client.refresh():client.connect({quiet:true})]);
    },
    stop(){active=false;uid=null;generation++;historyCursor=null;lastHistoryScan=0;unschedule(timer);client.clear();sync.stop();}
  };
}
