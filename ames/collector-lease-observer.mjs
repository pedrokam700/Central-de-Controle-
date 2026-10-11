import {validateLeaseLine} from './data/collector-authority.mjs';
import {normalizePublicationFence} from './data/publication-fence.mjs';

export const COLLECTOR_LEASE_OBSERVER_SCHEMA='central-collector-lease-observer-v1';

function observation(line,status,extra={}){
  return Object.freeze({
    schema:COLLECTOR_LEASE_OBSERVER_SCHEMA,
    mode:'observe_only',
    line_id:validateLeaseLine(line),
    status,
    authoritative:false,
    publication_fence:null,
    ...extra
  });
}

export function createCollectorLeaseObserver({leaseClient,onObservation=()=>{}}={}){
  if(!leaseClient||typeof leaseClient.status!=='function')throw new TypeError('leaseClient.status obrigatório para observer');
  if(typeof onObservation!=='function')throw new TypeError('onObservation deve ser função');

  async function observe(line){
    const normalizedLine=validateLeaseLine(line);
    let result;
    try{
      const current=await leaseClient.status(normalizedLine);
      if(!current){
        result=observation(normalizedLine,'vacant',{reason:'no_remote_lease'});
      }else if(current.owned_by_this_session===true){
        const candidate=normalizePublicationFence(current,{line:normalizedLine,ownerUid:current.owner_uid});
        result=observation(normalizedLine,'same_workstation_candidate',{
          reason:'ownership_matches_but_server_expiry_not_proven_by_read',
          candidate_fence:candidate
        });
      }else{
        result=observation(normalizedLine,'held_by_other',{reason:'remote_lease_not_owned_by_this_session'});
      }
    }catch{
      result=observation(normalizedLine,'unavailable',{reason:'lease_read_failed'});
    }
    try{onObservation(result);}catch{}
    return result;
  }

  return Object.freeze({
    observe,
    activation:'observe_only_no_claim_no_publication_fence_no_enforcement'
  });
}
