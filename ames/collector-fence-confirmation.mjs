import {normalizePublicationFence} from './data/publication-fence.mjs';
import {validateLeaseLine} from './data/collector-authority.mjs';

export const COLLECTOR_FENCE_CONFIRMATION_SCHEMA='central-collector-fence-confirmation-v1';

const result=(line,status,extra={})=>Object.freeze({
  schema:COLLECTOR_FENCE_CONFIRMATION_SCHEMA,
  line_id:validateLeaseLine(line),
  status,
  authoritative:false,
  publication_fence:null,
  ...extra
});

export function createCollectorFenceConfirmation({leaseClient}={}){
  if(!leaseClient||typeof leaseClient.confirmOwned!=='function')throw new TypeError('leaseClient.confirmOwned obrigatório');

  async function confirm(observation){
    const line=validateLeaseLine(observation?.line_id);
    if(observation?.status!=='same_workstation_candidate'){
      return result(line,'not_candidate',{reason:'observer_did_not_match_same_workstation'});
    }
    try{
      const confirmed=await leaseClient.confirmOwned(line);
      const fence=normalizePublicationFence(confirmed,{line,ownerUid:confirmed.owner_uid});
      return result(line,'confirmed',{
        authoritative:true,
        reason:'server_accepted_same_generation_renewal',
        publication_fence:fence
      });
    }catch(error){
      if(['collector/lease-not-current','collector/lease-not-owned'].includes(String(error?.code||''))){
        return result(line,'not_confirmed',{reason:'server_did_not_confirm_current_ownership'});
      }
      return result(line,'unavailable',{reason:'confirmation_unavailable'});
    }
  }

  return Object.freeze({
    confirm,
    activation:'gated_same_workstation_confirmation_no_claim_no_takeover_runtime_not_wired'
  });
}
