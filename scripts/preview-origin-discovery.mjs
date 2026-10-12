import process from 'node:process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

function args(argv){
  const out={repository:'',pr:''};
  for(let i=0;i<argv.length;i++){
    const value=argv[i];
    if(value==='--repository')out.repository=argv[++i]||'';
    else if(value==='--pr')out.pr=argv[++i]||'';
    else throw Error(`Argumento desconhecido: ${value}`);
  }
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(out.repository))throw Error('--repository inválido');
  if(!/^\d+$/.test(String(out.pr)))throw Error('--pr deve ser numérico');
  return out;
}

export function normalizeVercelPreview(value){
  try{
    const url=new URL(String(value||''));
    const hostname=url.hostname.toLowerCase();
    if(url.protocol!=='https:')return null;
    if(url.username||url.password||url.search||url.hash)return null;
    if(url.pathname!==''&&url.pathname!=='/')return null;
    if(!hostname.endsWith('.vercel.app'))return null;
    const prefix=hostname.slice(0,-'.vercel.app'.length);
    if(!prefix||prefix.includes('..'))return null;
    return `https://${hostname}`;
  }catch{return null;}
}

export function extractVercelPreview(comments){
  if(!Array.isArray(comments))return null;
  for(let i=comments.length-1;i>=0;i--){
    const comment=comments[i];
    if(comment?.user?.login!=='vercel[bot]')continue;
    const body=String(comment?.body||'');
    // Extract the complete URL token first. Never truncate a lookalike host
    // such as preview.vercel.app.evil.example into an apparently valid origin.
    const matches=body.match(/https?:\/\/[^\s)\]<>"']+/gi)||[];
    for(const candidate of matches){
      const normalized=normalizeVercelPreview(candidate);
      if(normalized)return normalized;
    }
  }
  return null;
}

export async function discoverVercelPreview({repository,pr,fetcher=fetch,token=process.env.GITHUB_TOKEN||''}={}){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository||'')))return null;
  if(!/^\d+$/.test(String(pr||'')))return null;
  const endpoint=`https://api.github.com/repos/${repository}/issues/${pr}/comments?per_page=100`;
  const headers={
    Accept:'application/vnd.github+json',
    'User-Agent':'Central-Quality-Gate/1.0',
    'X-GitHub-Api-Version':'2022-11-28'
  };
  if(token)headers.Authorization=`Bearer ${token}`;
  try{
    const response=await fetcher(endpoint,{headers,redirect:'error'});
    if(!response.ok)return null;
    const comments=await response.json();
    return extractVercelPreview(comments);
  }catch{return null;}
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  try{
    const options=args(process.argv.slice(2));
    const origin=await discoverVercelPreview({repository:options.repository,pr:options.pr});
    if(origin)process.stdout.write(origin+'\n');
  }catch(error){
    console.error(`PREVIEW_DISCOVERY_WARN ${error.message}`);
    process.exitCode=0;
  }
}
