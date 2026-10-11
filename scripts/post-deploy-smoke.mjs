import process from 'node:process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

function args(argv){
  const out={origins:[],sha:'',waitMs:180000,maxRedirects:4};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--origin')out.origins.push(argv[++i]);
    else if(a==='--sha')out.sha=argv[++i]||'';
    else if(a==='--wait-ms')out.waitMs=Number(argv[++i]);
    else if(a==='--max-redirects')out.maxRedirects=Number(argv[++i]);
    else throw Error(`Argumento desconhecido: ${a}`);
  }
  if(!out.origins.length)throw Error('Informe ao menos um --origin');
  if(!/^[0-9a-f]{40}$/i.test(out.sha))throw Error('--sha deve ser SHA Git de 40 hex');
  return out;
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function fetchBounded(url,{maxRedirects=4,fetcher=fetch}={}){
  let current=new URL(url),redirects=0;
  const visited=new Set();
  while(true){
    const key=current.href;
    if(visited.has(key))throw Error(`redirect_loop:${[...visited,key].join(' -> ')}`);
    visited.add(key);
    const response=await fetcher(current,{redirect:'manual',cache:'no-store',headers:{'Cache-Control':'no-cache','User-Agent':'Central-Quality-Gate/1.0'}});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw Error(`redirect_without_location:${response.status}:${current.href}`);
      redirects++;
      if(redirects>maxRedirects)throw Error(`too_many_redirects:${redirects}:${current.href}`);
      current=new URL(location,current);
      continue;
    }
    return {response,url:current.href,redirects,visited:[...visited]};
  }
}

async function probe(origin,expected,{fetcher=fetch,maxRedirects=4}={}){
  const base=String(origin).replace(/\/$/,'');
  const release=await fetchBounded(`${base}/release-build.json?smoke=${Date.now()}`,{fetcher,maxRedirects});
  if(!release.response.ok)throw Error(`release_build_http_${release.response.status}`);
  const releaseType=release.response.headers.get('content-type')||'';
  if(!/json/i.test(releaseType))throw Error(`release_build_not_json:${releaseType}`);
  const manifest=await release.response.json();
  if(String(manifest.sha||'').toLowerCase()!==expected.toLowerCase())throw Error(`sha_mismatch:${manifest.sha||'missing'}`);

  const page=await fetchBounded(`${base}/Central-de-Controle-/`,{fetcher,maxRedirects});
  if(!page.response.ok)throw Error(`central_http_${page.response.status}`);
  const contentType=page.response.headers.get('content-type')||'';
  if(!/text\/html/i.test(contentType))throw Error(`central_not_html:${contentType}`);
  const html=await page.response.text();
  if(!/offline-bootstrap\.mjs/.test(html))throw Error('central_missing_offline_bootstrap');
  if(!/authLogin|Entrar na central|Central de trabalho/i.test(html))throw Error('central_shell_marker_missing');
  if(/ERR_TOO_MANY_REDIRECTS/i.test(html))throw Error('redirect_error_document');

  return {origin:base,sha:manifest.sha,releaseRedirects:release.redirects,pageRedirects:page.redirects,finalUrl:page.url};
}

export async function waitForPreview(origins,expected,{waitMs=180000,maxRedirects=4,fetcher=fetch,log=console.log}={}){
  const deadline=Date.now()+waitMs;
  let last=[];
  do{
    last=[];
    for(const origin of origins){
      try{
        const result=await probe(origin,expected,{fetcher,maxRedirects});
        log(`POST_DEPLOY_OK ${JSON.stringify(result)}`);
        return result;
      }catch(error){
        last.push(`${origin}: ${error.message}`);
      }
    }
    if(Date.now()<deadline)await sleep(5000);
  }while(Date.now()<deadline);
  throw Error(`Nenhum preview publicou e serviu o SHA esperado dentro do limite. ${last.join(' | ')}`);
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  const options=args(process.argv.slice(2));
  waitForPreview(options.origins,options.sha,{waitMs:options.waitMs,maxRedirects:options.maxRedirects})
    .catch(error=>{console.error('POST_DEPLOY_FAIL',error.message);process.exitCode=1;});
}
