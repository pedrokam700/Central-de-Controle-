import {
  fencingToken,isStaleFence,validateCollectorIdentity,validateLeaseLine
} from './collector-authority.mjs';

export const PUBLICATION_FENCE_SCHEMA='central-mes-publication-fence-v1';

export function normalizePublicationFence(value,{line,ownerUid}={}){
  if(!value||typeof value!=='object')throw new Error('Fence de publicação ausente/inválido');
  const lineId=validateLeaseLine(value.line_id);
  if(line!=null&&lineId!==validateLeaseLine(line))throw new Error('Fence de publicação aponta para outra linha');
  const workstationId=validateCollectorIdentity(value.workstation_id);
  const generation=Number(value.generation);
  if(!Number.isInteger(generation)||generation<1)throw new Error('Geração de publicação inválida');
  const owner=String(value.owner_uid||'').trim();
  if(!owner)throw new Error('owner_uid obrigatório no fence de publicação');
  if(ownerUid!=null&&owner!==String(ownerUid).trim())throw new Error('Fence de publicação pertence a outro usuário');
  const expected=fencingToken({line:lineId,generation,workstationId});
  const supplied=String(value.fence||value.token||expected);
  if(supplied!==expected)throw new Error('Token de fencing divergente');
  return Object.freeze({
    schema:PUBLICATION_FENCE_SCHEMA,
    line_id:lineId,
    owner_uid:owner,
    workstation_id:workstationId,
    generation,
    fence:expected
  });
}

export function publicationFenceStatus(candidate,currentLease,{ownerUid}={}){
  if(candidate==null)return Object.freeze({status:'unfenced',authoritative:false,reason:'publication_has_no_fence'});
  const normalized=normalizePublicationFence(candidate,{ownerUid});
  if(!currentLease)return Object.freeze({status:'unknown',authoritative:false,reason:'current_lease_unavailable',fence:normalized});
  const current={
    line_id:validateLeaseLine(currentLease.line_id),
    workstation_id:validateCollectorIdentity(currentLease.workstation_id),
    generation:Number(currentLease.generation)
  };
  if(!Number.isInteger(current.generation)||current.generation<1)throw new Error('Geração remota inválida');
  const currentOwner=String(currentLease.owner_uid||'').trim();
  const stale=currentOwner!==normalized.owner_uid||isStaleFence(normalized,current);
  return Object.freeze({
    status:stale?'stale':'current',
    authoritative:!stale,
    reason:stale?'lease_generation_or_owner_mismatch':'matches_current_lease',
    fence:normalized
  });
}

export function publicationFenceContract(){
  return Object.freeze({
    schema:PUBLICATION_FENCE_SCHEMA,
    activation:'metadata_ready_runtime_enforcement_disabled',
    semantics:Object.freeze({
      binding:'line_id + owner_uid + workstation_id + generation + deterministic fencing token',
      unfenced:'legacy/current runtime publication remains allowed until physical multi-PC gate',
      stale:'detectable against the current lease but not yet blocked by MES head transport',
      takeover:'new generation produces a distinct fenced publication identity'
    })
  });
}
