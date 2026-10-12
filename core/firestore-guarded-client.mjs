import {assertFirestoreWriteAllowed} from './firestore-write-policy.mjs';

export const FIRESTORE_GUARDED_CLIENT_SCHEMA='central-firestore-guarded-client-v1';

function requireFunction(name,value){
  if(typeof value!=='function')throw new TypeError(`Guarded Firestore client requires ${name}`);
  return value;
}

export function createGuardedFirestoreClient({
  rawAddDoc,
  rawSetDoc,
  rawUpdateDoc,
  rawDeleteDoc,
  rawWriteBatch,
  getActorUid,
  getCapabilities
}={}){
  requireFunction('rawAddDoc',rawAddDoc);
  requireFunction('rawSetDoc',rawSetDoc);
  requireFunction('rawUpdateDoc',rawUpdateDoc);
  requireFunction('rawDeleteDoc',rawDeleteDoc);
  requireFunction('rawWriteBatch',rawWriteBatch);
  requireFunction('getActorUid',getActorUid);
  requireFunction('getCapabilities',getCapabilities);

  const assertWrite=(reference,operation)=>assertFirestoreWriteAllowed({
    path:reference?.path||'',
    operation,
    actorUid:String(getActorUid()||''),
    capabilities:getCapabilities()||null
  });

  const client={
    addDoc(reference,data){
      assertWrite(reference,'create');
      return rawAddDoc(reference,data);
    },
    setDoc(reference,data,options){
      assertWrite(reference,'set');
      return options===undefined?rawSetDoc(reference,data):rawSetDoc(reference,data,options);
    },
    updateDoc(reference,...args){
      assertWrite(reference,'update');
      return rawUpdateDoc(reference,...args);
    },
    deleteDoc(reference){
      assertWrite(reference,'delete');
      return rawDeleteDoc(reference);
    },
    writeBatch(database){
      const raw=rawWriteBatch(database);
      if(!raw||typeof raw.set!=='function'||typeof raw.update!=='function'||typeof raw.delete!=='function'||typeof raw.commit!=='function'){
        throw new TypeError('Guarded Firestore client received invalid batch');
      }
      const guarded={
        set(reference,data,options){
          assertWrite(reference,'set');
          options===undefined?raw.set(reference,data):raw.set(reference,data,options);
          return guarded;
        },
        update(reference,...args){
          assertWrite(reference,'update');
          raw.update(reference,...args);
          return guarded;
        },
        delete(reference){
          assertWrite(reference,'delete');
          raw.delete(reference);
          return guarded;
        },
        commit(){ return raw.commit(); }
      };
      return guarded;
    }
  };

  return Object.freeze({schema:FIRESTORE_GUARDED_CLIENT_SCHEMA,...client});
}
