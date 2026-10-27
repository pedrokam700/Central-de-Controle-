// Participant in Issue57's existing external maintenance transaction. No UI,
// listener or automatic startup. Keys arrive only on a pre-established private
// test/enrollment channel; never use the workstation/browser/MES token.
const encoder=new TextEncoder();
const canonical=body=>JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(k=>[k,body[k]])));
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const validHex=(x,n)=>typeof x==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(x);
export async function createBrowserMaintenanceParticipant({key,binding,evidence,inspect,readClaim}){
  if(!validHex(key,64)||!validHex(binding?.transaction_id,32)||!validHex(binding?.installation_sha256,64)||!validHex(binding?.scope_id,64)||
     !evidence?.persistent_claim_held||!evidence.remote_publication_fence_held||!evidence.cooperative_fence_held||evidence.pending_entries!==0||
     canonical(evidence.transaction)!==canonical(binding)||typeof inspect!=='function'||typeof readClaim!=='function')throw Error('browser_enrollment_unproven');
  const secret=await crypto.subtle.importKey('raw',Uint8Array.from(key.match(/../g),x=>parseInt(x,16)),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  let sequence=0,closed=false;
  return Object.freeze({
    disconnect(){closed=true;}, // Persistent claim is intentionally retained.
    async handle(wire){
      try{
        if(closed||typeof wire!=='string'||encoder.encode(wire).length>4096)throw Error();
        const envelope=JSON.parse(wire),request=envelope.body;
        if(Object.keys(envelope).sort().join(',')!=='body,mac'||!validHex(envelope.mac,64)||!request||
           Object.keys(request).sort().join(',')!=='challenge,installation_sha256,operation,schema,scope_id,sequence,transaction_id')throw Error();
        const signature=Uint8Array.from(envelope.mac.match(/../g),x=>parseInt(x,16));
        if(!await crypto.subtle.verify('HMAC',secret,signature,encoder.encode('browser-request\0'+canonical(request)))||
           request.schema!=='ames-browser-enrollment-v1'||request.operation!=='attest'||request.sequence!==sequence+1||
           !Number.isSafeInteger(request.sequence)||!validHex(request.challenge,64)||
           Object.keys(binding).some(k=>binding[k]!==request[k]))throw Error();
        const claim=await readClaim(),state=await inspect();
        if(claim?.schema!=='ames-browser-maintenance-claim-v1'||Object.keys(binding).some(k=>claim[k]!==binding[k])||
           claim.update_authorized!==false||state.pending_entries!==0||!state.observation_stable||
           state.uploads_inflight||state.captures_inflight||state.reads_inflight)throw Error();
        sequence=request.sequence;
        const body={...request,pending_entries:0,persistent_claim_held:true,writers_fenced:true,all_profiles_attested:false,update_authorized:false};
        const mac=hex(await crypto.subtle.sign('HMAC',secret,encoder.encode('browser-response\0'+canonical(body))));
        return JSON.stringify({body,mac});
      }catch{closed=true;throw Error('browser_enrollment_recovery_required');}
    }
  });
}
