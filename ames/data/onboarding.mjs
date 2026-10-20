import { immutable } from './contract.mjs';

export const INTEGRATION_MODE_KEY = 'central.ames.integration-mode.v1';
export const integrationMode = value => ['collector', 'viewer'].includes(value) ? value : null;
export function installationDetection(agent={},paired=false){
  if(agent.status==='connected')return 'verified';
  if(agent.connection_error?.code==='agent-unauthorized')return 'pairing_required';
  if(paired)return 'paired_unreachable';
  // A failed HTTPS loopback/CORS/PNA request cannot prove there is no agent.
  return 'not_verified';
}
export function sharingState(agent={}){
  const sync=agent.sync||{},heads=Array.isArray(sync.remote_heads)?sync.remote_heads:[];
  const confirmed=sync.read_status==='ready'&&Boolean(sync.server_received_at);
  const pending=Number.isInteger(sync.pending)?sync.pending:null;
  const conflict=sync.read_status==='origin_conflict'||(sync.origin_conflict_lines||[]).length>0;
  return Object.freeze({
    publishing:agent.status==='connected'&&(pending>0||sync.status==='pending')?'pending':
      sync.status==='synchronized'?'sent':sync.status==='shared_history_legacy_conflict'?'legacy_conflict':'not_confirmed',
    receiving:conflict?'conflict':sync.read_status==='error'?'error':
      sync.read_status==='cached'?'cached':confirmed?'server_confirmed':'not_confirmed',
    pending,receivedLines:heads.filter(x=>x?.line_id&&x?.snapshot_id).map(x=>x.line_id),
    lastSentAt:sync.last_sent?.sent_at||null,
    lastReceivedAt:sync.server_received_at||null
  });
}

function readRuntime(value) {
  if (!value || typeof value !== 'object') return null;
  const agent = new URL(value.agent_health_url);
  if (agent.protocol !== 'http:' || agent.hostname !== '127.0.0.1' || agent.port !== '8765' ||
      agent.pathname !== '/api/v1/health' || agent.search || agent.hash || agent.username || agent.password ||
      value.start_file !== 'INICIAR_POSTO_CENTRAL_V2.bat') throw new TypeError('Runtime local documentado inválido');
  return { agent_health_url: agent.href, start_file: value.start_file };
}
export function readRelease(value) {
  if (!value || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:-rc\d+)?$/.test(value.version)) throw new TypeError('Manifesto de release inválido');
  const available=value.package_available===true;
  let download_url='',package_name='',sha256='';
  if(available){
    if(typeof value.package_name!=='string'||!value.package_name.endsWith('.zip')||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(value.sha256)) throw new TypeError('Pacote publicado inválido');
    const url=new URL(value.download_url);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
      url.hostname!=='github.com'||url.pathname!==
        '/pedrokam700/Central-de-Controle-/releases/download/ames-v0.5.25-factory-20261020/'+value.package_name)
      throw new TypeError('Pacote oficial deve ser GitHub Release verificado');
    download_url=url.href;package_name=value.package_name;sha256=value.sha256;
  }else{
    // Pacote ausente é um estado explícito e fail-closed. Não reutilize o ZIP
    // anterior como se ele contivesse o motor/launcher atual.
    if(value.download_url||value.package_name||value.sha256)throw new TypeError('Manifesto pendente não pode anunciar pacote antigo');
  }
  const existingR12=value.existing_r12_migration===true;
  const validatedSha=typeof value.validated_candidate_sha==='string'&&/^[a-f0-9]{40}$/.test(value.validated_candidate_sha)
    ?value.validated_candidate_sha:null;
  if(available&&(!validatedSha||!package_name.endsWith(validatedSha.slice(0,8)+'.zip')))
    throw new TypeError('Pacote sem commit GitHub confirmado');
  return immutable({version:value.version,package_available:available,package_name,sha256,download_url,validated_sha:validatedSha,
    local_runtime:readRuntime(value.local_runtime),existing_r12_migration:existingR12,
    new_pc_status:typeof value.new_pc_status==='string'?value.new_pc_status:'unknown',
    validated_baseline:typeof value.validated_baseline==='string'?value.validated_baseline:'',
    candidate_status:typeof value.candidate_status==='string'?value.candidate_status:'unknown',
    minimum_central_version:typeof value.minimum_central_version==='string'?value.minimum_central_version:''});
}
