(()=>{
  const form=document.querySelector('#loginForm');
  const status=document.querySelector('#authLoginStatus');
  const button=document.querySelector('#loginButton');
  if(!form)return;
  const fail=()=>{
    if(window.__centralLoginModuleReady)return false;
    if(status){status.textContent='A aplicação não carregou completamente neste preview. Recarregue a página ou use um deploy validado.';status.className='auth-status error';}
    if(button){button.disabled=true;button.textContent='Aplicação indisponível';}
    return true;
  };
  form.addEventListener('submit',event=>{if(fail()){event.preventDefault();event.stopImmediatePropagation();}},true);
  setTimeout(fail,5000);
})();
