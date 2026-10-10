import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const lineOptions=(selected)=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>Linha ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const rowsTable=(rows,columns,{empty='Nenhum registro disponível.',highlight}={})=>!rows?.length?`<div class="ames-empty"><span>—</span><p>${esc(empty)}</p></div>`:`<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr${highlight?.(row,index)?' class="ames-evidence-hit"':''}>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const kv=(label,value,note='')=>`<div class="ames-kv"><small>${esc(label)}</small><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:''}</div>`;
const sectionHead=(title,subtitle='',right='')=>`<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${right}</div>`;

const INSIGHT_DRILL={
  'PCBA em 2º uso':'pcba_second_use','PCBA em 3º+ uso':'pcba_3plus_use','PCBAs 2º+ uso com falha anterior':'pcba_reused_with_prior_failure',
  'PCBAs que repetiram a mesma falha':'pcba_same_failure','PCBAs com recorrência da mesma família':'pcba_same_family','PCBAs em 2º uso com mesma falha anterior':'pcba_second_use_same_failure','PCBAs em 2º uso com mesma família anterior':'pcba_second_use_same_family',
  'Materiais únicos 2º+ uso':'material_analysis','Materiais em 2º uso':'material_second_use','Materiais em 3º+ uso':'material_3plus_use',
  'Reuso COM falha em PCBA desvinculada':'material_with_old_failure','Reuso com a MESMA falha':'material_same_failure','Reuso com falha da MESMA família':'material_same_family',
  'Vínculos material↔PCBA com mesma falha':'correlation_same_failure','Vínculos material↔PCBA com mesma família':'correlation_same_family'
};

const groupLabel=value=>({pcba_kpis:'PCBA reutilizada',material_kpis:'Material SN reutilizado',correlation_kpis:'Correlação material ↔ PCBA'})[value]||String(value||'Indicadores').replaceAll('_',' ');
const exactId=row=>row?.current_pcba_sn||row?.pcba_sn||row?.item_sn||row?.material_sn||row?.serial_number||row?.sn||'';

export function createReuseConsoleView(root,store){
  let line=LINE_IDS[0],selected='',last='';
  function render(){
    const read=store.read(line),snapshot=read.snapshot,insights=snapshot?.insights,groups=insights?.groups||{},rows=selected?(insights?.drilldowns?.[selected]||[]):[];
    const key=JSON.stringify([line,snapshot?.snapshot_id,selected,insights]);if(key===last)return;last=key;
    const groupCount=Object.keys(groups).length,kpiCount=Object.values(groups).reduce((n,pairs)=>n+(pairs?.length||0),0),drillCount=Object.keys(insights?.drilldowns||{}).length;
    root.innerHTML=`<section class="mes-context-panel ames-reuse-head">${sectionHead('Dashboards de reuso','Área especializada. Segundo uso da própria PCBA e segundo uso de Material SN continuam conceitos separados.',`<label>Linha<select data-reuse-line>${lineOptions(line)}</select></label>`)}
      <div class="ames-summary-grid ames-reuse-summary">${kv('Snapshot',snapshot?.snapshot_id||'—',read.source||'sem fonte')}${kv('Grupos',groupCount)}${kv('Indicadores',kpiCount)}${kv('Drill-downs',drillCount,'itens exatos')}${kv('Linha',line,'isolada')}${kv('CPH',snapshot?.product_model||snapshot?.cph||'—','sem aproximação')}</div></section>
      ${!insights?'<div class="ames-empty ames-empty-large"><span>▥</span><h3>Reuso ainda não enriquecido nesta linha</h3><p>Execute Rastreabilidade em modo completo ou reuse_only. Ausência de dados não significa ausência de reutilização.</p></div>':Object.entries(groups).map(([group,pairs])=>`<section class="mes-context-panel ames-reuse-group">${sectionHead(groupLabel(group),'Clique apenas nos indicadores que possuem evidência exata carregada.')}<div class="ames-reuse-kpis">${(pairs||[]).map(([label,value])=>{const drill=INSIGHT_DRILL[label],available=Boolean(drill&&insights.drilldowns?.[drill]);return available?`<button type="button" class="stat ames-kpi-button${selected===drill?' active':''}" data-reuse-drill="${esc(drill)}"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">Abrir SNs exatos →</span></button>`:`<div class="stat ames-kpi-disabled"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">Drill-down não carregado nesta leitura</span></div>`}).join('')}</div></section>`).join('')}
      ${selected?`<section class="mes-context-panel ames-selected-evidence">${sectionHead('ITEM EXATO EM EVIDÊNCIA',`${rows.length} registro(s) sustentam o indicador selecionado. Nenhum número fica sem mostrar a placa/material quando o drill-down existe.`,`<button type="button" class="button secondary" data-reuse-clear>Fechar evidência</button>`)}${rows.length?`<div class="ames-evidence-hero"><small>Primeiro item do conjunto</small><b>${esc(exactId(rows[0])||'Identificador não informado')}</b><span>${esc(rows[0].item_type||rows[0].defect_code||rows[0].relation||'')}</span></div>`:''}${rowsTable(rows,Object.keys(rows[0]||{}).filter(k=>!k.startsWith('_')).slice(0,12).map(k=>[k,k]),{empty:'O indicador existe, mas nenhum registro detalhado foi retornado nesta leitura.',highlight:(_,i)=>i===0})}</section>`:''}`;
    root.querySelector('[data-reuse-line]')?.addEventListener('change',e=>{line=e.target.value;selected='';last='';render();});
    root.querySelector('[data-reuse-clear]')?.addEventListener('click',()=>{selected='';last='';render();});
    for(const btn of root.querySelectorAll('[data-reuse-drill]'))btn.addEventListener('click',()=>{selected=btn.dataset.reuseDrill;last='';render();requestAnimationFrame(()=>root.querySelector('.ames-selected-evidence')?.scrollIntoView({behavior:'smooth',block:'start'}));});
  }
  return {render,clear(){root?.replaceChildren();last='';selected='';}};
}

const BASE_ACTIONS=[
  ['dataset','▦','Dataset','Inspecionar a tabela selecionada no SQLite local'],
  ['catalog','⌘','Catálogo','Estrutura, datasets e cobertura disponíveis'],
  ['trends','↗','Tendências','Evolução salva da linha selecionada'],
  ['jobs','◴','Jobs','Histórico operacional do agente'],
  ['backup','↓','Backup','Gerar/preservar backup local'],
  ['search','⌕','Busca','Pesquisar evidências locais']
];

function normalizeRows(result){
  if(Array.isArray(result))return result;
  return result?.rows||result?.datasets||result?.jobs||result?.results||result?.items||[];
}

export function createBaseConsoleView(root,store,client){
  let mounted=false,line=LINE_IDS[0],result=null,active='dataset',busy=false;
  function resultView(){
    const host=root.querySelector('[data-base-result]');if(!host)return;
    if(busy){host.innerHTML='<div class="ames-empty ames-empty-large"><span>…</span><h3>Consultando base local</h3><p>A operação é somente leitura, exceto quando você pede explicitamente backup/exportação.</p></div>';return;}
    if(!result){host.innerHTML='<div class="ames-empty ames-empty-large"><span>▦</span><h3>Base local pronta para inspeção</h3><p>Escolha uma ação acima. Esta é a área técnica para 3028, 2114, 3074, process_events, process_defect_contexts, tendências e jobs.</p></div>';return;}
    const rows=normalizeRows(result),cols=Object.keys(rows[0]||{}).slice(0,12).map(k=>[k,k]);
    host.innerHTML=`<section class="mes-context-panel ames-base-result">${sectionHead(result.title||active,`${rows.length} registro(s) retornados na leitura atual.`)}${rowsTable(rows,cols,{empty:'A operação foi concluída, mas não retornou linhas para este escopo.'})}</section>`;
  }
  async function run(name){
    if(busy)return;active=name;busy=true;resultView();
    try{
      if(name==='excel'){const blob=await client.excel(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMES_EQUIPE_LINHAS.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      const value={line,snapshot_id:store.read(line).snapshot?.snapshot_id,dataset:root.querySelector('[data-base-dataset]')?.value,q:root.querySelector('[data-base-q]')?.value?.trim()||''};
      const r=await client.auxiliary(name,value);result={title:BASE_ACTIONS.find(x=>x[0]===name)?.[2]||name,...(Array.isArray(r)?{rows:r}:r)};
    }catch(error){result={title:'Erro',rows:[{erro:error.message}]};}
    finally{busy=false;resultView();}
  }
  function render(){
    if(!mounted){
      root.innerHTML=`<section class="mes-context-panel ames-base-toolbar">${sectionHead('Base local / SQLite','Área técnica para auditoria. Dados brutos e derivados ficam aqui para não poluir as outras oito views.')}<div class="mes-filters"><label>Linha<select data-base-line>${lineOptions(line)}</select></label><label>Dataset<select data-base-dataset><option value="defects">3028 · falhas</option><option value="pcba_history">2114 · histórico PCBA</option><option value="material_reuse">3074 · material/reuso</option><option value="process_events">3022 · process_events</option><option value="process_defect_contexts">3022 · process_defect_contexts</option><option value="history_contexts">Contextos históricos</option></select></label><label>Busca local<input data-base-q placeholder="SN, falha, CPH, posto, material..."></label></div></section>
      <div class="ames-base-actions">${BASE_ACTIONS.map(([id,icon,label,note])=>`<button type="button" class="ames-base-action" data-base="${id}"><span>${icon}</span><b>${label}</b><small>${note}</small></button>`).join('')}<button type="button" class="ames-base-action" data-base="excel"><span>⇩</span><b>Excel</b><small>Exportar a base consolidada disponível</small></button></div><section data-base-result></section>`;
      mounted=true;root.querySelector('[data-base-line]').addEventListener('change',e=>line=e.target.value);root.querySelector('[data-base-q]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run('search');}});for(const button of root.querySelectorAll('[data-base]'))button.addEventListener('click',()=>run(button.dataset.base));resultView();
    }
  }
  return {render,clear(){root?.replaceChildren();mounted=false;result=null;busy=false;}};
}

const kindClass=kind=>{const value=String(kind||'').toLowerCase();if(value.includes('causa')||value.includes('confirmed'))return'cause';if(value.includes('hip')||value.includes('hyp'))return'hypothesis';if(value.includes('corr'))return'correlation';return'fact';};
const kindLabel=kind=>{const cls=kindClass(kind);return cls==='cause'?'Causa confirmada':cls==='hypothesis'?'Hipótese':cls==='correlation'?'Correlação':'Fato / evidência';};

export function createKnowledgeConsoleView(root,client){
  let mounted=false,line=LINE_IDS[0],result=[],query='',busy=false;
  function paint(){
    const host=root.querySelector('[data-knowledge-result]');if(!host)return;
    if(busy){host.innerHTML='<div class="ames-empty ames-empty-large"><span>…</span><h3>Buscando conhecimento operacional</h3><p>A CORA consulta a mesma base A-MES; ela não transforma correlação em causa.</p></div>';return;}
    if(!query){host.innerHTML='<div class="ames-empty ames-empty-large"><span>C</span><h3>Pesquise na mesma base da Central</h3><p>Use PCBA, Material SN, Defect Code, descrição, CPH ou posto de processo. Fato, correlação, hipótese e causa confirmada permanecem separados.</p></div>';return;}
    if(!result.length){host.innerHTML='<div class="ames-empty ames-empty-large"><span>⌕</span><h3>Nenhum resultado nesta leitura</h3><p>Isso não prova ausência no MES; significa apenas que a base local disponível não retornou correspondência.</p></div>';return;}
    host.innerHTML=`<div class="ames-knowledge-summary"><span><b>${result.length}</b> resultado(s)</span><span>Linha <b>${esc(line)}</b></span><span>Busca <b>${esc(query)}</b></span></div><div class="ames-knowledge-list">${result.map(row=>{const cls=kindClass(row.kind);return`<article class="ames-knowledge-card ${cls}"><div class="ames-knowledge-card-head"><span class="ames-knowledge-kind">${esc(kindLabel(row.kind))}</span><small>${esc(row.source||'fonte local')}</small></div><h3>${esc(row.defect_code||row.pcba_sn||row.item_sn||row.kind||'Evidência')}</h3><p>${esc(row.text||row.defect_desc||row.description||'')}</p><div class="ames-knowledge-meta">${row.pcba_sn?`<span>PCBA <b>${esc(row.pcba_sn)}</b></span>`:''}${row.line?`<span>Linha <b>${esc(row.line)}</b></span>`:''}${row.defect_desc?`<span>${esc(row.defect_desc)}</span>`:''}</div></article>`}).join('')}</div>`;
  }
  async function search(){query=root.querySelector('[data-knowledge-q]').value.trim();if(!query){result=[];paint();return;}busy=true;paint();try{const r=await client.auxiliary('search',{line,q:query});result=r.results||r.rows||[];}catch(error){result=[{kind:'fact',text:error.message,source:'erro'}];}finally{busy=false;paint();}}
  function render(){
    if(!mounted){root.innerHTML=`<section class="mes-context-panel ames-knowledge-search">${sectionHead('CORA · conhecimento A-MES','Busca estruturada na mesma base operacional. Causa só é exibida como confirmada quando a fonte a classifica assim.')}<div class="ames-knowledge-query"><label>Linha<select data-knowledge-line>${lineOptions(line)}</select></label><label>Buscar<input data-knowledge-q placeholder="PCBA, Material SN, falha, CPH, processo..."></label><button class="button primary" data-knowledge-run>Buscar</button></div><div class="ames-knowledge-legend"><span class="fact">Fato / evidência</span><span class="correlation">Correlação</span><span class="hypothesis">Hipótese</span><span class="cause">Causa confirmada</span></div></section><section data-knowledge-result></section>`;mounted=true;root.querySelector('[data-knowledge-line]').addEventListener('change',e=>line=e.target.value);root.querySelector('[data-knowledge-run]').addEventListener('click',search);root.querySelector('[data-knowledge-q]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});paint();}
  }
  return {render,clear(){root?.replaceChildren();mounted=false;result=[];query='';busy=false;}};
}
