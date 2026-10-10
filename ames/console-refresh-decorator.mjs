import { LINE_IDS } from './data/contract.mjs';

export function withAgentRefresh(view,root,store,client,{label='Atualizar leitura'}={}){
  let listening=false;
  function currentLine(){
    const select=root.querySelector('[data-top3-line],[data-trace-line],[data-reuse-line],[data-process-line]');
    const value=select?.value;
    return LINE_IDS.includes(value)?value:null;
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
    const line=currentLine();
    if(!line){meta.textContent='';meta.hidden=true;return;}
    const read=store.read(line),snapshot=read.snapshot;
    meta.hidden=false;
    if(!snapshot){meta.textContent=`${line} · sem snapshot · ausência não equivale a zero`;return;}
    const coverage=snapshot.coverage?.status||'indisponível';
    meta.textContent=`${line} · snapshot ${snapshot.snapshot_id||'—'} · origem ${read.source||'none'} · ${read.freshness||'unknown'} · cobertura ${coverage} · ${productLabel(snapshot)}`;
  }
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
        finally{button.disabled=store.agent().status!=='connected';paintProvenance(bar);}
      });
    }
    const button=bar.querySelector('[data-native-refresh]');
    button.disabled=store.agent().status!=='connected';
    paintProvenance(bar);
    if(!listening){root.addEventListener('change',onScopeChange);listening=true;}
  }
  function onScopeChange(event){if(event.target?.matches?.('[data-top3-line],[data-trace-line],[data-reuse-line],[data-process-line]'))queueMicrotask(()=>{const bar=root.querySelector('[data-native-refresh-bar]');if(bar)paintProvenance(bar);});}
  return Object.freeze({render(){view.render();decorate();},clear(){if(listening){root.removeEventListener('change',onScopeChange);listening=false;}view.clear?.();}});
}
