import {prepareCoraNetworkRequest} from './cora-network-boundary.mjs';

export const CORA_BROWSER_TRANSPORT_SCHEMA='central-cora-browser-transport-v1';

export function createCoraBrowserTransport({fetcher,getOrigin,getToken=async()=>null}={}){
  if(typeof fetcher!=='function')throw new TypeError('CORA browser transport requires fetcher');
  if(typeof getOrigin!=='function')throw new TypeError('CORA browser transport requires getOrigin');
  if(typeof getToken!=='function')throw new TypeError('CORA browser transport requires getToken');

  async function request(url,options={}){
    const method=String(options.method||'GET').toUpperCase();
    let payload;
    if(Object.prototype.hasOwnProperty.call(options,'body')){
      if(typeof options.body!=='string')throw new Error('CORA request body must be JSON text.');
      try{payload=JSON.parse(options.body);}catch{throw new Error('CORA request body must contain valid JSON.');}
    }
    const prepared=prepareCoraNetworkRequest({
      url,
      origin:String(getOrigin()||''),
      method,
      payload,
      sanitized:false,
      approvedExternalOrigins:[],
      headers:options.headers||{}
    });
    const next={...options,method,headers:prepared.headers};
    if(payload===undefined)delete next.body;
    else next.body=JSON.stringify(prepared.payload);
    return fetcher(prepared.url,next);
  }

  async function postJSON(url,payload){
    const token=await getToken();
    const headers={'Content-Type':'application/json'};
    if(token)headers.Authorization=`Bearer ${token}`;
    const response=await request(url,{method:'POST',headers,body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    return data;
  }

  return Object.freeze({schema:CORA_BROWSER_TRANSPORT_SCHEMA,fetch:request,postJSON});
}
