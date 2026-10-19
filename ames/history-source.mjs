import {LINE_IDS} from './data/contract.mjs';

// History can exist on this workstation before Firebase publication. Never
// mistake a local-only revision for a shared team revision or for Today.
export function createMesHistorySource(sync,client,store){
  const validLine=line=>{if(!LINE_IDS.includes(line))throw Error('Linha inválida');return line;};
  return {
    async list(line){
      validLine(line);
      const localReady=store.agent().status==='connected';
      const [cloud,local]=await Promise.allSettled([
        sync.listHistory(line),
        localReady?client.localHistoryList(line):Promise.resolve([])
      ]);
      const rows=new Map();
      if(cloud.status==='fulfilled'){
        for(const h of cloud.value){
          const key=[h.line_id,h.source_id,h.snapshot_id,h.snapshot_revision].join(':');
          rows.set(key,{...h,history_source:'shared'});
        }
      }
      if(local.status==='fulfilled'){
        for(const h of local.value){
          const key=[h.line_id,h.source_id,h.snapshot_id,h.snapshot_revision].join(':');
          if(!rows.has(key))rows.set(key,{...h,history_source:'local'});
        }
      }
      if(cloud.status==='rejected'&&local.status==='rejected')throw Error('Histórico remoto e local indisponíveis');
      if(!localReady&&cloud.status==='rejected')throw Error('Histórico compartilhado indisponível');
      // No local-only version is evidence that Firebase actually synchronized.
      return [...rows.values()].sort((a,b)=>Date.parse(b.collected_at||'')-Date.parse(a.collected_at||'')||
        Number(b.snapshot_id||0)-Number(a.snapshot_id||0)||
        Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0));
    },
    async open(entry){
      validLine(entry?.line_id);
      if(entry.history_source==='local'){
        if(store.agent().status!=='connected')throw Error('Agente local desconectado; esta revisão ainda não está compartilhada');
        return client.historicalPayload(entry.snapshot_id,entry.line_id);
      }
      return sync.openHistory(entry);
    }
  };
}
