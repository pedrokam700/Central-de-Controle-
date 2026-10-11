import {classifyCoraExternalRoute,assertCoraExternalRequest} from './cora-egress-transport.mjs';

export const CORA_NETWORK_BOUNDARY_SCHEMA='central-cora-network-boundary-v1';

const normalizedMethod=value=>String(value||'GET').trim().toUpperCase();
const normalizedOrigin=value=>{
  try{return new URL(String(value||'https://central.invalid')).origin;}catch{throw new TypeError('CORA request origin is invalid');}
};
const resolvedTarget=(value,origin)=>{
  const raw=String(value||'').trim();
  if(!raw)throw new TypeError('CORA request URL is required');
  const base=normalizedOrigin(origin);
  let url;
  try{url=new URL(raw,base+'/');}catch{throw new TypeError('CORA request URL is invalid');}
  if(!['http:','https:'].includes(url.protocol))throw new TypeError('CORA request URL protocol is not allowed');
  return {url,base};
};
const blocked=(code,message,details)=>{
  const error=new Error(message);
  error.code=code;
  error.boundary=details;
  return error;
};
const normalizedApprovedOrigins=value=>Object.freeze([...new Set((Array.isArray(value)?value:[]).map(item=>normalizedOrigin(item)))]);

export function classifyCoraNetworkTarget(url,{origin='https://central.invalid',method='GET'}={}){
  const {url:target,base}=resolvedTarget(url,origin);
  const verb=normalizedMethod(method);
  const route=classifyCoraExternalRoute(target.pathname,{method:verb});
  if(!route.known)return Object.freeze({schema:CORA_NETWORK_BOUNDARY_SCHEMA,permitted:false,boundary:'blocked_unknown_route',sameOrigin:target.origin===base,targetOrigin:target.origin,targetUrl:target.href,method:verb,route});
  if(route.mode==='blocked_method')return Object.freeze({schema:CORA_NETWORK_BOUNDARY_SCHEMA,permitted:false,boundary:'blocked_method',sameOrigin:target.origin===base,targetOrigin:target.origin,targetUrl:target.href,method:verb,route});
  if(target.origin===base)return Object.freeze({schema:CORA_NETWORK_BOUNDARY_SCHEMA,permitted:true,boundary:'same_origin_application',sameOrigin:true,targetOrigin:target.origin,targetUrl:target.href,method:verb,route,providerEgressPermitted:false});
  return Object.freeze({schema:CORA_NETWORK_BOUNDARY_SCHEMA,permitted:false,boundary:'external_unapproved',sameOrigin:false,targetOrigin:target.origin,targetUrl:target.href,method:verb,route,providerEgressPermitted:false});
}

export function assertCoraNetworkRequest({url,origin='https://central.invalid',method='GET',payload,sanitized=false,approvedExternalOrigins=[]}={}){
  const base=classifyCoraNetworkTarget(url,{origin,method});
  if(base.boundary==='blocked_unknown_route')throw blocked('cora/network-route-not-allowlisted','CORA request blocked: route is not allowlisted',base);
  if(base.boundary==='blocked_method')throw blocked('cora/network-method-not-allowlisted','CORA request blocked: method is not allowlisted',base);
  if(base.boundary==='same_origin_application')return base;

  const approved=normalizedApprovedOrigins(approvedExternalOrigins);
  if(!approved.includes(base.targetOrigin))throw blocked('cora/external-origin-not-approved','CORA external request blocked: destination origin is not approved',base);

  // Reuse the stricter provider-egress route and payload policy only after the
  // destination origin itself has been explicitly approved.
  const external=assertCoraExternalRequest({path:new URL(base.targetUrl).pathname,method:base.method,payload,sanitized});
  return Object.freeze({...base,permitted:true,boundary:'approved_external_provider',providerEgressPermitted:true,externalPolicy:external,approvedExternalOrigins:approved});
}

const sensitiveHeader=name=>/^(?:authorization|cookie|proxy-authorization|x-firebase-auth|x-api-key)$/i.test(String(name||'').trim());
const entries=headers=>{
  if(headers instanceof Headers)return [...headers.entries()];
  if(Array.isArray(headers))return headers;
  if(headers&&typeof headers==='object')return Object.entries(headers);
  return [];
};

export function assertCoraNetworkHeaders(headers,{boundary}={}){
  const copy={};
  for(const [name,value] of entries(headers)){
    if(boundary==='approved_external_provider'&&sensitiveHeader(name))throw blocked('cora/external-auth-header-blocked','CORA external request blocked: application authentication header cannot leave same-origin backend',{boundary,header:String(name).toLowerCase()});
    copy[name]=value;
  }
  return Object.freeze(copy);
}

export function prepareCoraNetworkRequest({url,origin='https://central.invalid',method='GET',payload,sanitized=false,approvedExternalOrigins=[],headers}={}){
  const policy=assertCoraNetworkRequest({url,origin,method,payload,sanitized,approvedExternalOrigins});
  const safeHeaders=assertCoraNetworkHeaders(headers,{boundary:policy.boundary});
  return Object.freeze({schema:CORA_NETWORK_BOUNDARY_SCHEMA,url:policy.targetUrl,method:policy.method,payload,headers:safeHeaders,policy});
}
