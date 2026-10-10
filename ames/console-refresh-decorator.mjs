export function withAgentRefresh(view,root,store,client,{label='Atualizar leitura'}={}){
  function decorate(){
    let bar=root.querySelector('[data-native-refresh-bar]');
    if(!bar){
      bar=document.createElement('div');
      bar.dataset.nativeRefreshBar='1';
      bar.className='ames-native-refresh-bar';
      bar.innerHTML=`<button type="button" class="button secondary" data-native-refresh>${label}</button><span data-native-refresh-status></span>`;
      root.prepend(bar);
      bar.querySelector('[data-native-refresh]').addEventListener('click',async event=>{
        const button=event.currentTarget,status=bar.querySelector('[data-native-refresh-status]');
        button.disabled=true;status.textContent='Atualizando snapshot local...';
        try{await client.refresh();status.textContent='Leitura atualizada.';}
        catch(error){status.textContent=error.message;}
        finally{button.disabled=store.agent().status!=='connected';}
      });
    }
    const button=bar.querySelector('[data-native-refresh]');
    button.disabled=store.agent().status!=='connected';
  }
  return Object.freeze({render(){view.render();decorate();},clear(){view.clear?.();}});
}
