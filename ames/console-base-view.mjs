import {LINE_IDS} from './data/contract.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {BASE_PAGE_SIZES,BASE_MAX_ROWS,normalizeBasePageSize,baseIncrementalLimit,basePageWindow} from './base-paging.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const lineOptions=selected=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const sectionHead=(title,subtitle='',right='')=>`<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${right}</div>`;
const table=(rows,columns,empty)=>!rows.length?`<div class="ames-empty"><span>—</span><p>${esc(empty||t('Nenhum registro disponível.','No records available.'))}</p></div>`:`<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const normalizeRows=result=>Array.isArray(result)?result:result?.rows||result?.datasets||result?.jobs||result?.results||result?.items||[];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

const BASE_ACTIONS=[
  ['dataset','▦','Dataset','Dataset','Inspecionar a tabela selecionada no SQLite local','Inspect the selected table in local SQLite'],
  ['catalog','⌘','Catálogo','Catalog','Estrutura, datasets e cobertura disponíveis','Available structure, datasets and coverage'],
  ['trends','↗','Tendências','Trends','Evolução salva da linha selecionada','Saved trend for the selected line'],
  ['jobs','◴','Jobs','Jobs','Histórico operacional do agente','Agent operational history'],
  ['backup','↓','Backup','Backup','Gerar/preservar backup local','Create/preserve a local backup'],
  ['search','⌕','Busca','Search','Pesquisar evidências locais','Search local evidence']
];
const actionLabel=name=>{const item=BASE_ACTIONS.find(x=>x[0]===name);return item?t(item[2],item[3]):name;};

function sharedDatasets(snapshot){
  return snapshot?.canonical?.datasets||{
    defects:snapshot?.occurrences||[],
    pcba_history:snapshot?.pcba_history?.records||[],
    material_reuse:snapshot?.material_trace?.records||[],
    process_timeline:snapshot?.process_timeline?.events||[],
    process_defect_contexts:snapshot?.process_timeline?.contexts||snapshot?.process_contexts||[],
  };
}

export function createBaseConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],result=null,active='dataset',busy=false,page=0,pageSize=100,requestSerial=0;

  function selection(){
    return {
      line,
      snapshot_id:store.read(line).snapshot?.snapshot_id,
      dataset:root.querySelector('[data-base-dataset]')?.value||'defects',
      q:root.querySelector('[data-base-q]')?.value?.trim()||''
    };
  }

  function pagerModel(rows,total){
    const fallbackTotal=Number.isFinite(Number(total))?Number(total):rows.length;
    const model=basePageWindow(fallbackTotal,page,pageSize,rows.length);
    page=model.page;pageSize=model.pageSize;
    return {...model,pageRows:rows.slice(model.start,model.end),maxPage:model.pages-1};
  }

  function resultView(){
    const host=root.querySelector('[data-base-result]');if(!host)return;
    if(busy){host.innerHTML=`<div class="ames-empty ames-empty-large"><span>…</span><h3>${t('Consultando base local','Querying local database')}</h3><p>${t('A operação é somente leitura, exceto quando você pede explicitamente backup/exportação.','This operation is read-only unless you explicitly request backup/export.')}</p></div>`;return;}
    if(!result){host.innerHTML=`<div class="ames-empty ames-empty-large"><span>▦</span><h3>${t('Base local pronta para inspeção','Local database ready for inspection')}</h3><p>${t('Escolha uma ação acima. Tabelas grandes são paginadas para não montar milhares de linhas no navegador.','Choose an action above. Large tables are paginated so the browser does not render thousands of rows at once.')}</p></div>`;return;}
    const rows=normalizeRows(result),cols=Object.keys(rows[0]||{}).slice(0,12).map(k=>[k,k]);
    const paged=active==='dataset'&&result.error!==true;
    const model=paged?pagerModel(rows,result.total):{total:rows.length,start:0,end:rows.length,displayStart:rows.length?1:0,pageRows:rows,hasPrev:false,hasNext:false,maxPage:0};
    const subtitle=paged
      ?t(`${model.total} registro(s) no dataset · exibindo ${model.displayStart}–${model.end}. O navegador mantém no máximo ${pageSize} linhas visíveis por página.`,`${model.total} dataset record(s) · showing ${model.displayStart}–${model.end}. The browser keeps at most ${pageSize} visible rows per page.`)
      :t(`${rows.length} registro(s) retornados na leitura atual.`,`${rows.length} record(s) returned by the current read.`);
    const pager=paged&&model.total?`<div class="ames-base-pager" data-base-pager><span>${model.displayStart}–${model.end} ${t('de','of')} ${model.total}</span><label>${t('Por página','Per page')}<select data-base-page-size>${BASE_PAGE_SIZES.map(size=>`<option value="${size}"${size===pageSize?' selected':''}>${size}</option>`).join('')}</select></label><button type="button" class="button secondary" data-base-prev${model.hasPrev?'':' disabled'}>${t('Anterior','Previous')}</button><span>${t('Página','Page')} ${page+1} ${t('de','of')} ${model.maxPage+1}</span><button type="button" class="button secondary" data-base-next${model.hasNext?'':' disabled'}>${t('Próxima','Next')}</button></div>`:'';
    host.innerHTML=`<section class="mes-context-panel ames-base-result">${sectionHead(result.title||active,subtitle)}${table(model.pageRows,cols,t('A operação foi concluída, mas não retornou linhas para este escopo.','The operation completed but returned no rows for this scope.'))}${pager}${paged&&result.loaded_limited?`<p class="ames-base-page-note">${t('Leitura incremental do SQLite: novas páginas são buscadas somente quando necessário.','Incremental SQLite read: additional pages are fetched only when needed.')}</p>`:''}</section>`;
    host.querySelector('[data-base-prev]')?.addEventListener('click',()=>gotoPage(page-1));
    host.querySelector('[data-base-next]')?.addEventListener('click',()=>gotoPage(page+1));
    host.querySelector('[data-base-page-size]')?.addEventListener('change',event=>{pageSize=normalizeBasePageSize(event.target.value);page=0;void loadDatasetPage();});
  }

  async function connectedDataset(value,serial){
    const requested=baseIncrementalLimit(page,pageSize,BASE_MAX_ROWS);
    let total=null;
    try{
      const catalog=await client.auxiliary('catalog',{line:value.line,snapshot_id:value.snapshot_id});
      const rows=Array.isArray(catalog?.datasets)?catalog.datasets:[];
      const match=rows.find(row=>String(row?.dataset||'')===String(value.dataset));
      const count=Number(match?.rows??match?.count);
      if(Number.isFinite(count)&&count>=0)total=Math.min(BASE_MAX_ROWS,count);
    }catch(error){
      if(error?.name==='AbortError')throw error;
    }
    if(serial!==requestSerial)return null;
    const data=await client.auxiliary('dataset',{...value,limit:requested});
    if(serial!==requestSerial)return null;
    const rows=normalizeRows(data);
    if(total===null)total=rows.length<requested?rows.length:Math.min(BASE_MAX_ROWS,requested+(rows.length===requested?pageSize:0));
    return {title:'Dataset',...data,rows,total,loaded_limited:rows.length<total};
  }

  function sharedDataset(value){
    const snapshot=store.read(value.line).snapshot;if(!snapshot)throw Error(t('Sem dados compartilhados para esta linha.','No shared data for this line.'));
    const datasets=sharedDatasets(snapshot),key=value.dataset==='process_events'?'process_timeline':value.dataset;
    const rows=datasets[key]||[];
    return {title:'Dataset',rows,total:rows.length,loaded_limited:false};
  }

  async function loadDatasetPage(){
    if(busy&&active!=='dataset')return;
    active='dataset';busy=true;const serial=++requestSerial;resultView();
    try{
      const value=selection();
      const next=store.agent().status==='connected'?await connectedDataset(value,serial):sharedDataset(value);
      if(serial===requestSerial&&next)result=next;
    }catch(error){if(serial===requestSerial)result={title:t('Erro','Error'),rows:[{error:error.message}],error:true};}
    finally{if(serial===requestSerial){busy=false;resultView();}}
  }

  async function gotoPage(next){
    if(active!=='dataset'||busy)return;
    const total=Number(result?.total??normalizeRows(result).length),maxPage=Math.max(0,Math.ceil(total/pageSize)-1);
    const target=clamp(Number(next)||0,0,maxPage);if(target===page)return;page=target;
    const rows=normalizeRows(result),window=basePageWindow(total,page,pageSize,rows.length);
    if(store.agent().status==='connected'&&window.needsMore)await loadDatasetPage();else resultView();
  }

  async function run(name){
    if(busy)return;
    if(name==='dataset'){page=0;await loadDatasetPage();return;}
    active=name;page=0;busy=true;const serial=++requestSerial;resultView();
    try{
      if(name==='excel'){
        const blob=await client.excel(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMES_EQUIPE_LINHAS.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);result=null;return;
      }
      const value=selection();let r;
      if(store.agent().status!=='connected'){
        const snapshot=store.read(line).snapshot,datasets=sharedDatasets(snapshot);
        if(!snapshot)throw Error(t('Sem dados compartilhados para esta linha.','No shared data for this line.'));
        if(name==='catalog')r={rows:Object.entries(datasets).map(([dataset,rows])=>({dataset,rows:rows.length}))};
        else if(name==='search')r={rows:Object.values(datasets).flat().filter(row=>JSON.stringify(row).toLowerCase().includes(value.q.toLowerCase())).slice(0,250)};
        else throw Error(t('Dados disponíveis para consulta; coleta local indisponível.','Shared data is available for viewing; local collection is unavailable.'));
      }else r=await client.auxiliary(name,{...value,limit:name==='trends'?500:undefined});
      if(serial===requestSerial)result={title:actionLabel(name),...(Array.isArray(r)?{rows:r}:r)};
    }catch(error){if(serial===requestSerial)result={title:t('Erro','Error'),rows:[{error:error.message}],error:true};}
    finally{if(serial===requestSerial){busy=false;resultView();}}
  }

  function resetForScope(){requestSerial++;page=0;result=null;active='dataset';busy=false;resultView();}

  function render(){
    if(mounted)return;
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-base-toolbar">${sectionHead('Base local / SQLite',t('Área técnica para auditoria. Leituras grandes usam paginação incremental para preservar velocidade e memória do navegador.','Technical audit area. Large reads use incremental pagination to preserve browser speed and memory.'))}<div class="mes-filters"><label>${t('Linha','Line')}<select data-base-line>${lineOptions(line)}</select></label><label>Dataset<select data-base-dataset><option value="defects">3028 · ${t('falhas','failures')}</option><option value="pcba_history">2114 · ${t('histórico PCBA','PCBA history')}</option><option value="material_reuse">3074 · ${t('material/reuso','material/reuse')}</option><option value="process_events">3022 · process_events</option><option value="process_defect_contexts">3022 · process_defect_contexts</option><option value="history_contexts">${t('Contextos históricos','Historical contexts')}</option></select></label><label>${t('Busca local','Local search')}<input data-base-q placeholder="${t('SN, falha, CPH, posto, material...','SN, failure, CPH, station, material...')}"></label></div></section>
    <div class="ames-base-actions">${BASE_ACTIONS.map(([id,icon,ptLabel,enLabel,ptNote,enNote])=>`<button type="button" class="ames-base-action" data-base="${id}"><span>${icon}</span><b>${t(ptLabel,enLabel)}</b><small>${t(ptNote,enNote)}</small></button>`).join('')}<button type="button" class="ames-base-action" data-base="excel"><span>⇩</span><b>Excel</b><small>${t('Exportar a base consolidada disponível','Export the available consolidated database')}</small></button></div><section data-base-result></section>`;
    mounted=true;
    root.querySelector('[data-base-line]').addEventListener('change',event=>{line=event.target.value;resetForScope();});
    root.querySelector('[data-base-dataset]').addEventListener('change',resetForScope);
    root.querySelector('[data-base-q]').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void run('search');}});
    for(const button of root.querySelectorAll('[data-base]'))button.addEventListener('click',()=>void run(button.dataset.base));
    resultView();
  }

  return {render,clear(){requestSerial++;root?.replaceChildren();root?.removeAttribute('data-no-i18n');mounted=false;result=null;busy=false;page=0;}};
}
