// Firebase primitives are injected from the shell's existing app/Auth instance.
const LINES=Object.freeze(['TAN10101','TAN10102','TAN10103']);
const validLine=line=>{if(!LINES.includes(line))throw Error('Linha MES inválida');return line;};
const collectedAt=head=>{const t=Date.parse(head?.collected_at||'');return Number.isFinite(t)?t:0;};
function compareHead(a,b){
  const time=collectedAt(a)-collectedAt(b);if(time)return time;
  const rev=(Number(a?.snapshot_num)||0)-(Number(b?.snapshot_num)||0);if(rev)return rev;
  const sub=(Number(a?.snapshot_revision)||0)-(Number(b?.snapshot_revision)||0);if(sub)return sub;
  return String(a?.key||'').localeCompare(String(b?.key||''));
}
export function firestoreTransport({db,auth,doc,collection,getDoc,setDoc,onSnapshot,runTransaction}){
  const session=()=>{const uid=auth.currentUser?.uid;if(!uid)throw Error('Sessão de sincronização encerrada');return uid;};
  const ownerScope=(uid,line)=>{if(session()!==uid)throw Error('Sessão de sincronização encerrada');return ['amesUsers',uid,'lines',validLine(line)];};
  const readableScope=(ownerUid,line)=>{session();if(!ownerUid||typeof ownerUid!=='string')throw Error('Publicador MES inválido');return ['amesUsers',ownerUid,'lines',validLine(line)];};
  const ownerPart=(uid,h,i)=>doc(db,...ownerScope(uid,h.line_id),'snapshots',h.key,'parts',String(i));
  const readablePart=(ownerUid,h,i)=>doc(db,...readableScope(ownerUid,h.line_id),'snapshots',h.key,'parts',String(i));
  const teamHead=line=>doc(db,'amesTeamLines',validLine(line));
  return {
    async putPart(uid,h,i,data){const ref=ownerPart(uid,h,i);await setDoc(ref,{owner_uid:uid,line_id:h.line_id,key:h.key,index:i,data});},
    async getPart(ownerUid,h,i){const row=await getDoc(readablePart(ownerUid,h,i));if(!row.exists())throw Error('Parte remota ausente');return row.data().data;},
    async commitHead(uid,head){
      const ref=doc(db,...ownerScope(uid,head.line_id)),shared=teamHead(head.line_id);
      await runTransaction(db,async transaction=>{
        ownerScope(uid,head.line_id);
        // Todas as leituras antecedem as escritas para manter compatibilidade com Firestore.
        const old=await transaction.get(ref),oldShared=await transaction.get(shared);
        let accepted=true,writeOwner=true;
        if(old.exists()){
          const value=old.data();if(value.source_id!==head.source_id)throw Error('Esta linha pertence a outra instalação. Use o migration helper para preservar a identidade da base.');
          if(value.snapshot_num>head.snapshot_num||value.snapshot_num===head.snapshot_num&&value.snapshot_revision>head.snapshot_revision){accepted=false;writeOwner=false;}
          else if(value.snapshot_num===head.snapshot_num&&value.snapshot_revision===head.snapshot_revision){if(value.hash!==head.hash)throw Error('Conflito de conteúdo na mesma revisão');writeOwner=false;}
        }
        if(!accepted)return;
        if(writeOwner)transaction.set(ref,head);
        const teamValue=oldShared.exists()?oldShared.data():null;
        // Um snapshot que ficou na fila offline não substitui evidência coletada depois.
        if(!teamValue||compareHead(head,teamValue)>0||teamValue.owner_uid===uid&&teamValue.key===head.key)transaction.set(shared,head);
      });
    },
    watch(uid,receive,error){
      if(session()!==uid)throw Error('Sessão de sincronização encerrada');
      const heads=new Map(),loaded=new Set();
      const unsub=LINES.map(line=>onSnapshot(teamHead(line),s=>{loaded.add(line);if(s.exists())heads.set(line,s.data());else heads.delete(line);if(loaded.size===LINES.length)receive([...heads.values()]);},error));
      return ()=>unsub.forEach(stop=>stop());
    }
  };
}
