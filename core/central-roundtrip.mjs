const CENTRAL_PATH='/Central-de-Controle-/';
const LEGACY_MARKER='from_mes_local';
const VIEW_PARAM='view';
const CONSOLE_VIEW='mesConsole';

function currentOrigin(location=globalThis.location){
  const origin=location?.origin;
  return origin&&origin!=='null'?origin:'http://127.0.0.1:8765';
}

export function canonicalCentralUrl(location=globalThis.location){
  return new URL(CENTRAL_PATH,currentOrigin(location)).href;
}

export function localConsoleUrl(location=globalThis.location){
  const url=new URL(canonicalCentralUrl(location));
  url.searchParams.set(VIEW_PARAM,CONSOLE_VIEW);
  return url.href;
}

export function isMesRoundtrip(location=globalThis.location){
  try{
    const params=new URLSearchParams(location?.search||'');
    return params.get(VIEW_PARAM)===CONSOLE_VIEW||params.get(LEGACY_MARKER)==='1';
  }catch{return false;}
}

// Backward compatibility only: old CLEAN links may still arrive with
// ?from_mes_local=1. They now select the Console MES view inside the SAME Central
// document. No cross-origin link, second shell or second authentication context is
// created.
export function installLocalConsoleReturn(document=globalThis.document,location=globalThis.location){
  if(!document||!isMesRoundtrip(location))return false;
  const open=()=>{
    const button=document.querySelector('.main-nav [data-page="mesConsole"], [data-page="mesConsole"]');
    if(!button)return false;
    button.click();
    try{
      const url=new URL(location.href||canonicalCentralUrl(location));
      url.searchParams.delete(LEGACY_MARKER);
      url.searchParams.delete(VIEW_PARAM);
      globalThis.history?.replaceState?.(null,'',url.pathname+url.search+url.hash);
    }catch{}
    return true;
  };
  if(open())return true;
  if(typeof MutationObserver==='undefined'||!document.documentElement)return false;
  const observer=new MutationObserver(()=>{if(open())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
  return true;
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  const boot=()=>installLocalConsoleReturn(document,window.location);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}
