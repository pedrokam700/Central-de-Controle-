import {AGENT_URL} from './data/agent-contract.mjs';

const TOKEN_KEY='central.ames.agentToken.v1';
const TIMEOUT_MS=5000;

function numberOrNull(value){
  const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}
function workstationToken(){
  if(typeof window==='undefined')return '';
  try{return String(window.sessionStorage?.getItem(TOKEN_KEY)||'').trim();}catch{return '';}
}
function sameOriginAgent(){
  if(typeof location==='undefined')return false;
  try{return new URL(AGENT_URL).origin===location.origin;}catch{return false;}
}

export function sanitize3012Status(raw){
  if(!raw||typeof raw!=='object')return null;
  const local=raw.local&&typeof raw.local==='object'?raw.local:{};
  return Object.freeze({
    status:raw.ok===true?'ok':'error',
    implemented:raw.implemented===true,
    factoryValidated:raw.factory_validated===true,
    amesStartDate:typeof raw.ames_start_date==='string'?raw.ames_start_date:null,
    local:Object.freeze({
      rows:numberOrNull(local.rows),
      pcbas:numberOrNull(local.pcbas),
      repairUsers:numberOrNull(local.repair_users),
      coverageIntervals:numberOrNull(local.coverage_intervals),
      coverageSns:numberOrNull(local.coverage_sns),
      firstEvent:typeof local.first_event==='string'?local.first_event:null,
      lastEvent:typeof local.last_event==='string'?local.last_event:null,
    }),
  });
}

export async function read3012Status({fetcher=fetch,token=workstationToken()}={}){
  if(!token&&!sameOriginAgent())return Object.freeze({status:'unavailable',reason:'not_paired'});
  const headers={};if(token)headers['X-Central-Agent-Token']=token;
  try{
    const response=await fetcher(AGENT_URL+'/3012/status',{
      method:'GET',headers,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(TIMEOUT_MS)
    });
    if(response.status===401)return Object.freeze({status:'unavailable',reason:'unauthorized'});
    if(response.status===404)return Object.freeze({status:'unavailable',reason:'unsupported'});
    if(!response.ok)return Object.freeze({status:'error',reason:`http_${response.status}`});
    return sanitize3012Status(await response.json())||Object.freeze({status:'error',reason:'invalid_payload'});
  }catch(error){
    if(error?.name==='AbortError')throw error;
    return Object.freeze({status:'unavailable',reason:error?.name==='TimeoutError'?'timeout':'network'});
  }
}
