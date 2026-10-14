import { LINE_IDS } from './data/contract.mjs';

export function withAgentRefresh(view,root,store,client,{label='Atualizar leitura'}={}){
  let listening=false,languageObserver=null,syncing=false;
  function activeLineButton(){return [...root.querySelectorAll('[data-reuse-line-tab]')].find(button=>button.getAttribute('aria-selected')==='true'||button.classList.contains('active'))||null;}
  function currentLine(){
    const select=root.querySelector('[data-top3-line],[data-trace-line],[data-reuse-line],[data-process-line]');
    const value=select?.value||activeLineButton()?.dataset.reuseLineTab;
    return LINE_IDS.includes(value)?value:null;
  }
  function sharedLine(){const value=store.context?.().line_id||store.preferredLine?.();return LINE_IDS.includes(value)?value:null;}
  function syncSharedLine(){
    if(syncing)return;const line=sharedLine();if(!line)return;syncing=true;
    try{
      const tab=[...root.querySelectorAll('[data-reuse-line-tab]')].find(button=>button.dataset.reuseLineTab===line);
      if(tab&&tab.getAttribute('aria-selected')!=='true')tab.click();
      const select=root.querySelector('[data-top3-line],[data-trace-line],[data-reuse-line],[data-process-line]');
      if(select&&select.value!==line){select.value=line;if(select.value===line)select.dispatchEvent(new Event('change',{bubbles:true}));}
    }finally{syncing=false;}
  }
  function productLabel(snapshot){
    const products=[...new Set((snapshot?.occurrences||[]).map(row=>row.product_key).filter(Boolean))];
    if(products.length===1)return products[0];
    if(products.length>1)return `${products.length} CPH · ${products.slice(0,3).join(' · ')}${products.length>3?' · …':''}`;
    return 'CPH não informado';
  }
  function paintProvenance(bar){
    let meta=bar.querySelector('[data-native-provenance]');
    if(!meta){meta=document.createElement('span');meta.dataset.nativeProvenance='1';meta.className='ames-native-provenance';bar.append(meta);}
    const line=currentLine()||sharedLine();
    if(!line){meta.textContent='';meta.hidden=true;return;}
    const read=store.read(line),snapshot=read.snapshot;
    meta.hidden=false;
    if(!snapshot){meta.textContent=`${line} · sem snapshot · ausência não equivale a zero`;return;}
    const coverage=snapshot.coverage?.status||'indisponível';
    meta.textContent=`${line} · snapshot ${snapshot.snapshot_id||'—'} · origem ${read.source||'none'} · ${read.freshness||'unknown'} · cobertura ${coverage} · ${productLabel(snapshot)}`;
  }
  function decorate(){
    syncSharedLine();
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
        finally{button.disabled=store.agent().status!=='connected';syncSharedLine();paintProvenance(bar);}
      });
    }
    const button=bar.querySelector('[data-native-refresh]');
    button.disabled=store.agent().status!=='connected';
    paintProvenance(bar);
    if(!listening){root.addEventListener('change',onScopeChange);root.addEventListener('click',onScopeClick);listening=true;}
  }
  function repaintForLocale(){view.render();decorate();}
  function onScopeChange(event){
    if(!event.target?.matches?.('[data-top3-line],[data-trace-line],[data-reuse-line],[data-process-line]'))return;
    const value=event.target.value;if(LINE_IDS.includes(value))store.updateContext?.({line_id:value});
    queueMicrotask(()=>{const bar=root.querySelector('[data-native-refresh-bar]');if(bar)paintProvenance(bar);});
  }
  function onScopeClick(event){
    const button=event.target?.closest?.('[data-reuse-line-tab]');if(!button)return;
    const value=button.dataset.reuseLineTab;if(LINE_IDS.includes(value))store.updateContext?.({line_id:value});
    queueMicrotask(()=>{const bar=root.querySelector('[data-native-refresh-bar]');if(bar)paintProvenance(bar);});
  }
  return Object.freeze({render(){view.render();decorate();if(!languageObserver){languageObserver=new MutationObserver(repaintForLocale);languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}},clear(){languageObserver?.disconnect();languageObserver=null;if(listening){root.removeEventListener('change',onScopeChange);root.removeEventListener('click',onScopeClick);listening=false;}view.clear?.();}});
}
