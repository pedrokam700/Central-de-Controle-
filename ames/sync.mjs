import {normalizeCanonical,CANONICAL_SCHEMA} from './data/canonical.mjs';
import {LINE_IDS} from './data/contract.mjs';
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function sanitizeSnapshot(payload){
  normalizeCanonical(payload);
  const allowed=['schema','schema_version','source_id','snapshot_id','snapshot_revision','content_hash','line_id','collected_at','source_view','source_timestamp','summary','datasets','coverage','insights','capabilities'];
  const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!/^_|password|senha|cookie|credential|authorization|token|raw_json|session/i.test(k)).map(([k,v])=>[k,clean(v)])):value;
  return clean(Object.fromEntries(allowed.filter(k=>k in payload).map(k=>[k,payload[k]])));
}
export async function publication(uid,payload){
  const safe=sanitizeSnapshot(payload),text=JSON.stringify(safe),hash=await sha(text);
  const key=await sha(JSON.stringify([safe.source_id,safe.snapshot_id,safe.snapshot_revision,hash]));
  const parts=[];for(let i=0;i<text.length;){let end=Math.min(i+150000,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;parts.push(text.slice(i,end));i=end;}
  const head={schema:CANONICAL_SCHEMA,owner_uid:uid,line_id:safe.line_id,source_id:safe.source_id,snapshot_id:safe.snapshot_id,snapshot_num:Number(safe.snapshot_id),snapshot_revision:safe.snapshot_revision,key,hash,parts:parts.length,collected_at:safe.collected_at};
  return {id:uid+':'+safe.line_id+':'+key,uid,head,parts};
}
export function indexedQueue(){
  let db;
  const open=()=>db||(db=new Promise((resolve,reject)=>{const r=indexedDB.open('central-ames-outbox-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
  const run=async(mode,work)=>{const d=await open();return new Promise((resolve,reject)=>{const t=d.transaction('pending',mode),s=t.objectStore('pending');let value;const r=work(s);r.onsuccess=()=>value=r.result;t.oncomplete=()=>resolve(value);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});};
  return {put:x=>run('readwrite',s=>s.put(x)),remove:id=>run('readwrite',s=>s.delete(id)),list:async uid=>(await run('readonly',s=>s.getAll())).filter(x=>x.uid===uid)};
}
export function createMesSync(store,remote,{queue=indexedQueue(),online=()=>navigator.onLine,changed=()=>{},schedule=setTimeout,unschedule=clearTimeout}={}){
  let uid=null,generation=0,running=false,timer,readTimer,retry=1000,readRetry=1000,unwatch,seen='',headsKey='',readGeneration=0,lastHeads=[];
  const alive=(u,g)=>u===uid&&g===generation;
  const status=patch=>{store.updateAgent({sync:{...(store.agent().sync||{}),...patch}});changed();};
  async function flush(){
    if(!uid||running||!online())return;running=true;const u=uid,g=generation;
    try{
      let entries=await queue.list(u);
      while(entries.length&&alive(u,g)){
      // Drop superseded queued revisions only after the newer head is committed.
      entries.sort((a,b)=>b.head.snapshot_num-a.head.snapshot_num||b.head.snapshot_revision-a.head.snapshot_revision);
      for(const entry of entries){
        if(!alive(u,g))return;
        for(let i=0;i<entry.parts.length;i++){if(!alive(u,g))return;await remote.putPart(u,entry.head,i,entry.parts[i]);}
        if(!alive(u,g))return;await remote.commitHead(u,entry.head);
        if(!alive(u,g))return;await queue.remove(entry.id);
      }
      entries=await queue.list(u);
      }
      retry=1000;if(alive(u,g))status({status:'synchronized',pending:0,error:''});
    }catch(error){if(alive(u,g)){status({status:'pending',error:error.message});unschedule(timer);timer=schedule(flush,retry);retry=Math.min(retry*2,60000);}}
    finally{if(alive(u,g))running=false;}
  }
  async function receive(heads){
    const u=uid,g=generation,read=++readGeneration;
    try{
      const payloads=[];
      for(const h of heads){
        if(!LINE_IDS.includes(h.line_id)||!h.owner_uid||typeof h.owner_uid!=='string'||h.schema!==CANONICAL_SCHEMA)throw Error('Escopo remoto inválido');
        const parts=[];for(let i=0;i<h.parts;i++){if(!alive(u,g)||read!==readGeneration)return;parts.push(await remote.getPart(h.owner_uid,h,i));}
        const text=parts.join('');if(await sha(text)!==h.hash)throw Error('Snapshot remoto incompleto ou alterado');
        const p=JSON.parse(text);if(p.line_id!==h.line_id||p.source_id!==h.source_id||p.snapshot_revision!==h.snapshot_revision||p.snapshot_id!==h.snapshot_id)throw Error('Manifesto remoto divergente');
        normalizeCanonical(p);payloads.push(p);
      }
      if(alive(u,g)&&read===readGeneration){unschedule(readTimer);readRetry=1000;store.replaceSyncedSnapshots(payloads);status({read_status:'ready',read_error:''});}
    }catch(error){if(alive(u,g)&&read===readGeneration){status({read_status:'error',read_error:error.message});unschedule(readTimer);readTimer=schedule(()=>{if(alive(u,g)&&online())receive(lastHeads);},readRetry);readRetry=Math.min(readRetry*2,60000);}}
  }
  return {
    start(user){this.stop();uid=user;const u=uid,g=generation;unwatch=remote.watch(u,heads=>{if(!alive(u,g))return;const key=JSON.stringify(heads.map(h=>[h.line_id,h.owner_uid,h.key]).sort());if(key===headsKey)return;headsKey=key;lastHeads=heads;receive(heads);},error=>{if(alive(u,g))status({read_status:'error',read_error:error.message});});flush();},
    async capture(){
      if(!uid)return;const u=uid,g=generation,payloads=store.localCanonical();
      const signature=JSON.stringify(payloads.map(p=>[p.source_id,p.snapshot_id,p.snapshot_revision,p.content_hash]));if(signature===seen)return;
      for(const p of payloads){const entry=await publication(u,p);if(!alive(u,g))return;await queue.put(entry);}
      if(!alive(u,g))return;seen=signature;status({status:'pending',pending:(await queue.list(u)).length});flush();
    },
    retry(){if(uid&&lastHeads.length)receive(lastHeads);return flush();},
    stop(){generation++;readGeneration++;uid=null;running=false;seen='';headsKey='';lastHeads=[];unwatch?.();unwatch=null;unschedule(timer);unschedule(readTimer);retry=readRetry=1000;store.replaceSyncedSnapshots([]);}
  };
}
