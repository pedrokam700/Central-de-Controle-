import {normalizeCanonical,CANONICAL_SCHEMA} from './data/canonical.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {historyMetadata} from './data/history.mjs';
import {publicationIntent,factoryWindow,isTodaySnapshot} from './data/operational-period.mjs';
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const syncHeadMetadata=(head,authority='team_latest')=>Object.freeze({
  line_id:head.line_id,
  source_id:String(head.source_id||''),
  snapshot_id:String(head.snapshot_id??''),
  snapshot_revision:Number(head.snapshot_revision)||0,
  collected_at:head.collected_at||null,
  authority
});
const syncHeadsMetadata=(heads,authority='team_latest')=>{
  const remote_heads=heads.map(h=>syncHeadMetadata(h,authority)).sort((a,b)=>a.line_id.localeCompare(b.line_id));
  const latest=remote_heads.map(h=>h.collected_at).filter(Boolean).sort().at(-1)||null;
  return {remote_scope:authority,remote_heads,remote_line_count:remote_heads.length,remote_latest_collected_at:latest};
};
export function sanitizeSnapshot(payload){
  normalizeCanonical(payload);
  const allowed=['schema','schema_version','source_id','snapshot_id','snapshot_revision','content_hash','line_id','collected_at','source_view','source_timestamp','summary','datasets','coverage','insights','capabilities','process_contexts'];
  const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!/^_|password|senha|cookie|credential|authorization|token|^raw$|raw_json|^raw_payload$|details_json|query_meta_json|session|cdp|wi.?fi|secret/i.test(k)).map(([k,v])=>[k,clean(v)])):value;
  return clean(Object.fromEntries(allowed.filter(k=>k in payload).map(k=>[k,payload[k]])));
}
export async function publication(uid,payload,{now=new Date(),productionConfig}={}){
  const safe=sanitizeSnapshot(payload),text=JSON.stringify(safe),hash=await sha(text);
  const key=await sha(JSON.stringify([safe.source_id,safe.snapshot_id,safe.snapshot_revision,hash]));
  const parts=[];for(let i=0;i<text.length;){let end=Math.min(i+150000,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;parts.push(text.slice(i,end));i=end;}
  const head={schema:CANONICAL_SCHEMA,owner_uid:uid,line_id:safe.line_id,source_id:safe.source_id,snapshot_id:safe.snapshot_id,snapshot_num:Number(safe.snapshot_id),snapshot_revision:safe.snapshot_revision,key,hash,parts:parts.length,collected_at:safe.collected_at};
  return {id:uid+':'+safe.line_id+':'+key,uid,head,parts,history:historyMetadata(safe),publish_scope:publicationIntent(safe,now,productionConfig)};
}
export function indexedQueue(){
  let db,markersDb;
  // Preserve the already proven IndexedDB outbox schema/version EXACTLY.
  const open=()=>db||(db=new Promise((resolve,reject)=>{
    const r=indexedDB.open('central-ames-outbox-v2',1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('pending'))r.result.createObjectStore('pending',{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  }));
  // Non-critical metadata is stored independently, never upgrading/locking the
  // factory's pending evidence database during the candidate rollout.
  const openMarkers=()=>markersDb||(markersDb=new Promise((resolve,reject)=>{
    const r=indexedDB.open('central-ames-history-markers-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('sent',{keyPath:'id'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  }));
  const run=async(mode,work,marker=false)=>{const d=await (marker?openMarkers():open());return new Promise((resolve,reject)=>{const t=d.transaction(marker?'sent':'pending',mode),s=t.objectStore(marker?'sent':'pending');let value;const r=work(s);r.onsuccess=()=>value=r.result;t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});};
  return {
    put:x=>run('readwrite',s=>s.put(x)),
    remove:id=>run('readwrite',s=>s.delete(id)),
    list:async uid=>(await run('readonly',s=>s.getAll())).filter(x=>x.uid===uid),
    hasHistory:async id=>!!(await run('readonly',s=>s.get(id),true)),
    markHistory:id=>run('readwrite',s=>s.put({id,at:new Date().toISOString()}),true)
  };
}

export function createMesSync(store,remote,{queue=indexedQueue(),online=()=>navigator.onLine,changed=()=>{},schedule=setTimeout,unschedule=clearTimeout,now=()=>new Date(),productionConfig=()=>({timezone:store.agent().config?.timezone||'America/Sao_Paulo',dayStart:store.agent().config?.production_day_start||store.agent().config?.day_start||'07:00'})}={}){
  let uid=null,generation=0,running=false,timer,readTimer,retry=1000,readRetry=1000,unwatch,seen='',headsKey='',readGeneration=0,lastHeads=[],lastReadMeta={},hasHeads=false,watchFailed=false,watchGeneration=0,capturing=null,identityBlocked=new Map(),uploadedParts=new Set(),remotePayloadCache=new Map(),watchDay='';
  const alive=(u,g)=>u===uid&&g===generation;
  const currentConfig=()=>typeof productionConfig==='function'?productionConfig():productionConfig;
  const entryScope=e=>publicationIntent(JSON.parse(e.parts.join('')),now(),currentConfig());
  const status=patch=>{store.updateAgent({sync:{...(store.agent().sync||{}),...patch}});changed();};
  const clearRemoteStatus=()=>status({status:'idle',pending:null,last_sent:null,last_received_at:null,server_received_at:null,publish_errors:[],error:'',read_status:'idle',read_error:'',remote_scope:'team_latest',remote_heads:[],remote_line_count:0,remote_latest_collected_at:null,identity_blocked:[],last_publish_timing:null});
  async function flush(){
    if(!uid||running)return;running=true;const u=uid,g=generation;
    try{
      let entries=await queue.list(u);
      if(!alive(u,g))return;
      status({pending:entries.length,status:entries.length?'pending':(store.agent().sync?.last_sent?'synchronized':'idle')});
      if(!online())return;
      while(entries.length&&alive(u,g)){
        entries.sort((a,b)=>b.head.snapshot_num-a.head.snapshot_num||b.head.snapshot_revision-a.head.snapshot_revision);
        const errors=[];
        for(const entry of entries){
          let stage='parts',stageAt=Date.now(),partsMs=0,headMs=0,historyMs=0;
          try{
            if(!alive(u,g))return;
            if(!uploadedParts.has(entry.id)){
              for(let i=0;i<entry.parts.length;i+=4){
                if(!alive(u,g))return;
                await Promise.all(entry.parts.slice(i,i+4).map((part,j)=>remote.putPart(u,entry.head,i+j,part)));
              }
              uploadedParts.add(entry.id);
            }
            partsMs=Date.now()-stageAt;stageAt=Date.now();
            // Immutable history is now the authoritative multi-installation
            // transport. Publish it first, before the legacy mutable pointer.
            if(!alive(u,g))return;stage='history';
            if(remote.commitHistory)await remote.commitHistory(u,entry.head,entry.history||historyMetadata(JSON.parse(entry.parts.join(''))));
            historyMs=Date.now()-stageAt;stageAt=Date.now();
            if(!alive(u,g))return;stage='head';
            const scope=entryScope(entry);
            let legacyCommitted=false;
            if(scope==='today'&&!identityBlocked.has(entry.head.line_id)){
              try{await remote.commitHead(u,entry.head);legacyCommitted=true;}
              catch(error){
                if(!/outra instalação|migration helper/i.test(String(error.message||'')))throw error;
                const warning={line_id:entry.head.line_id,stage:'legacy_head',code:'installation_identity_conflict',message:'Cabeçalho legado preservado; revisão imutável publicada para a equipe.'};
                if(remote.inspectIdentity){try{warning.identity=await remote.inspectIdentity(u,entry.head);}catch{warning.identity={available:false};}}
                identityBlocked.set(entry.head.line_id,warning);
              }
            }
            headMs=Date.now()-stageAt;
            if(!alive(u,g))return;await queue.remove(entry.id);uploadedParts.delete(entry.id);if(entry.history_marker&&queue.markHistory)await queue.markHistory(entry.history_marker);if(!alive(u,g))return;
            status({last_sent:{...syncHeadMetadata(entry.head,legacyCommitted?'team_latest':'operational_day_history'),sent_at:new Date().toISOString()},last_publish_timing:{line_id:entry.head.line_id,parts:entry.parts.length,parts_ms:partsMs,head_ms:headMs,history_ms:historyMs,total_ms:partsMs+headMs+historyMs}});
          }catch(error){
            // A permanent error on one line must not block unrelated lines.
            if(!alive(u,g))return;
            const identityConflict=stage==='head'&&/outra instalação|migration helper/i.test(String(error.message||''));
            const item={line_id:entry.head.line_id,stage,code:identityConflict?'installation_identity_conflict':error.code||'',message:error.message};
            if(identityConflict){
              // Requires explicit reconciliation of the original installation.
              // Never discard its queued history, bypass Firestore Rules or retry forever.
              if(remote.inspectIdentity){try{item.identity=await remote.inspectIdentity(u,entry.head);}catch{item.identity={available:false};}}
              identityBlocked.set(entry.head.line_id,item);
            }
            errors.push(item);
          }
        }
        if(!alive(u,g))return;
        entries=await queue.list(u);
        if(!alive(u,g))return;
        const transient=errors.filter(e=>e.code!=='installation_identity_conflict');
        status({pending:entries.length,identity_blocked:[...identityBlocked.keys()],publish_errors:[...identityBlocked.values(),...transient]});
        if(transient.length)throw Error(transient.map(e=>`${e.line_id} / ${e.stage}: ${e.message}`).join('; '));
      }
      retry=1000;
      if(alive(u,g))status({status:identityBlocked.size?'shared_history_legacy_conflict':store.agent().sync?.last_sent?'synchronized':'idle',pending:0,error:'',identity_blocked:[...identityBlocked.keys()],publish_errors:[...identityBlocked.values()]});
    }catch(error){if(alive(u,g)){status({status:'pending',error:error.message});unschedule(timer);timer=schedule(()=>{if(alive(u,g))flush();},retry);retry=Math.min(retry*2,60000);}}
    finally{if(alive(u,g))running=false;}
  }
  async function receive(heads,meta=lastReadMeta){
    const u=uid,g=generation,read=++readGeneration,receivedAt=Date.now();
    try{
      const candidates=meta.day_index_available?heads.filter(h=>h.period_start):heads;
      const byLine=new Map();
      for(const h of candidates){
        if(!LINE_IDS.includes(h.line_id)||!h.owner_uid||typeof h.owner_uid!=='string'||h.schema!==CANONICAL_SCHEMA||!Number.isInteger(h.parts)||h.parts<1||h.parts>5000)throw Error('Escopo remoto inválido');
        if(!byLine.has(h.line_id))byLine.set(h.line_id,[]);
        byLine.get(h.line_id).push(h);
      }
      const payloads=[],selectedHeads=[],originConflictLines=[];
      let downloaded=0,cacheHits=0,skippedVersions=0,downloadMs=0;
      for(const [line,variants] of byLine){
        const recent=variants.sort((a,b)=>Date.parse(b.collected_at||0)-Date.parse(a.collected_at||0)||Number(b.snapshot_num)-Number(a.snapshot_num)||Number(b.snapshot_revision)-Number(a.snapshot_revision));
        const byInstallation=new Map();
        for(const h of recent){
          if(!alive(u,g)||read!==readGeneration)return;
          const installation=h.owner_uid+':'+h.source_id;
          // The day index is append-only. Only its newest verified *live*
          // revision per installation can represent Today. Keep checking other
          // installations so competing producers are never silently hidden.
          if(meta.day_index_available&&byInstallation.has(installation)){
            skippedVersions++;continue;
          }
          const cacheKey=h.owner_uid+':'+h.key;
          let payload=remotePayloadCache.get(cacheKey);
          if(!payload){
            const started=Date.now(),parts=[];
            for(let i=0;i<h.parts;i+=4){
              if(!alive(u,g)||read!==readGeneration)return;
              const batch=await Promise.all(Array.from({length:Math.min(4,h.parts-i)},(_,j)=>remote.getPart(h.owner_uid,h,i+j)));
              parts.push(...batch);
            }
            const body=parts.join('');
            if(await sha(body)!==h.hash)throw Error('Snapshot remoto incompleto ou alterado');
            payload=JSON.parse(body);
            if(payload.line_id!==h.line_id||payload.source_id!==h.source_id||payload.snapshot_revision!==h.snapshot_revision||payload.snapshot_id!==h.snapshot_id)throw Error('Manifesto remoto divergente');
            normalizeCanonical(payload);
            downloaded++;downloadMs+=Date.now()-started;
            remotePayloadCache.set(cacheKey,payload);
            // Avoid retaining an entire production day of large revisional
            // payloads in browser memory. Original evidence remains immutable.
            if(remotePayloadCache.size>24)remotePayloadCache.delete(remotePayloadCache.keys().next().value);
          }else cacheHits++;
          if(!meta.day_index_available||isTodaySnapshot(payload,now(),currentConfig())){
            if(!byInstallation.has(installation))byInstallation.set(installation,{head:h,payload});
          }
        }
        if(!byInstallation.size)continue;
        if(byInstallation.size>1){
          originConflictLines.push(line);continue;
        }
        const selected=byInstallation.values().next().value;
        selectedHeads.push(selected.head);payloads.push(selected.payload);
      }
      if(alive(u,g)&&read===readGeneration){
        unschedule(readTimer);readRetry=1000;
        store.replaceSyncedSnapshots(payloads);
        const stamp=new Date().toISOString();
        status({
          read_status:originConflictLines.length?'origin_conflict':meta.from_cache?'cached':'ready',
          read_error:originConflictLines.length?'Múltiplas instalações publicaram a mesma linha e dia. Nenhuma foi escolhida automaticamente.':'',
          origin_conflict_lines:originConflictLines,
          last_receive_timing:{read_ms:Date.now()-receivedAt,download_ms:downloadMs,
            candidates:candidates.length,downloaded,cache_hits:cacheHits,skipped_versions:skippedVersions},
          last_received_at:stamp,
          ...(!meta.from_cache?{server_received_at:meta.received_at||null}:{}),
          ...syncHeadsMetadata(selectedHeads,meta.day_index_available?'operational_day_history':'team_latest')
        });
      }
    }catch(error){if(alive(u,g)&&read===readGeneration){status({read_status:'error',read_error:error.message});unschedule(readTimer);readTimer=schedule(()=>{if(alive(u,g)&&online())receive(lastHeads,lastReadMeta);},readRetry);readRetry=Math.min(readRetry*2,60000);}}
  }
  function subscribe(){
    if(!uid)return;
    const u=uid,g=generation,w=++watchGeneration;
    unwatch?.();unwatch=null;watchFailed=false;headsKey='';hasHeads=false;lastHeads=[];
    watchDay=factoryWindow(now(),currentConfig()).start_at;
    status({read_status:'connecting',read_error:''});
    const failed=error=>{
      if(!alive(u,g)||w!==watchGeneration)return;
      watchFailed=true;readGeneration++;status({read_status:'error',read_error:error.message});
      unschedule(readTimer);readTimer=schedule(()=>{if(alive(u,g)&&online())subscribe();},readRetry);readRetry=Math.min(readRetry*2,60000);
    };
    try{
      unwatch=remote.watch(u,(heads,meta={})=>{
        if(!alive(u,g)||w!==watchGeneration||watchFailed)return;
        const key=JSON.stringify([heads.map(h=>[h.line_id,h.owner_uid,h.key]).sort(),!!meta.from_cache]);
        if(key===headsKey)return;
        headsKey=key;
        // An empty local Firestore cache cannot revoke previously verified data.
        if(meta.from_cache&&!heads.length&&lastHeads.length){status({read_status:'cached'});return;}
        hasHeads=true;lastHeads=heads;lastReadMeta={...meta,received_at:new Date().toISOString()};void receive(heads,lastReadMeta);
      },failed,{startAt:watchDay});
    }catch(error){failed(error);}
  }
  async function capture(){
    if(!uid)return;
    if(capturing){await capturing;if(!uid)return;return capture();}
    const u=uid,g=generation;
    const work=(async()=>{
      const payloads=store.localCanonical();
      const signature=JSON.stringify(payloads.map(p=>[p.line_id,p.source_id,p.snapshot_id,p.snapshot_revision,p.content_hash]));
      if(signature===seen)return;
      for(const p of payloads){const entry=await publication(u,p,{now:now(),productionConfig:currentConfig()});if(!alive(u,g))return;await queue.put(entry);}
      if(!alive(u,g))return;
      seen=signature;const pending=(await queue.list(u)).length;
      if(alive(u,g)){status({status:pending?'pending':'idle',pending});void flush();}
    })();
    capturing=work;
    try{await work;}finally{if(capturing===work)capturing=null;}
  }
  return {
    async listHistory(line){
      if(!uid||!remote.listHistory)throw Error('History unavailable');
      const u=uid,g=generation,rows=await remote.listHistory(line);
      if(!alive(u,g))throw Error('Session ended');
      if(rows.some(h=>h.line_id!==line||!h.owner_uid||h.schema!==CANONICAL_SCHEMA))throw Error('Invalid history scope');
      return rows;
    },
    async openHistory(h){
      if(!uid||!LINE_IDS.includes(h.line_id)||!h.owner_uid||!Number.isInteger(h.parts)||h.parts<1||h.parts>5000)throw Error('Invalid history scope');
      const u=uid,g=generation,parts=[];
      for(let i=0;i<h.parts;i++){if(!alive(u,g))throw Error('Session ended');parts.push(await remote.getPart(h.owner_uid,h,i));}
      const text=parts.join('');if(await sha(text)!==h.hash)throw Error('Incomplete history');
      const payload=JSON.parse(text);normalizeCanonical(payload);
      if(!alive(u,g)||payload.line_id!==h.line_id||payload.source_id!==h.source_id||payload.snapshot_id!==h.snapshot_id||payload.snapshot_revision!==h.snapshot_revision)throw Error('History mismatch');
      const metadata=historyMetadata(payload);
      if(['period_start','period_end','products'].some(key=>metadata[key]!==h[key]))throw Error('History metadata mismatch');
      return sanitizeSnapshot(payload);
    },
    start(user){this.stop();uid=user;subscribe();void flush();},
    ensureOperationalDay(){if(uid&&factoryWindow(now(),currentConfig()).start_at!==watchDay)subscribe();},
    capture,
    async hasHistoricalMarker(marker){return !!(uid&&queue.hasHistory&&await queue.hasHistory(uid+':'+marker));},
    async stageHistorical(payload,{marker}={}){
      if(!uid)return false;
      const intent=String(payload?.summary?.period?.mode||'').toLowerCase();
      if(!['today','live','monitor_today','previous_day','historical_refresh'].includes(intent))return false;
      if(!payload?.summary?.period?.start_at||!payload?.line_id)return false;
      if(marker&&queue.hasHistory&&await queue.hasHistory(uid+':'+marker))return false;
      const u=uid,g=generation,entry=await publication(u,payload,{now:now(),productionConfig:currentConfig()});
      if(!alive(u,g))return false;
      if(entry.publish_scope!=='history')return false;
      if(marker)entry.history_marker=u+':'+marker;
      await queue.put(entry);
      if(!alive(u,g))return false;
      status({status:'pending',pending:(await queue.list(u)).length});void flush();return true;
    },
    retry(){if(watchFailed)subscribe();else if(uid&&hasHeads)void receive(lastHeads,{...lastReadMeta,from_cache:lastReadMeta.from_cache||!online()});return flush();},
    stop(){generation++;readGeneration++;uid=null;running=false;seen='';headsKey='';lastHeads=[];lastReadMeta={};hasHeads=false;watchFailed=false;watchGeneration++;capturing=null;identityBlocked.clear();uploadedParts.clear();remotePayloadCache.clear();watchDay='';unwatch?.();unwatch=null;unschedule(timer);unschedule(readTimer);retry=readRetry=1000;store.replaceSyncedSnapshots([]);clearRemoteStatus();}
  };
}
