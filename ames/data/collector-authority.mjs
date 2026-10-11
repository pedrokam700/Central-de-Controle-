import {LINE_IDS} from './operational-registry.mjs';

export const COLLECTOR_LEASE_SCHEMA='central-collector-lease-v1';
export const COLLECTOR_LEASE_TTL_MS=10*60*1000;
const WS_RE=/^ws_[0-9a-f]{32}$/;

export function validateCollectorIdentity(value){
  const id=String(value||'').trim().toLowerCase();
  if(!WS_RE.test(id))throw new Error('workstation_id inválido');
  return id;
}

export function validateLeaseLine(value){
  const line=String(value||'').trim().toUpperCase();
  if(!LINE_IDS.includes(line))throw new Error('Linha MES inválida para lease');
  return line;
}

export function leasePath(line){
  return ['amesLineLeases',validateLeaseLine(line)];
}

export function leaseExpiryMs(current){
  const renewed=Number(current?.renewed_at_ms);
  if(!Number.isFinite(renewed))throw new Error('renewed_at remoto inválido');
  return renewed+COLLECTOR_LEASE_TTL_MS;
}

export function classifyLease(current,{uid,workstationId,nowMs=Date.now()}={}){
  const owner=String(uid||'').trim();
  const workstation=validateCollectorIdentity(workstationId);
  const now=Number(nowMs);
  if(!owner)throw new Error('UID obrigatório para lease');
  if(!Number.isFinite(now))throw new Error('Relógio inválido para classificação local');
  if(!current)return Object.freeze({action:'acquire',generation:1,reason:'vacant'});
  if(current.schema!==COLLECTOR_LEASE_SCHEMA)throw new Error('Lease remoto incompatível');
  const generation=Number(current.generation);
  if(!Number.isInteger(generation)||generation<1)throw new Error('Geração remota inválida');
  const expires=leaseExpiryMs(current);
  const same=current.owner_uid===owner&&current.workstation_id===workstation;
  if(same&&expires>now)return Object.freeze({action:'renew',generation,reason:'same_collector',expires_at_ms:expires});
  if(expires<=now)return Object.freeze({action:'takeover',generation:generation+1,reason:'expired',expired_at_ms:expires});
  return Object.freeze({action:'blocked',generation,reason:'held_by_other_collector',holder:{owner_uid:current.owner_uid,workstation_id:current.workstation_id,expires_at_ms:expires}});
}

export function fencingToken({line,generation,workstationId}){
  const normalizedLine=validateLeaseLine(line);
  const normalizedWs=validateCollectorIdentity(workstationId);
  const gen=Number(generation);
  if(!Number.isInteger(gen)||gen<1)throw new Error('Geração de fencing inválida');
  return `${normalizedLine}:${gen}:${normalizedWs}`;
}

export function isStaleFence(candidate,current){
  if(!candidate||!current)return true;
  if(validateLeaseLine(candidate.line_id)!==validateLeaseLine(current.line_id))return true;
  if(validateCollectorIdentity(candidate.workstation_id)!==validateCollectorIdentity(current.workstation_id))return true;
  return Number(candidate.generation)!==Number(current.generation);
}

export function leaseContract(){
  return Object.freeze({
    schema:COLLECTOR_LEASE_SCHEMA,
    ttl_ms:COLLECTOR_LEASE_TTL_MS,
    authority:'firestore_request_time_plus_fixed_ttl',
    activation:'contract_only_not_enforced_on_mes_heads',
    semantics:Object.freeze({
      acquire:'generation=1 when line has no lease; acquired_at/renewed_at use server timestamp',
      renew:'same owner_uid + workstation_id keeps generation and refreshes renewed_at with server timestamp',
      expiry:'renewed_at(server) + fixed 10 minute TTL; client clock never decides authority',
      takeover:'only after server-derived expiry and increments generation',
      fencing:'MES publication will later require exact current generation + workstation_id'
    })
  });
}
