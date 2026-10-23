import {LINE_IDS} from './data/contract.mjs';
import {factoryWallMinute} from './data/history.mjs';

// A local preference for opening a revision does not negate its presence in
// the immutable Firebase history index. Keep transport and sharing separate.
export function historySharingState(entry){
  if(entry?.history_source==='shared')return 'shared';
  if(entry?.history_source==='local')return entry.shared_available===true?'local_and_shared':'local_only';
  return 'unverified';
}

// This is an index of immutable observations, never an aggregate of defects.
// Two independent collectors can overlap on the same factory production day.
// Only their original source/revision identities may be counted here.
export function summarizeHistoryPublishers(entries=[],line){
  const versions=new Map();
  for(const entry of Array.isArray(entries)?entries:[]){
    if(entry?.line_id!==line||!entry.source_id||entry.snapshot_id==null)continue;
    const key=JSON.stringify([entry.line_id,entry.source_id,entry.snapshot_id,entry.snapshot_revision??null]);
    if(!versions.has(key))versions.set(key,entry);
  }
  const origins=new Map(),days=new Map();
  for(const entry of versions.values()){
    const source_id=String(entry.source_id);
    const origin=origins.get(source_id)||{source_id,revisions:0,last_collected_at:null};
    origin.revisions++;
    if(entry.collected_at&&(!origin.last_collected_at||Date.parse(entry.collected_at)>Date.parse(origin.last_collected_at)))
      origin.last_collected_at=entry.collected_at;
    origins.set(source_id,origin);
    const day=factoryWallMinute(entry.period_start)?.slice(0,10);
    if(day){if(!days.has(day))days.set(day,new Set());days.get(day).add(source_id);}
  }
  return {
    origins:[...origins.values()].sort((a,b)=>a.source_id.localeCompare(b.source_id)),
    overlapping_days:[...days.entries()].filter(([,sources])=>sources.size>1)
      .map(([day,sources])=>({day,source_ids:[...sources].sort()})).sort((a,b)=>b.day.localeCompare(a.day))
  };
}

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
          const shared=rows.get(key);
          if(shared){
            // Same immutable revision may be available through both transports.
            // Prefer the actual local read only when the content and period agree;
            // never mistake a cloud copy for proof of an on-machine SQLite row.
            const fields=['content_hash','period_start','period_end'];
            if(fields.some(field=>shared[field]&&h[field]&&shared[field]!==h[field]))
              throw Error('Conflito de integridade entre revisão local e compartilhada para '+line);
            rows.set(key,{...h,history_source:'local',shared_available:true,
              revision_pending:h.snapshot_revision==null});
          }else rows.set(key,{...h,history_source:'local',
            revision_pending:h.snapshot_revision==null});
        }
      }
      if(cloud.status==='rejected'&&local.status==='rejected')throw Error('Histórico remoto e local indisponíveis');
      // Do not silently render 'not collected' if the on-machine SQLite
      // history API failed but Firebase returned an empty list. This was
      // indistinguishable from a truly empty production day on the factory UI.
      if(localReady&&local.status==='rejected'&&(!Array.isArray(cloud.value)||cloud.value.length===0))
        throw Error('Histórico SQLite local indisponível para '+line+'; verifique /api/v1/local-history');
      if(cloud.status==='rejected'&&local.status==='fulfilled'&&local.value.length===0)
        throw Error('Histórico compartilhado indisponível e nenhuma revisão local identificada; não confirmar ausência de coleta');
      if(!localReady&&cloud.status==='rejected')throw Error('Histórico compartilhado indisponível');
      // No local-only version is evidence that Firebase actually synchronized.
      return [...rows.values()].sort((a,b)=>Date.parse(b.collected_at||'')-Date.parse(a.collected_at||'')||
        Number(b.snapshot_id||0)-Number(a.snapshot_id||0)||
        Number(b.revision_pending===true)-Number(a.revision_pending===true)||
        Number(b.snapshot_revision||0)-Number(a.snapshot_revision||0));
    },
    async open(entry){
      validLine(entry?.line_id);
      if(entry.history_source==='local'){
        if(store.agent().status!=='connected')throw Error('Agente local desconectado; esta revisão ainda não está compartilhada');
        return client.historicalPayload(entry.snapshot_id,entry.line_id,entry.snapshot_revision??null);
      }
      return sync.openHistory(entry);
    }
  };
}
