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
export function firestoreTransport({db,auth,doc,collection,getDoc,getDocs,setDoc,onSnapshot,runTransaction,query,where}){
  const session=()=>{const uid=auth.currentUser?.uid;if(!uid)throw Error('Sessão de sincronização encerrada');return uid;};
  const ownerScope=(uid,line)=>{if(session()!==uid)throw Error('Sessão de sincronização encerrada');return ['amesUsers',uid,'lines',validLine(line)];};
  const readableScope=(ownerUid,line)=>{session();if(!ownerUid||typeof ownerUid!=='string')throw Error('Publicador MES inválido');return ['amesUsers',ownerUid,'lines',validLine(line)];};
  const ownerPart=(uid,h,i)=>doc(db,...ownerScope(uid,h.line_id),'snapshots',h.key,'parts',String(i));
  const readablePart=(ownerUid,h,i)=>doc(db,...readableScope(ownerUid,h.line_id),'snapshots',h.key,'parts',String(i));
  const teamHead=line=>doc(db,'amesTeamLines',validLine(line));
  return {
    async inspectIdentity(uid,head){
      // Read-only diagnosis. Do not expose UIDs, source IDs, payloads or credentials.
      const [owned,shared]=await Promise.all([getDoc(doc(db,...ownerScope(uid,head.line_id))),getDoc(teamHead(head.line_id))]);
      ownerScope(uid,head.line_id);
      const a=owned.exists()?owned.data():null,b=shared.exists()?shared.data():null;
      return {
        available:true,owner_exists:!!a,owner_source_matches:a?a.source_id===head.source_id:null,
        owner_snapshot_num:a?Number(a.snapshot_num)||null:null,
        shared_exists:!!b,shared_owner_is_current:b?b.owner_uid===uid:null,
        shared_source_matches:b?b.source_id===head.source_id:null,
        shared_snapshot_num:b?Number(b.snapshot_num)||null:null
      };
    },
    async listHistory(line){session();const rows=await getDocs(collection(db,'amesTeamLines',validLine(line),'history'));session();return rows.docs.map(d=>d.data()).sort((a,b)=>compareHead(b,a));},
    async commitHistory(uid,head,metadata){
      ownerScope(uid,head.line_id);
      await setDoc(doc(db,'amesTeamLines',head.line_id,'history',uid+'_'+head.key),{...head,...metadata});
    },
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
    watch(uid,receive,error,{startAt=null}={}){
      if(session()!==uid)throw Error('Sessão de sincronização encerrada');
      const legacy=new Map(),days=new Map(),loaded=new Set(),cached=new Map();
      const useDayIndex=!!(query&&where&&startAt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startAt));
      const required=LINES.length*(useDayIndex?2:1),unsub=[];
      const emit=()=>{if(loaded.size!==required)return;
        receive([...legacy.values(),...[...days.values()].flat()],{from_cache:[...cached.values()].some(Boolean),day_index_available:useDayIndex});
      };
      for(const line of LINES){
        const key='legacy:'+line;
        unsub.push(onSnapshot(teamHead(line),{includeMetadataChanges:true},s=>{
          loaded.add(key);cached.set(key,!!s.metadata?.fromCache||!!s.metadata?.hasPendingWrites);
          if(s.exists())legacy.set(line,s.data());else legacy.delete(line);
          emit();
        },error));
        if(useDayIndex){
          const key='day:'+line;
          const upper=new Date(Date.parse(startAt+'Z')+60000).toISOString().slice(0,16);
          const source=query(collection(db,'amesTeamLines',line,'history'),
            where('period_start','>=',startAt),where('period_start','<',upper));
          unsub.push(onSnapshot(source,{includeMetadataChanges:true},s=>{
            loaded.add(key);cached.set(key,!!s.metadata?.fromCache||!!s.metadata?.hasPendingWrites);
            days.set(line,s.docs.map(d=>d.data()));
            emit();
          },error));
        }
      }
      return ()=>unsub.forEach(stop=>stop());
    }
  };
}
