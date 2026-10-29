import {componentMatrixHtml} from './console-component-matrix.mjs';
import {mountReuseCohorts} from './console-reuse-cohorts.mjs';
import {mountReuseTable} from "./reuse-table-view.mjs";
import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const lineOptions=(selected)=>LINE_IDS.map((line,i)=>`<option value="${line}"${selected===line?' selected':''}>${t('Linha','Line')} ${i+1} · ${line}</option>`).join('');
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const rowsTable=(rows,columns,{empty,highlight}={})=>!rows?.length?`<div class="ames-empty"><span>—</span><p>${esc(empty||t('Nenhum registro disponível.','No records available.'))}</p></div>`:`<div class="table-wrap"><table><thead><tr>${columns.map(([key,label])=>`<th>${esc(label||key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr${highlight?.(row,index)?' class="ames-evidence-hit"':''}>${columns.map(([key])=>`<td>${esc(fmt(row?.[key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const kv=(label,value,note='')=>`<div class="ames-kv"><small>${esc(label)}</small><b>${esc(fmt(value))}</b>${note?`<span>${esc(note)}</span>`:''}</div>`;
const sectionHead=(title,subtitle='',right='')=>`<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${right}</div>`;

const INSIGHT_DRILL={
  'PCBA em 2º uso':'pcba_second_use','PCBA em 3º+ uso':'pcba_3plus_use','PCBAs 2º+ uso com falha anterior':'pcba_reused_with_prior_failure',
  'PCBAs que repetiram a mesma falha':'pcba_same_failure','PCBAs com recorrência da mesma família':'pcba_same_family','PCBAs em 2º uso com mesma falha anterior':'pcba_second_use_same_failure','PCBAs em 2º uso com mesma família anterior':'pcba_second_use_same_family',
  'Materiais únicos 2º+ uso':'material_analysis','Materiais em 2º uso':'material_second_use','Materiais em 3º+ uso':'material_3plus_use',
  'Reuso COM falha em PCBA desvinculada':'material_with_old_failure','Reuso com a MESMA falha':'material_same_failure','Reuso com falha da MESMA família':'material_same_family',
  'Vínculos material↔PCBA com mesma falha':'correlation_same_failure','Vínculos material↔PCBA com mesma família':'correlation_same_family'
};

const groupLabel=value=>({rate_kpis:t('Proporções da amostra investigada · não são taxas da produção','Investigated sample proportions · not production rates'),pcba_kpis:t('Placas / PCBAs','Boards / PCBAs'),material_kpis:t('Materiais / componentes','Materials / components'),correlation_kpis:t('Correlação material ↔ PCBA','Material ↔ PCBA correlation')})[value]||String(value||t('Indicadores','Indicators')).replaceAll('_',' ');
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??'';
const drillKind=selected=>String(selected||'').startsWith('correlation_')?'correlation':String(selected||'').startsWith('material_')?'material':'pcba';
const pcbaId=row=>first(row?.current_pcba_sn,row?.pcba_sn,row?.['PCBA atual'],row?.PCBA,row?.['PCBA']);
const materialId=row=>first(row?.item_sn,row?.material_sn,row?.['Material SN']);
const historicalPcba=row=>first(row?.historical_pcba,row?.['PCBA desvinculada']);
export function reuseExactId(row={},selected=''){
  const kind=drillKind(selected),pcba=pcbaId(row),material=materialId(row),historical=historicalPcba(row);
  if(kind==='correlation'&&material&&historical)return `${material} ↔ ${historical}`;
  if(kind==='material')return material||pcba||historical||first(row.serial_number,row.sn);
  return pcba||material||historical||first(row.serial_number,row.sn);
}
const reuseMeta=(row={},selected='')=>drillKind(selected)==='pcba'
  ?first(row.defect_code,row['Defect Code'],row['Defect Code atual'],row.relation,row['Situação da PCBA'])
  :first(row.item_type,row.material_type,row['Tipo material'],row.relation,row['Classificação desta PCBA'],row['Defect Code atual'],row.defect_code);
export function reuseColumns(row={},selected=''){
  const kind=drillKind(selected);
  const priority={
    pcba:['PCBA','PCBA atual','current_pcba_sn','pcba_sn','Defect Code','Defect Code atual','defect_code','Uso da PCBA na falha','Usos conhecidos da PCBA','Reusos anteriores da PCBA','Falhas anteriores 2114','Mesma falha anterior','Mesma família anterior','Situação da PCBA','Linha','Modelo'],
    material:['Material SN','item_sn','material_sn','Tipo material','item_type','material_type','PCBA atual','current_pcba_sn','pcba_sn','PCBAs desvinculadas','previous_pcbas_json','PCBAs desvinculadas únicas','Uso material na falha','Reusos anteriores material','Usos conhecidos material','Reusos conhecidos material','PCBAs com mesma falha','PCBAs com mesma família','PCBAs com falha diferente','Defect Code atual','defect_code','Linha','Modelo'],
    correlation:['Material SN','item_sn','material_sn','PCBA atual','current_pcba_sn','pcba_sn','PCBA desvinculada','historical_pcba','Estado vínculo atual','Classificação desta PCBA','Defect Code atual','Defect Code antigo','Defect Description antigo','Hist Seq','Linha','Modelo']
  }[kind];
  const keys=Object.keys(row).filter(key=>!key.startsWith('_'));
  const ordered=[...priority,...keys].filter((key,index,list)=>Object.hasOwn(row,key)&&list.indexOf(key)===index);
  return ordered.slice(0,16).map(key=>[key,key]);
}

function reuseLineTabs(store,active){
  return `<div class="ames-reuse-line-tabs" role="tablist" aria-label="${t('Linhas do dashboard','Dashboard lines')}">${LINE_IDS.map((id,i)=>{const read=store.read(id),snapshot=read.snapshot,selected=id===active,cph=snapshot?.product_model||snapshot?.cph||'—',occ=snapshot?.occurrences?.length;return `<button type="button" role="tab" aria-selected="${selected}" class="${selected?'active':''}" data-reuse-line-tab="${esc(id)}"><span>${t('Linha','Line')} ${i+1}</span><b>${esc(id)}</b><small>${esc(cph)}${Number.isFinite(occ)?` · ${occ} ${t('ocorr.','occ.')}`:''}</small></button>`;}).join('')}</div>`;
}

export function createReuseConsoleView(root,store){
  let line=store.context?.().line_id||store.preferredLine?.()||LINE_IDS[0],selected='',last='';
  function render(){
    const shared=store.context?.().line_id;if(LINE_IDS.includes(shared)&&shared!==line){line=shared;selected='';last='';}
    const read=store.read(line),snapshot=read.snapshot,insights=snapshot?.insights,groups=insights?.groups||{},rows=selected?(insights?.drilldowns?.[selected]||[]):[];
    const key=JSON.stringify([line,snapshot?.source_id,snapshot?.snapshot_id,snapshot?.snapshot_revision,snapshot?.revision,selected,insights,snapshot?.material_trace,document.documentElement.lang]);if(key===last)return;last=key;
    const groupCount=Object.keys(groups).length,kpiCount=Object.values(groups).reduce((n,pairs)=>n+(pairs?.length||0),0),drillCount=Object.keys(insights?.drilldowns||{}).length;
    const orderedGroups=['material_kpis','correlation_kpis','pcba_kpis',...Object.keys(groups)].filter((value,index,list)=>Object.hasOwn(groups,value)&&list.indexOf(value)===index);
    root.innerHTML=`<section class="mes-context-panel ames-reuse-head">${sectionHead(t('Dashboards de reuso e recorrência','Reuse and recurrence dashboards'),t('Leitura rápida primeiro; evidência exata e análise granular continuam disponíveis sob demanda.','Quick reading first; exact evidence and granular analysis remain available on demand.'))}${reuseLineTabs(store,line)}
      <div class="ames-reuse-reading-note">${t('Reuso e falha são conceitos separados. “Mesma falha” e “mesma família” são correlações históricas e não provam causa por si só.','Reuse and failure are separate concepts. “Same failure” and “same family” are historical correlations and do not prove causation by themselves.')}</div>
      <details class="ames-reuse-coverage"><summary>${t('Cobertura desta leitura','Coverage of this read')}</summary><div class="ames-summary-grid ames-reuse-summary">${kv('Snapshot',snapshot?.snapshot_id||'—',read.source||t('sem fonte','no source'))}${kv(t('Grupos','Groups'),groupCount)}${kv(t('Indicadores','Indicators'),kpiCount)}${kv('Drill-downs',drillCount,t('itens exatos','exact items'))}${kv(t('Linha','Line'),line,t('isolada','isolated'))}${kv('CPH',snapshot?.product_model||snapshot?.cph||'—',t('sem aproximação','exact match only'))}</div></details></section>
      ${!insights?`<div class="ames-empty ames-empty-large"><span>▥</span><h3>${t('Reuso ainda não enriquecido nesta linha','Reuse has not been enriched for this line')}</h3><p>${t('Execute Rastreabilidade em modo completo ou reuse_only. Ausência de dados não significa ausência de reutilização.','Run full or reuse_only traceability. Missing data does not mean no reuse occurred.')}</p></div>`:orderedGroups.map(group=>{const pairs=groups[group];return `<section class="mes-context-panel ames-reuse-group" data-reuse-group="${esc(group)}">${sectionHead(groupLabel(group),t('Clique em um indicador para abrir somente os SNs/PCBAs que sustentam aquele número.','Click an indicator to open only the SNs/PCBAs that support that value.'))}<div class="ames-reuse-kpis">${(pairs||[]).map(([label,value])=>{const drill=INSIGHT_DRILL[label],available=Boolean(drill&&insights.drilldowns?.[drill]);return available?`<button type="button" class="stat ames-kpi-button${selected===drill?' active':''}" data-reuse-drill="${esc(drill)}"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">${t('ver itens','view items')}</span></button>`:`<div class="stat ames-kpi-disabled"><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(fmt(value))}</strong><span class="stat-note">${t('sem drill-down nesta leitura','no drill-down in this read')}</span></div>`}).join('')}</div></section>`;}).join('')}
      ${selected?`<section class="mes-context-panel ames-selected-evidence">${sectionHead(t('Itens exatos em evidência','Exact evidence items'),t(`${rows.length} registro(s) sustentam o indicador selecionado. A lista abaixo é exatamente a evidência que forma o número.`,`${rows.length} record(s) support the selected indicator. The list below is the exact evidence forming the value.`),`<button type="button" class="button secondary" data-reuse-clear>${t('Fechar evidência','Close evidence')}</button>`)}${rows.length?`<div class="ames-evidence-hero"><small>${t('Primeiro item do conjunto','First item in the set')}</small><b>${esc(reuseExactId(rows[0],selected)||t('Identificador não informado','Identifier not provided'))}</b><span>${esc(reuseMeta(rows[0],selected))}</span></div>`:''}${rowsTable(rows,reuseColumns(rows[0]||{},selected),{empty:t('O indicador existe, mas nenhum registro detalhado foi retornado nesta leitura.','The indicator exists, but no detailed records were returned in this read.'),highlight:(_,i)=>i===0})}</section>`:''}`;
    // Preserve all detailed source KPI values and drill-downs, but collapse
    // their duplicate visible matrices behind one optional audit panel.
    const sourceGroups=[...root.querySelectorAll('.ames-reuse-group')];
    if(sourceGroups.length){
      const technical=document.createElement('details');
      technical.className='mes-context-panel ames-reuse-technical';
      technical.innerHTML='<summary>Indicadores técnicos adicionais da coleta</summary><p>Estas métricas pertencem à fonte A-MES e não devem ser somadas aos SNs observados acima.</p>';
      sourceGroups[0].before(technical);
      for(const group of sourceGroups)technical.append(group);
    }
    if(snapshot){const matrix=document.createElement('details');matrix.className='mes-context-panel ames-reuse-component-details';matrix.innerHTML='<summary>Matriz de componentes e vínculos · auditoria</summary>'+componentMatrixHtml(snapshot);root.append(matrix);}
    if(snapshot){const cohorts=document.createElement('section');cohorts.className='mes-context-panel';cohorts.dataset.reuseCohorts='';root.children[0].after(cohorts);mountReuseCohorts(cohorts,snapshot);}
    const advanced=document.createElement('details');advanced.className='mes-context-panel ames-reuse-granularity';advanced.innerHTML=`<summary><b>${t('Análise detalhada / gráficos e vínculos','Detailed analysis / charts and links')}</b><span>${t('Abra quando precisar cruzar PCBAs, Material SN, grupos e processo 3022.','Open when you need to cross-reference PCBAs, Material SNs, groups and the 3022 process.')}</span></summary><div data-reuse-granular-host></div>`;root.append(advanced);
    let advancedMounted=false;const mountAdvanced=()=>{if(advancedMounted)return;advancedMounted=true;mountReuseTable(advanced.querySelector('[data-reuse-granular-host]'),snapshot);};advanced.addEventListener('toggle',()=>{if(advanced.open)mountAdvanced();});
    for(const btn of root.querySelectorAll('[data-reuse-line-tab]'))btn.addEventListener('click',()=>{line=btn.dataset.reuseLineTab;store.updateContext?.({line_id:line});selected='';last='';render();});
    root.querySelector('[data-reuse-clear]')?.addEventListener('click',()=>{selected='';last='';render();});
    for(const btn of root.querySelectorAll('[data-reuse-drill]'))btn.addEventListener('click',()=>{selected=btn.dataset.reuseDrill;last='';render();requestAnimationFrame(()=>root.querySelector('.ames-selected-evidence')?.scrollIntoView({behavior:'smooth',block:'start'}));});
  }
  return {render,clear(){root?.replaceChildren();last='';selected='';}};
}

const kindClass=kind=>{const value=String(kind||'').toLowerCase();if(value.includes('causa')||value.includes('confirmed'))return'cause';if(value.includes('hip')||value.includes('hyp'))return'hypothesis';if(value.includes('corr'))return'correlation';return'fact';};
const kindLabel=kind=>{const cls=kindClass(kind);return cls==='cause'?t('Causa confirmada','Confirmed cause'):cls==='hypothesis'?t('Hipótese','Hypothesis'):cls==='correlation'?t('Correlação','Correlation'):t('Fato / evidência','Fact / evidence');};

export function createKnowledgeConsoleView(root,client,store){
  let mounted=false,line=store.context?.().line_id||store.preferredLine?.()||LINE_IDS[0],result=[],query='',busy=false,error='';
  function adoptSharedLine(){
    const shared=store.context?.().line_id;if(!LINE_IDS.includes(shared)||shared===line)return false;
    line=shared;result=[];query='';error='';
    const select=root.querySelector('[data-knowledge-line]');if(select)select.value=line;
    const input=root.querySelector('[data-knowledge-q]');if(input)input.value='';
    if(mounted)paint();
    return true;
  }
  function paint(){
    const host=root.querySelector('[data-knowledge-result]');if(!host)return;
    if(busy){host.innerHTML=`<div class="ames-empty ames-empty-large"><span>…</span><h3>${t('Buscando conhecimento operacional','Searching operational knowledge')}</h3><p>${t('A CORA consulta a mesma base A-MES; ela não transforma correlação em causa.','CORA queries the same A-MES database; it does not turn correlation into causation.')}</p></div>`;return;}
    if(error){host.innerHTML=`<div class="notice warn"><b>${t('Falha na busca local','Local search failed')}</b><br>${esc(error)}<br><small>${t('Erro de transporte/consulta não é fato, correlação, hipótese nem causa.','A transport/query error is not a fact, correlation, hypothesis or cause.')}</small></div>`;return;}
    if(!query){host.innerHTML=`<div class="ames-empty ames-empty-large"><span>C</span><h3>${t('Pesquise na mesma base da Central','Search the Work Center database')}</h3><p>${t('Use PCBA, Material SN, Defect Code, descrição, CPH ou posto de processo. Fato, correlação, hipótese e causa confirmada permanecem separados.','Use PCBA, Material SN, Defect Code, description, CPH or process station. Facts, correlations, hypotheses and confirmed causes remain separate.')}</p></div>`;return;}
    if(!result.length){host.innerHTML=`<div class="ames-empty ames-empty-large"><span>⌕</span><h3>${t('Nenhum resultado nesta leitura','No results in this read')}</h3><p>${t('Isso não prova ausência no MES; significa apenas que a base local disponível não retornou correspondência.','This does not prove absence from MES; it only means the available local database returned no match.')}</p></div>`;return;}
    host.innerHTML=`<div class="ames-knowledge-summary"><span><b>${result.length}</b> ${t('resultado(s)','result(s)')}</span><span>${t('Linha','Line')} <b>${esc(line)}</b></span><span>${t('Busca','Query')} <b>${esc(query)}</b></span></div><div class="ames-knowledge-list">${result.map(row=>{const cls=kindClass(row.kind);return`<article class="ames-knowledge-card ${cls}"><div class="ames-knowledge-card-head"><span class="ames-knowledge-kind">${esc(kindLabel(row.kind))}</span><small>${esc(row.source||t('fonte local','local source'))}</small></div><h3>${esc(row.defect_code||row.pcba_sn||row.item_sn||row.kind||t('Evidência','Evidence'))}</h3><p>${esc(row.text||row.defect_desc||row.description||'')}</p><div class="ames-knowledge-meta">${row.pcba_sn?`<span>PCBA <b>${esc(row.pcba_sn)}</b></span>`:''}${row.line?`<span>${t('Linha','Line')} <b>${esc(row.line)}</b></span>`:''}${row.defect_desc?`<span>${esc(row.defect_desc)}</span>`:''}</div></article>`}).join('')}</div>`;
  }
  async function search(){query=root.querySelector('[data-knowledge-q]').value.trim();error='';if(!query){result=[];paint();return;}busy=true;paint();try{
    if(store&&store.agent().status!=='connected'){
      const snapshot=store.read(line).snapshot;
      if(!snapshot)throw Error(t('Sem dados compartilhados para esta linha.','No shared data for this line.'));
      result=(snapshot.occurrences||[]).filter(r=>JSON.stringify([r.pcba_sn,r.defect_code,r.defect_desc,r.product_key]).toLowerCase().includes(query.toLowerCase())).map(r=>({...r,kind:'fact',source:'3028 · snapshot',text:r.defect_desc}));
    }else{const r=await client.auxiliary('search',{line,q:query});result=r.results||r.rows||[];}
  }catch(err){result=[];error=err.message;}finally{busy=false;paint();}}
  function render(){
    adoptSharedLine();
    if(!mounted){root.innerHTML=`<section class="mes-context-panel ames-knowledge-search">${sectionHead(t('CORA · conhecimento A-MES','CORA · A-MES knowledge'),t('Busca estruturada na mesma base operacional. Causa só é exibida como confirmada quando a fonte a classifica assim.','Structured search in the same operational database. A cause is only confirmed when classified as such by the source.'))}<div class="ames-knowledge-query"><label>${t('Linha','Line')}<select data-knowledge-line>${lineOptions(line)}</select></label><label>${t('Buscar','Search')}<input data-knowledge-q placeholder="${t('PCBA, Material SN, falha, CPH, processo...','PCBA, Material SN, failure, CPH, process...')}"></label><button class="button primary" data-knowledge-run>${t('Buscar','Search')}</button></div><div class="ames-knowledge-legend"><span class="fact">${t('Fato / evidência','Fact / evidence')}</span><span class="correlation">${t('Correlação','Correlation')}</span><span class="hypothesis">${t('Hipótese','Hypothesis')}</span><span class="cause">${t('Causa confirmada','Confirmed cause')}</span></div></section><section data-knowledge-result></section>`;mounted=true;root.querySelector('[data-knowledge-line]').addEventListener('change',e=>{line=e.target.value;store.updateContext?.({line_id:line});result=[];error='';query='';root.querySelector('[data-knowledge-q]').value='';paint();});root.querySelector('[data-knowledge-run]').addEventListener('click',search);root.querySelector('[data-knowledge-q]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});paint();}
  }
  return {render,clear(){root?.replaceChildren();mounted=false;result=[];query='';busy=false;error='';}};
}
