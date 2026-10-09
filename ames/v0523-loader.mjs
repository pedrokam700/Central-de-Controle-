const PARTS=Object.freeze({
  html:['ames-offline-v2.html.part1.b64','ames-offline-v2.html.part2.b64'],
  css:['ames-offline-v2.css.part1.b64','ames-offline-v2.css.part2.b64'],
  js:['ames-offline-v2.js.part1.b64','ames-offline-v2.js.part2.b64','ames-offline-v2.js.part3.b64','ames-offline-v2.js.part4.b64','ames-offline-v2.js.part5.b64']
});

const base=new URL('./v0523/',import.meta.url);

async function source(kind){
  const texts=await Promise.all(PARTS[kind].map(async name=>{
    const response=await fetch(new URL(name,base),{cache:'no-store'});
    if(!response.ok)throw new Error(`Asset V0.5.23 indisponível: ${name}`);
    return (await response.text()).trim();
  }));
  const binary=atob(texts.join(''));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(typeof DecompressionStream!=='function')throw new Error('Este navegador não suporta a descompactação necessária para a UI V0.5.23.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

function shadowDocument(shadow){
  return Object.freeze({
    getElementById:id=>shadow.getElementById(id),
    querySelector:selector=>shadow.querySelector(selector),
    querySelectorAll:selector=>shadow.querySelectorAll(selector),
    createElement:(...args)=>document.createElement(...args),
    body:document.body,
    referrer:location.href
  });
}

export async function mountV0523(root,{onBack=()=>{}}={}){
  const previousStyle=root.getAttribute('style');
  root.style.position='fixed';root.style.inset='0';root.style.zIndex='1200';root.style.padding='0';root.style.margin='0';root.style.overflow='hidden';root.style.background='#f4f4f2';
  root.replaceChildren();
  const shadow=root.shadowRoot||root.attachShadow({mode:'open'});
  shadow.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;background:#f4f4f2;font:14px system-ui">Carregando interface A-MES V0.5.23…</div>';
  const timers=new Set(),intervals=new Set();
  const later=(fn,ms,...args)=>{const id=setTimeout(()=>{timers.delete(id);fn(...args)},ms);timers.add(id);return id};
  const every=(fn,ms,...args)=>{const id=setInterval(fn,ms,...args);intervals.add(id);return id};
  let error=null;
  try{
    const [html,rawCss,js]=await Promise.all([source('html'),source('css'),source('js')]);
    const parsed=new DOMParser().parseFromString(html,'text/html');
    parsed.querySelectorAll('script,link[rel="stylesheet"]').forEach(node=>node.remove());
    const css=rawCss.replace(/^:root\s*\{/m,':host{').replace(/html,body\s*\{/m,':host{');
    shadow.innerHTML=`<style>:host{display:block;position:absolute;inset:0;overflow:auto;background:#f4f4f2}${css}</style>${parsed.body.innerHTML}`;
    const doc=shadowDocument(shadow);
    const run=new Function('document','location','history','alert','fetch','setInterval','setTimeout','clearInterval','clearTimeout',`"use strict";\n${js}\n//# sourceURL=ames-offline-v2-v0523.js`);
    run(doc,location,history,alert,fetch.bind(window),every,later,clearInterval,clearTimeout);
    const back=shadow.getElementById('backCentral');
    if(back)back.onclick=event=>{event?.preventDefault?.();onBack();};
    shadow.querySelector('.sidebar-foot')?.insertAdjacentHTML('beforeend','<br><span style="color:#6f9cbb">Baseline visual V0.5.23 · integração R12</span>');
  }catch(caught){
    error=caught;
    const safe=String(caught?.message||caught).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    shadow.innerHTML=`<style>:host{display:block;position:absolute;inset:0;background:#f4f4f2;font-family:Inter,system-ui,sans-serif}.fail{width:min(680px,calc(100vw - 32px));margin:10vh auto;background:#fff;border:1px solid #dededb;border-radius:12px;padding:22px;box-shadow:0 8px 26px rgba(0,0,0,.05)}button{border:0;border-radius:8px;background:#111;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}</style><div class="fail"><h2>Console MES V0.5.23</h2><p>Não foi possível carregar a interface canônica.</p><pre style="white-space:pre-wrap">${safe}</pre><button id="back">Voltar à Central</button></div>`;
    shadow.getElementById('back')?.addEventListener('click',onBack);
  }
  const cleanup=()=>{
    for(const id of timers)clearTimeout(id);
    for(const id of intervals)clearInterval(id);
    timers.clear();intervals.clear();shadow.replaceChildren();
    if(previousStyle===null)root.removeAttribute('style');else root.setAttribute('style',previousStyle);
  };
  return {shadow,error,cleanup};
}
