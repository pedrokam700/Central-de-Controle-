import {assertCoraExternalPayload} from './cora-egress-policy.mjs';

export const CORA_EGRESS_TRANSPORT_SCHEMA='central-cora-egress-transport-v1';

const ROUTES=Object.freeze([
  {pattern:/^\/api\/ai-audit$/,methods:['POST'],mode:'local_only',reason:'audit metadata may contain user and conversation identifiers'},
  {pattern:/^\/api\/ai-memory$/,methods:['POST'],mode:'local_only',reason:'memory corrections and related responses are local-only until a reviewed projection exists'},
  {pattern:/^\/api\/ai-memory\/[^/]+\/promote$/,methods:['POST'],mode:'local_only',reason:'knowledge document identity is local-only until a reviewed projection exists'},
  {pattern:/^\/api\/ai-metrics$/,methods:['GET'],mode:'external_no_payload',reason:'read-only service telemetry request has no client payload'},
  {pattern:/^\/api\/chat-cognitive$/,methods:['POST'],mode:'local_only',reason:'free-form conversation is local-only by policy'},
  {pattern:/^\/api\/failure-analysis$/,methods:['POST'],mode:'structured_external_candidate',reason:'only an explicitly sanitized structured technical projection may leave the browser'},
  {pattern:/^\/api\/failure-analysis\/stream$/,methods:['POST'],mode:'structured_external_candidate',reason:'only an explicitly sanitized structured technical projection may leave the browser'},
  {pattern:/^\/api\/failure-intake$/,methods:['POST'],mode:'local_only',reason:'free text, conversation and images are local-only by policy'},
  {pattern:/^\/api\/families\/rename$/,methods:['POST'],mode:'local_only',reason:'central mutation is not an approved CORA technical egress payload'},
  {pattern:/^\/api\/generate-image$/,methods:['POST'],mode:'local_only',reason:'prompt and image material are local-only until a reviewed projection exists'},
  {pattern:/^\/api\/generate-slides$/,methods:['POST'],mode:'local_only',reason:'slide source content is local-only until a reviewed projection exists'},
  {pattern:/^\/api\/investigation-artifact$/,methods:['POST'],mode:'local_only',reason:'investigation documents, images and conversation are local-only by policy'},
  {pattern:/^\/api\/transcribe-audio$/,methods:['POST'],mode:'local_only',reason:'audio content is local-only until an explicit media egress policy exists'}
]);

const normalizePath=value=>{
  const text=String(value||'').trim();
  if(!text)return '';
  try{return new URL(text,'https://central.invalid').pathname;}catch{return text.split(/[?#]/,1)[0];}
};
const normalizeMethod=value=>String(value||'GET').trim().toUpperCase();

export function classifyCoraExternalRoute(path,{method='GET'}={}){
  const pathname=normalizePath(path);
  const verb=normalizeMethod(method);
  const route=ROUTES.find(item=>item.pattern.test(pathname));
  if(!route)return Object.freeze({schema:CORA_EGRESS_TRANSPORT_SCHEMA,known:false,path:pathname,method:verb,mode:'blocked_unknown',reason:'route_not_allowlisted'});
  if(!route.methods.includes(verb))return Object.freeze({schema:CORA_EGRESS_TRANSPORT_SCHEMA,known:true,path:pathname,method:verb,mode:'blocked_method',reason:'method_not_allowlisted'});
  return Object.freeze({schema:CORA_EGRESS_TRANSPORT_SCHEMA,known:true,path:pathname,method:verb,mode:route.mode,reason:route.reason});
}

function blockedError(code,verdict){
  const error=new Error(`CORA external request blocked by route policy: ${verdict.path||'unknown'}:${verdict.mode}`);
  error.code=code;
  error.routePolicy=verdict;
  return error;
}

export function assertCoraExternalRequest({path,method='GET',payload,sanitized=false}={}){
  const verdict=classifyCoraExternalRoute(path,{method});
  if(verdict.mode==='blocked_unknown')throw blockedError('cora/route-not-allowlisted',verdict);
  if(verdict.mode==='blocked_method')throw blockedError('cora/method-not-allowlisted',verdict);
  if(verdict.mode==='local_only')throw blockedError('cora/route-local-only',verdict);
  if(verdict.mode==='external_no_payload'){
    if(payload!==undefined&&payload!==null)throw blockedError('cora/unexpected-external-payload',verdict);
    return Object.freeze({schema:CORA_EGRESS_TRANSPORT_SCHEMA,permitted:true,route:verdict,payloadPolicy:null});
  }
  if(verdict.mode==='structured_external_candidate'){
    if(payload===undefined||payload===null)throw blockedError('cora/missing-external-payload',verdict);
    const payloadPolicy=assertCoraExternalPayload(payload,{sanitized});
    return Object.freeze({schema:CORA_EGRESS_TRANSPORT_SCHEMA,permitted:true,route:verdict,payloadPolicy});
  }
  throw blockedError('cora/route-policy-invalid',verdict);
}

export function coraExternalRouteInventory(){
  return Object.freeze(ROUTES.map(item=>Object.freeze({methods:Object.freeze([...item.methods]),mode:item.mode,reason:item.reason,pattern:String(item.pattern)})));
}
