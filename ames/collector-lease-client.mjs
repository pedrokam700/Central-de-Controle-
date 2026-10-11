import {
  COLLECTOR_LEASE_SCHEMA,validateCollectorIdentity,validateLeaseLine,fencingToken
} from './data/collector-authority.mjs';

const permissionDenied=error=>['permission-denied','firestore/permission-denied'].includes(String(error?.code||''));

function remoteLease(current,line){
  if(!current||typeof current!=='object')throw new Error('Lease remoto ausente/inválido');
  if(current.schema!==COLLECTOR_LEASE_SCHEMA)throw new Error('Lease remoto incompatível');
  if(validateLeaseLine(current.line_id)!==line)throw new Error('Lease remoto aponta para outra linha');
  validateCollectorIdentity(current.workstation_id);
  const generation=Number(current.generation);
  if(!Number.isInteger(generation)||generation<1)throw new Error('Geração remota inválida');
  return {...current,generation};
}

function unavailable(error){
  const wrapped=new Error('Linha possui outro coletor autorizado ou lease ainda ativo.');
  wrapped.code='collector/lease-unavailable';
  wrapped.cause=error;
  return wrapped;
}

export function createCollectorLeaseClient({doc,runTransaction,getDoc,serverTimestamp,db,currentUid,workstationId}={}){
  for(const [name,value] of Object.entries({doc,runTransaction,getDoc,serverTimestamp})){
    if(typeof value!=='function')throw new TypeError(`${name} obrigatório para collector lease client`);
  }
  if(!db)throw new TypeError('db obrigatório para collector lease client');
  if(typeof currentUid!=='function')throw new TypeError('currentUid obrigatório para collector lease client');
  const workstation=validateCollectorIdentity(workstationId);

  const session=()=>{
    const uid=String(currentUid()||'').trim();
    if(!uid)throw new Error('Sessão autenticada obrigatória para lease');
    return uid;
  };
  const leaseRef=line=>doc(db,'amesLineLeases',validateLeaseLine(line));

  async function transact(line,{forceTakeover=false,onProposal}={}){
    const normalizedLine=validateLeaseLine(line),uid=session(),ref=leaseRef(normalizedLine);
    return runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(ref);
      const current=snapshot.exists()?remoteLease(snapshot.data(),normalizedLine):null;
      let action,generation,acquiredAt;
      if(!current){
        action='acquire';generation=1;acquiredAt=serverTimestamp();
      }else{
        const same=current.owner_uid===uid&&current.workstation_id===workstation;
        if(same&&!forceTakeover){
          action='renew';generation=current.generation;acquiredAt=current.acquired_at;
        }else{
          action='takeover';generation=current.generation+1;acquiredAt=serverTimestamp();
        }
      }
      const proposal=Object.freeze({
        action,generation,line_id:normalizedLine,owner_uid:uid,workstation_id:workstation,
        fence:fencingToken({line:normalizedLine,generation,workstationId:workstation})
      });
      onProposal?.(proposal);
      transaction.set(ref,{
        schema:COLLECTOR_LEASE_SCHEMA,
        line_id:normalizedLine,
        owner_uid:uid,
        workstation_id:workstation,
        generation,
        acquired_at:acquiredAt,
        renewed_at:serverTimestamp(),
        status:'active'
      });
      return proposal;
    });
  }

  async function claim(line){
    let firstProposal=null;
    try{
      return await transact(line,{onProposal:proposal=>{firstProposal=proposal;}});
    }catch(error){
      // If Rules reject a renewal, server time proved that the prior lease expired.
      // The same workstation may then retry exactly once with generation+1.
      if(permissionDenied(error)&&firstProposal?.action==='renew'){
        try{return await transact(line,{forceTakeover:true});}
        catch(retryError){if(permissionDenied(retryError))throw unavailable(retryError);throw retryError;}
      }
      if(permissionDenied(error))throw unavailable(error);
      throw error;
    }
  }

  async function status(line){
    const normalizedLine=validateLeaseLine(line),snapshot=await getDoc(leaseRef(normalizedLine));
    if(!snapshot.exists())return null;
    const current=remoteLease(snapshot.data(),normalizedLine),uid=session();
    return Object.freeze({
      ...current,
      owned_by_this_session:current.owner_uid===uid&&current.workstation_id===workstation,
      fence:fencingToken({line:normalizedLine,generation:current.generation,workstationId:current.workstation_id})
    });
  }

  return Object.freeze({
    claim,
    status,
    workstation_id:workstation,
    activation:'lease-client-ready-head-enforcement-disabled'
  });
}
