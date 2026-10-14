const CANONICAL_CENTRAL='https://central-cora-v2.vercel.app/Central-de-Controle-/';
const LOCAL_CONSOLE='http://127.0.0.1:8765/Central-de-Controle-/';
const MARKER='from_mes_local';

export function canonicalCentralUrl(){
  const url=new URL(CANONICAL_CENTRAL);
  url.searchParams.set(MARKER,'1');
  return url.href;
}

export function localConsoleUrl(){return LOCAL_CONSOLE;}
export function isMesRoundtrip(location=globalThis.location){
  try{return new URLSearchParams(location?.search||'').get(MARKER)==='1';}catch{return false;}
}

export function installLocalConsoleReturn(document=globalThis.document,location=globalThis.location){
  if(!document||!isMesRoundtrip(location))return false;
  if(document.querySelector('[data-local-console-return]'))return true;
  const en=(document.documentElement?.lang||'').startsWith('en');
  const link=document.createElement('a');
  link.href=LOCAL_CONSOLE;
  link.className='button secondary central-local-console-return';
  link.dataset.localConsoleReturn='';
  link.textContent=en?'Back to local MES Console':'Voltar ao Console MES local';
  link.setAttribute('aria-label',link.textContent);
  const host=document.querySelector('.topbar .topbar-actions,.topbar-actions,.topbar,.main-nav');
  if(host)host.append(link);
  else{
    link.style.cssText='position:fixed;top:12px;left:12px;z-index:10000;text-decoration:none';
    (document.body||document.documentElement).append(link);
  }
  return true;
}

function bootReturn(){
  if(!isMesRoundtrip())return;
  if(installLocalConsoleReturn())return;
  const observer=new MutationObserver(()=>{if(installLocalConsoleReturn())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootReturn,{once:true});
  else bootReturn();
}
