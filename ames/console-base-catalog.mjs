import { LINE_IDS } from './data/contract.mjs';

// Complementa a Base local sem duplicar estado: o agente continua sendo a fonte
// do catálogo e a view continua usando o mesmo client/store da sessão Central.
export function withBaseCatalog(view,root,store,client){
  let loading=false,loadedFor='';

  function currentLine(){
    const value=root.querySelector('[data-base-line]')?.value;
    return LINE_IDS.includes(value)?value:LINE_IDS[0];
  }

  function paint(message=''){
    let bar=root.querySelector('[data-base-catalog-bar]');
    if(!bar){
      bar=document.createElement('div');
      bar.dataset.baseCatalogBar='1';
      bar.className='ames-native-refresh-bar ames-base-catalog-bar';
      bar.innerHTML='<button type="button" class="button secondary" data-base-catalog-load>Carregar todos os datasets disponíveis</button><span data-base-catalog-status></span>';
      const toolbar=root.querySelector('.ames-base-toolbar');
      if(toolbar)toolbar.after(bar);else root.prepend(bar);
      bar.querySelector('[data-base-catalog-load]').addEventListener('click',loadCatalog);
    }
    const button=bar.querySelector('[data-base-catalog-load]');
    if(button)button.disabled=loading||store.agent().status!=='connected';
    const status=bar.querySelector('[data-base-catalog-status]');
    if(status&&message)status.textContent=message;
  }

  function applyDatasets(result,line){
    const select=root.querySelector('[data-base-dataset]');
    if(!select)return 0;
    const rows=Array.isArray(result?.datasets)?result.datasets:Array.isArray(result?.rows)?result.rows:[];
    const entries=rows.map(row=>({
      dataset:String(row?.dataset||row?.name||'').trim(),
      label:String(row?.label||row?.title||row?.dataset||row?.name||'').trim(),
      count:row?.rows??row?.count??null
    })).filter(row=>row.dataset);
    if(!entries.length)return 0;
    const previous=select.value;
    const existing=new Map([...select.options].map(option=>[option.value,option.textContent]));
    for(const entry of entries){
      const suffix=entry.count===null||entry.count===undefined?'':` · ${entry.count} registro(s)`;
      existing.set(entry.dataset,`${entry.label||entry.dataset}${suffix}`);
    }
    select.innerHTML=[...existing.entries()].map(([value,label])=>`<option value="${value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}">${String(label).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</option>`).join('');
    if([...select.options].some(option=>option.value===previous))select.value=previous;
    loadedFor=line;
    return entries.length;
  }

  async function loadCatalog(){
    if(loading||store.agent().status!=='connected')return;
    const line=currentLine();loading=true;paint('Lendo catálogo do SQLite local...');
    try{
      const result=await client.auxiliary('catalog',{line,snapshot_id:store.read(line).snapshot?.snapshot_id});
      const count=applyDatasets(result,line);
      paint(count?`${count} dataset(s) declarados pelo agente adicionados ao seletor. Nenhum dataset foi inventado.`:'O agente não declarou datasets adicionais nesta leitura.');
    }catch(error){paint(error.message);}
    finally{loading=false;paint();}
  }

  function render(){
    view.render();paint();
    const select=root.querySelector('[data-base-line]');
    if(select&&!select.dataset.baseCatalogBound){
      select.dataset.baseCatalogBound='1';
      select.addEventListener('change',()=>{
        const line=currentLine();
        const status=root.querySelector('[data-base-catalog-status]');
        if(status&&loadedFor&&loadedFor!==line)status.textContent='Linha alterada. Recarregue o catálogo se quiser confirmar cobertura/datasets deste contexto.';
      });
    }
  }

  return Object.freeze({render,clear(){view.clear?.();loading=false;loadedFor='';}});
}
