import {LINE_IDS} from './data/contract.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

const PAGE_SIZES=[50,100,250];
const MAX_ROWS=100000;
const lineOptions=selected=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>Linha ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const sectionHead=(title,subtitle='',right='')=>`<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${right}</div>`;
const table=(rows,columns,empty='Nenhum registro disponível.')=>!rows.length?`<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`:`<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const normalizeRows=result=>Array.isArray(result)?result:result?.rows||result?.datasets||result?.jobs||result?.results||result?.items||[];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

const BASE_ACTIONS=[
  ['dataset','▦','Dataset','Inspecionar a tabela selecionada no SQLite local'],
  ['catalog','⌘','Catálogo','Estrutura, datasets e cobertura disponíveis'],
  ['trends','↗','Tendências','Evolução salva da linha selecionada'],
  ['jobs','◴','Jobs','Histórico operacional do agente'],
  ['backup','↓','Backup','Gerar/preservar backup local'],
  ['search','⌕','Busca','Pesquisar evidências locais']
];

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
    const safeTotal=Number.isFinite(Number(total))?Math.max(0,Number(total)):rows.length;
    const maxPage=Math.max(0,Math.ceil(safeTotal/pageSize)-1);
    page=clamp(page,0,maxPage);
    const start=page*pageSize,end=Math.min(start+pageSize,rows.length,safeTotal);
    return {total:safeTotal,maxPage,start,end,pageRows:rows.slice(start,end),hasPrev:page>0,hasNext:end<safeTotal};
  }

  function resultView(){
    const host=root.querySelector('[data-base-result]');if(!host)return;
    if(busy){host.innerHTML='<div class="ames-empty ames-empty-large"><span>…</span><h3>Consultando base local</h3><p>A operação é somente leitura, exceto quando você pede explicitamente backup/exportação.</p></div>';return;}
    if(!result){host.innerHTML='<div class="ames-empty ames-empty-large"><span>▦</span><h3>Base local pronta para inspeção</h3><p>Escolha uma ação acima. Tabelas grandes são paginadas para não montar milhares de linhas no navegador.</p></div>';return;}
    const rows=normalizeRows(result),cols=Object.keys(rows[0]||{}).slice(0,12).map(k=>[k,k]);
    const paged=active==='dataset'&&result.error!==true;
    const model=paged?pagerModel(rows,result.total):{total:rows.length,start:0,end:rows.length,pageRows:rows,hasPrev:false,hasNext:false,maxPage:0};
    const subtitle=paged
      ?`${model.total} registro(s) no dataset · exibindo ${model.total?model.start+1:0}–${model.end}. O navegador mantém no máximo ${pageSize} linhas visíveis por página.`
      :`${rows.length} registro(s) retornados na leitura atual.`;
    const pager=paged&&model.total?`<div class="ames-base-pager" data-base-pager><span>${model.start+1}–${model.end} de ${model.total}</span><label>Por página<select data-base-page-size>${PAGE_SIZES.map(size=>`<option value="${size}"${size===pageSize?' selected':''}>${size}</option>`).join('')}</select></label><button type="button" class="button secondary" data-base-prev${model.hasPrev?'':' disabled'}>Anterior</button><span>Página ${page+1} de ${model.maxPage+1}</span><button type="button" class="button secondary" data-base-next${model.hasNext?'':' disabled'}>Próxima</button></div>`:'';
    host.innerHTML=`<section class="mes-context-panel ames-base-result">${sectionHead(result.title||active,subtitle)}${table(model.pageRows,cols,'A operação foi concluída, mas não retornou linhas para este escopo.')}${pager}${paged&&result.loaded_limited?'<p class="ames-base-page-note">Leitura incremental do SQLite: novas páginas são buscadas somente quando necessário.</p>':''}</section>`;
    host.querySelector('[data-base-prev]')?.addEventListener('click',()=>gotoPage(page-1));
    host.querySelector('[data-base-next]')?.addEventListener('click',()=>gotoPage(page+1));
    host.querySelector('[data-base-page-size]')?.addEventListener('change',event=>{pageSize=Number(event.target.value)||100;page=0;void loadDatasetPage();});
  }

  async function connectedDataset(value,serial){
    const requested=Math.min(MAX_ROWS,(page+1)*pageSize);
    let total=null;
    try{
      const catalog=await client.auxiliary('catalog',{line:value.line,snapshot_id:value.snapshot_id});
      const rows=Array.isArray(catalog?.datasets)?catalog.datasets:[];
      const match=rows.find(row=>String(row?.dataset||'')===String(value.dataset));
      const count=Number(match?.rows??match?.count);
      if(Number.isFinite(count)&&count>=0)total=count;
    }catch(error){
      if(error?.name==='AbortError')throw error;
    }
    if(serial!==requestSerial)return null;
    const data=await client.auxiliary('dataset',{...value,limit:requested});
    if(serial!==requestSerial)return null;
    const rows=normalizeRows(data);
    if(total===null)total=rows.length<requested?rows.length:Math.min(MAX_ROWS,requested+(rows.length===requested?pageSize:0));
    return {title:'Dataset',...data,rows,total,loaded_limited:rows.length<total};
  }

  function sharedDataset(value){
    const snapshot=store.read(value.line).snapshot;if(!snapshot)throw Error('Sem dados compartilhados para esta linha.');
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
    }catch(error){if(serial===requestSerial)result={title:'Erro',rows:[{erro:error.message}],error:true};}
    finally{if(serial===requestSerial){busy=false;resultView();}}
  }

  async function gotoPage(next){
    if(active!=='dataset'||busy)return;
    const total=Number(result?.total??normalizeRows(result).length),maxPage=Math.max(0,Math.ceil(total/pageSize)-1);
    const target=clamp(Number(next)||0,0,maxPage);if(target===page)return;page=target;
    const rows=normalizeRows(result),need=(page+1)*pageSize;
    if(store.agent().status==='connected'&&rows.length<Math.min(need,total))await loadDatasetPage();else resultView();
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
        if(!snapshot)throw Error('Sem dados compartilhados para esta linha.');
        if(name==='catalog')r={rows:Object.entries(datasets).map(([dataset,rows])=>({dataset,rows:rows.length}))};
        else if(name==='search')r={rows:Object.values(datasets).flat().filter(row=>JSON.stringify(row).toLowerCase().includes(value.q.toLowerCase())).slice(0,250)};
        else throw Error('Dados disponíveis para consulta; coleta local indisponível.');
      }else r=await client.auxiliary(name,{...value,limit:name==='trends'?500:undefined});
      if(serial===requestSerial)result={title:BASE_ACTIONS.find(x=>x[0]===name)?.[2]||name,...(Array.isArray(r)?{rows:r}:r)};
    }catch(error){if(serial===requestSerial)result={title:'Erro',rows:[{erro:error.message}],error:true};}
    finally{if(serial===requestSerial){busy=false;resultView();}}
  }

  function resetForScope(){requestSerial++;page=0;result=null;active='dataset';busy=false;resultView();}

  function render(){
    if(mounted)return;
    root.innerHTML=`<section class="mes-context-panel ames-base-toolbar">${sectionHead('Base local / SQLite','Área técnica para auditoria. Leituras grandes usam paginação incremental para preservar velocidade e memória do navegador.')}<div class="mes-filters"><label>Linha<select data-base-line>${lineOptions(line)}</select></label><label>Dataset<select data-base-dataset><option value="defects">3028 · falhas</option><option value="pcba_history">2114 · histórico PCBA</option><option value="material_reuse">3074 · material/reuso</option><option value="process_events">3022 · process_events</option><option value="process_defect_contexts">3022 · process_defect_contexts</option><option value="history_contexts">Contextos históricos</option></select></label><label>Busca local<input data-base-q placeholder="SN, falha, CPH, posto, material..."></label></div></section>
    <div class="ames-base-actions">${BASE_ACTIONS.map(([id,icon,label,note])=>`<button type="button" class="ames-base-action" data-base="${id}"><span>${icon}</span><b>${label}</b><small>${note}</small></button>`).join('')}<button type="button" class="ames-base-action" data-base="excel"><span>⇩</span><b>Excel</b><small>Exportar a base consolidada disponível</small></button></div><section data-base-result></section>`;
    mounted=true;
    root.querySelector('[data-base-line]').addEventListener('change',event=>{line=event.target.value;resetForScope();});
    root.querySelector('[data-base-dataset]').addEventListener('change',resetForScope);
    root.querySelector('[data-base-q]').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void run('search');}});
    for(const button of root.querySelectorAll('[data-base]'))button.addEventListener('click',()=>void run(button.dataset.base));
    resultView();
  }

  return {render,clear(){requestSerial++;root?.replaceChildren();mounted=false;result=null;busy=false;page=0;}};
}
