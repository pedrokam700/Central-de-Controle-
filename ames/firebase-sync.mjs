// Firebase primitives are injected from the shell's existing app/Auth instance.
export function firestoreTransport({db,auth,doc,collection,getDoc,setDoc,onSnapshot,runTransaction}){
  const scope=(uid,line)=>{if(auth.currentUser?.uid!==uid)throw Error('Sessão de sincronização encerrada');return ['amesUsers',uid,'lines',line];};
  const part=(uid,h,i)=>doc(db,...scope(uid,h.line_id),'snapshots',h.key,'parts',String(i));
  return {
    async putPart(uid,h,i,data){const ref=part(uid,h,i);await setDoc(ref,{owner_uid:uid,line_id:h.line_id,key:h.key,index:i,data});},
    async getPart(uid,h,i){const row=await getDoc(part(uid,h,i));if(!row.exists())throw Error('Parte remota ausente');return row.data().data;},
    async commitHead(uid,head){const ref=doc(db,...scope(uid,head.line_id));await runTransaction(db,async transaction=>{
      scope(uid,head.line_id);const old=await transaction.get(ref);if(old.exists()){
        const value=old.data();if(value.source_id!==head.source_id)throw Error('Esta linha pertence a outra instalação. Use o migration helper para preservar a identidade da base.');
        if(value.snapshot_num>head.snapshot_num||value.snapshot_num===head.snapshot_num&&value.snapshot_revision>head.snapshot_revision)return;
        if(value.snapshot_num===head.snapshot_num&&value.snapshot_revision===head.snapshot_revision){if(value.hash!==head.hash)throw Error('Conflito de conteúdo na mesma revisão');return;}
      }
      transaction.set(ref,head);
    });},
    watch(uid,receive,error){const heads=new Map(),loaded=new Set();const unsub=['TAN10101','TAN10102','TAN10103'].map(line=>onSnapshot(doc(db,...scope(uid,line)),s=>{loaded.add(line);if(s.exists())heads.set(line,s.data());else heads.delete(line);if(loaded.size===3)receive([...heads.values()]);},error));return ()=>unsub.forEach(stop=>stop());}
  };
}
