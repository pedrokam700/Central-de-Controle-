// Issue #57 — non-destructive update detection. A web-shell SHA is NOT an agent version.
// Only the agent itself can advertise the pairing contract it actually runs.
export const PAIRING_CONTRACT_REVISION = 4;
export const OFFICIAL_UPDATE_HELP = 'https://github.com/pedrokam700/Central-de-Controle-/issues/57';

export function classifyWorkstationReady(ready) {
  if (ready?.ok !== true || ready?.ready !== true ||
      ready.agent_version !== '0.5.23' ||
      !Number.isInteger(ready.pid) || ready.pid <= 0 ||
      typeof ready.agent_build !== 'string' || !ready.agent_build.startsWith('CANONICAL-'))
    return Object.freeze({state:'unknown'});
  const revision=ready.workstation_pairing_revision;
  if (ready.workstation_pairing_flow !== 3 || (Number.isInteger(revision) && revision < PAIRING_CONTRACT_REVISION))
    return Object.freeze({state:'outdated',reason:'pairing_contract'});
  if(revision !== PAIRING_CONTRACT_REVISION)
    return Object.freeze({state:'unverified_revision'});
  return Object.freeze({state:'detected'});
}

export function workstationUpdateNotice(probe, connected=false) {
  if(probe?.state === 'outdated')
    return Object.freeze({kind:'agent_update_available',required:true,
      detail:'Agente precisa de atualização segura do pareamento. Não reinstale sobre SQLite.'});
  if(probe?.state === 'unverified_revision')
    return Object.freeze({kind:'revision_unverified',required:false,show:true,
      detail:'O agente responde, mas o contrato de pareamento não tem versão comprovada. Não altere nada sem diagnóstico.'});
  if(probe?.state === 'detected' || connected)
    return Object.freeze({kind:'agent_compatible',required:false,detail:''});
  return Object.freeze({kind:'not_verified',required:false,detail:''});
}
