// CLEAN entry: local Console is independent of Central account/network services.
if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('Local workstation requires loopback');
if(new URLSearchParams(location.search).has('online')){
  const url=new URL(location.href);url.searchParams.delete('online');url.hash='';
  const en=(localStorage.getItem('controleFalhas.language.v1')||'').startsWith('en');
  for(const host of [document.querySelector('.main-nav'),document.querySelector('#loginForm')]){
    if(!host)continue;
    const back=document.createElement('a');back.href=url.href;back.className='button secondary';back.dataset.localConsoleReturn='';back.textContent=en?'Open local MES Console':'Abrir Console MES local';
    if(host.matches('form'))host.before(back);else host.append(back);
  }
  // Full native app, with its existing Auth and persistent cache. No local home substitute.
  try{await import('../offline-bootstrap.mjs?v=15.1.13.49');}
  catch(error){
    const status=document.querySelector('#authLoginStatus');
    if(status){status.textContent=en?'Central could not load. Check the connection or return to the local MES Console.':'A Central não carregou. Verifique a conexão ou volte ao Console MES local.';status.className='auth-status error';}
    const button=document.querySelector('#loginButton');if(button)button.disabled=true;
    window.__centralAppImportError=String(error.message||error);
  }
}else await import('./local-workstation.mjs');
