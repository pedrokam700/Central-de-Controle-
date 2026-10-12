export const FIREBASE_BROWSER_SDK_VERSION='10.8.0';
export const FIREBASE_BROWSER_SDK_URLS=Object.freeze([
  `https://www.gstatic.com/firebasejs/${FIREBASE_BROWSER_SDK_VERSION}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_BROWSER_SDK_VERSION}/firebase-auth.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_BROWSER_SDK_VERSION}/firebase-firestore.js`
]);
export const FIREBASE_SDK_PREPARATION_SCHEMA='central-firebase-sdk-preparation-v1';

const javascriptResponse=response=>{
  if(!response||response.ok===false||response.redirected===true)return false;
  const type=String(response.headers?.get?.('content-type')||'');
  return /(?:javascript|ecmascript)/i.test(type);
};

export async function evaluateFirebaseSdkPreparation({cachesRef=globalThis.caches}={}){
  if(!cachesRef||typeof cachesRef.match!=='function'){
    return Object.freeze({
      schema:FIREBASE_SDK_PREPARATION_SCHEMA,
      version:FIREBASE_BROWSER_SDK_VERSION,
      source:'cache_storage_current_origin',
      supported:false,
      prepared:false,
      cached:0,
      required:FIREBASE_BROWSER_SDK_URLS.length,
      missing:Object.freeze([...FIREBASE_BROWSER_SDK_URLS]),
      invalid:Object.freeze([])
    });
  }
  const missing=[],invalid=[];
  let cached=0;
  for(const url of FIREBASE_BROWSER_SDK_URLS){
    let response=null;
    try{response=await cachesRef.match(url);}catch{}
    if(!response){missing.push(url);continue;}
    if(!javascriptResponse(response)){invalid.push(url);continue;}
    cached++;
  }
  return Object.freeze({
    schema:FIREBASE_SDK_PREPARATION_SCHEMA,
    version:FIREBASE_BROWSER_SDK_VERSION,
    source:'cache_storage_current_origin',
    supported:true,
    prepared:cached===FIREBASE_BROWSER_SDK_URLS.length&&missing.length===0&&invalid.length===0,
    cached,
    required:FIREBASE_BROWSER_SDK_URLS.length,
    missing:Object.freeze(missing),
    invalid:Object.freeze(invalid)
  });
}
