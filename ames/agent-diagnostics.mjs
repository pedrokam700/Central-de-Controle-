import {AGENT_URL} from './data/agent-contract.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const TIMEOUT_MS=5000;

function numberOrNull(value){
  const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}

export function sanitizeHardeningDiagnostics(raw){
  if(!raw||typeof raw!=='object')return null;
  const indexes=raw.performance_indexes&&typeof raw.performance_indexes==='object'?raw.performance_indexes:null;
  const origins=raw.origin_policy&&typeof raw.origin_policy==='object'?raw.origin_policy:null;
  return Object.freeze({
    status:raw.ok===true?'ok':'error',
    level:typeof raw.hardening==='string'?raw.hardening:null,
    integrity:typeof raw.integrity==='string'?raw.integrity.toLowerCase():null,
    schemaVersion:numberOrNull(raw.schema_version),
    performanceIndexes:indexes?Object.freeze({
      ok:indexes.ok===true,
      expected:numberOrNull(indexes.expected),
      present:numberOrNull(indexes.present),
      missing:Array.isArray(indexes.missing)?indexes.missing.map(String).slice(0,32):[],
    }):null,
    originPolicy:origins?Object.freeze({
      ok:origins.ok===true,
      mode:typeof origins.mode==='string'?origins.mode:null,
      localOrigins:numberOrNull(origins.local_origins),
      configuredEntries:numberOrNull(origins.configured_entries),
      remoteOrigins:numberOrNull(origins.remote_origins),
      rejectedEntries:numberOrNull(origins.rejected_entries),
    }):null,
  });
}

function workstationToken(){
  if(typeof window==='undefined')return '';
  try{return String(window.sessionStorage?.getItem(TOKEN_KEY)||'').trim();}catch{return '';}
}

function sameOriginAgent(){
  if(typeof location==='undefined')return false;
  try{return new URL(AGENT_URL).origin===location.origin;}catch{return false;}
}

export async function readHardeningDiagnostics({fetcher=fetch,token=workstationToken()}={}){
  // Remote pages without a workstation token must not probe detailed local
  // diagnostics. The standalone CLEAN is same-origin and remains eligible.
  if(!token&&!sameOriginAgent())return Object.freeze({status:'unavailable',reason:'not_paired'});
  const headers={};if(token)headers['X-Central-Agent-Token']=token;
  try{
    const response=await fetcher(AGENT_URL+'/hardening/health',{
      method:'GET',headers,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(TIMEOUT_MS)
    });
    if(response.status===401)return Object.freeze({status:'unavailable',reason:'unauthorized'});
    if(response.status===404)return Object.freeze({status:'unavailable',reason:'unsupported'});
    if(!response.ok)return Object.freeze({status:'error',reason:`http_${response.status}`});
    const sanitized=sanitizeHardeningDiagnostics(await response.json());
    return sanitized||Object.freeze({status:'error',reason:'invalid_payload'});
  }catch(error){
    if(error?.name==='AbortError')throw error;
    return Object.freeze({status:'unavailable',reason:error?.name==='TimeoutError'?'timeout':'network'});
  }
}
