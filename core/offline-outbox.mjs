const DB_NAME='central-trabalho-offline';
const DB_VERSION=2;
const STORE='outbox-v2';
const LEGACY_STORE='queue';
const FALLBACK_KEY='central.offline.outbox.v2';
const LEGACY_FALLBACK_KEY='centralAI.offline.queue.v1';
const SCHEMA='central-offline-outbox-v2';
const ALLOWED_COLLECTIONS=Object.freeze(['reports','operationalFailures']);

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uidValue=value=>typeof value==='string'?value.trim():'';
const collectionValue=value=>typeof value==='string'?value.trim():'';
const idValue=value=>typeof value==='string'?value.trim():'';
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));

function validateItem(item){
  if(!plain(item)||item.schema!==SCHEMA)throw new TypeError('Outbox schema inválido');
  if(!uidValue(item.uid))throw new TypeError('Outbox exige UID');
  if(!ALLOWED_COLLECTIONS.includes(item.collection))throw new TypeError('Coleção offline não autorizada');
  if(!idValue(item.documentId)||!idValue(item.operationId)||!idValue(item.id))throw new TypeError('Identidade offline incompleta');
  if(!plain(item.payload))throw new TypeError('Payload offline inválido');
  return item;
}

export function createBrowserOutboxStorage({indexedDB:dbApi=globalThis.indexedDB,localStorage:local=globalThis.localStorage}={}){
  let dbPromise=null;
  const open=()=>{
    if(!dbApi)throw new Error('IndexedDB indisponível');
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=dbApi.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
        // LEGACY_STORE is deliberately not mutated or deleted. Its rows have no
        // trustworthy UID and therefore cannot be replayed automatically.
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('IndexedDB open failed'));
      request.onblocked=()=>reject(new Error('IndexedDB migration blocked'));
    });
    return dbPromise;
  };
  const run=async(mode,action)=>{
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
      let result;
      try{result=action(store);}catch(error){reject(error);return;}
      let value;
      if(result){result.onsuccess=()=>{value=result.result;};result.onerror=()=>reject(result.error||new Error('IndexedDB request failed'));}
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));
      tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
    });
  };
  const fallbackRead=()=>{
    if(!local)return [];
    const raw=local.getItem(FALLBACK_KEY);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))throw new Error('Fallback offline v2 corrompido');
    return parsed;
  };
  const fallbackWrite=items=>{
    if(!local)throw new Error('Armazenamento offline persistente indisponível');
    local.setItem(FALLBACK_KEY,JSON.stringify(items));
  };
  const fallbackPut=item=>{
    const rows=fallbackRead().filter(row=>row?.id!==item.id);rows.push(item);fallbackWrite(rows);
  };
  const fallbackRemove=id=>fallbackWrite(fallbackRead().filter(row=>row?.id!==id));
  const fallbackList=()=>fallbackRead();
  const legacyIndexedCount=async()=>{
    if(!dbApi)return 0;
    try{
      const db=await open();
      if(!db.objectStoreNames.contains(LEGACY_STORE))return 0;
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(LEGACY_STORE,'readonly'),req=tx.objectStore(LEGACY_STORE).count();
        req.onsuccess=()=>resolve(Number(req.result)||0);req.onerror=()=>reject(req.error);
      });
    }catch{return 0;}
  };
  return Object.freeze({
    async put(item){try{return await run('readwrite',store=>store.put(item));}catch(error){fallbackPut(item);return item.id;}},
    async list(){let primary=[];try{primary=await run('readonly',store=>store.getAll())||[];}catch{}let fallback=[];try{fallback=fallbackList();}catch(error){throw error;}return [...new Map([...primary,...fallback].filter(row=>row?.id).map(row=>[row.id,row])).values()];},
    async remove(id){let primaryError=null;try{await run('readwrite',store=>store.delete(id));}catch(error){primaryError=error;}if(local){try{fallbackRemove(id);}catch(error){if(primaryError)throw new AggregateError([primaryError,error],'Falha ao remover item offline');throw error;}}else if(primaryError)throw primaryError;},
    async legacyCount(){let count=await legacyIndexedCount();if(local){try{const raw=local.getItem(LEGACY_FALLBACK_KEY);const parsed=raw?JSON.parse(raw):[];if(Array.isArray(parsed))count+=parsed.length;}catch{count+=1;}}return count;}
  });
}

export function createOfflineOutbox({storage=createBrowserOutboxStorage(),now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}){
  if(!storage||typeof storage.put!=='function'||typeof storage.list!=='function'||typeof storage.remove!=='function')throw new TypeError('Storage offline inválido');
  const locks=new Map();
  const enqueue=async({uid,collection,payload,operationId,documentId}={})=>{
    uid=uidValue(uid);collection=collectionValue(collection);
    if(!uid)throw new Error('Sessão obrigatória para salvar offline');
    if(!ALLOWED_COLLECTIONS.includes(collection))throw new Error('Coleção não autorizada para offline');
    if(!plain(payload))throw new TypeError('Payload offline deve ser objeto');
    const op=idValue(operationId)||idValue(uuid());
    if(!op)throw new Error('Não foi possível gerar operationId');
    const doc=idValue(documentId)||`offline-${op}`;
    const item=validateItem({schema:SCHEMA,id:`${uid}:${collection}:${doc}`,uid,collection,documentId:doc,operationId:op,payload:clone(payload),createdAt:Number(now()),attempts:0,lastError:'',status:'pending'});
    await storage.put(item);return Object.freeze(clone(item));
  };
  const pending=async uid=>{
    uid=uidValue(uid);if(!uid)return [];
    const rows=await storage.list();
    return rows.filter(row=>row?.schema===SCHEMA&&row.uid===uid).map(validateItem).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id)).map(row=>Object.freeze(clone(row)));
  };
  const ack=async(uid,id)=>{
    uid=uidValue(uid);id=idValue(id);if(!uid||!id)throw new Error('ACK offline inválido');
    const rows=await storage.list(),item=rows.find(row=>row?.id===id);
    if(!item)return false;
    validateItem(item);if(item.uid!==uid)throw new Error('ACK recusado: item pertence a outro usuário');
    await storage.remove(id);return true;
  };
  const markError=async(uid,id,error)=>{
    uid=uidValue(uid);id=idValue(id);const rows=await storage.list(),item=rows.find(row=>row?.id===id);
    if(!item)return false;validateItem(item);if(item.uid!==uid)throw new Error('Retry recusado: item pertence a outro usuário');
    await storage.put({...item,status:'pending',attempts:Number(item.attempts||0)+1,lastError:String(error?.message||error||'erro').slice(0,1000)});return true;
  };
  const replay=({uid,write,sessionIsCurrent=()=>true}={})=>{
    uid=uidValue(uid);if(!uid)return Promise.reject(new Error('Sessão obrigatória para sincronizar offline'));
    if(typeof write!=='function')return Promise.reject(new TypeError('Writer offline obrigatório'));
    if(locks.has(uid))return locks.get(uid);
    const task=(async()=>{
      let synced=0,failed=0,stopped=false;
      const items=await pending(uid);
      for(const item of items){
        if(!sessionIsCurrent()){stopped=true;break;}
        try{
          // Writer must use item.documentId with an idempotent set/upsert.
          await write(item);
          if(!sessionIsCurrent()){stopped=true;break;}
          await ack(uid,item.id);synced++;
        }catch(error){failed++;await markError(uid,item.id,error);break;}
      }
      const remaining=(await pending(uid)).length;
      return Object.freeze({uid,synced,failed,remaining,stopped,legacy_quarantined:await storage.legacyCount()});
    })().finally(()=>locks.delete(uid));
    locks.set(uid,task);return task;
  };
  return Object.freeze({enqueue,pending,ack,replay,legacyPendingCount:()=>storage.legacyCount(),schema:SCHEMA});
}

export const OFFLINE_OUTBOX_SCHEMA=SCHEMA;
export const OFFLINE_OUTBOX_COLLECTIONS=ALLOWED_COLLECTIONS;
