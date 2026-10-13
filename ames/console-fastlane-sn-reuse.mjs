import { LINE_IDS } from './data/contract.mjs';
import { escapeHtml as esc } from './evidence-view.mjs';

const fmt=value=>value===null||value===undefined||value===''?'—':String(value);
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??'';
const relationLabel=value=>({MESMA_FALHA:'MESMA FALHA',FALHA_SIMILAR:'MESMA FAMÍLIA / SIMILAR',FALHA_DIFERENTE:'OUTRA FALHA',SEM_HISTORICO:'SEM HISTÓRICO',SEM_FALHA_ATUAL:'SEM FALHA ATUAL'})[String(value||'').toUpperCase()]||fmt(value);
const normalize=value=>String(value||'').trim().toLowerCase();

function componentFamily(row={}){
  const raw=normalize([row.component_family,row.item_type,row.material_type,row['Tipo material'],row.part_name,row.part_number,row.material_code,row.item_code,row['Part Number'],row.description].filter(Boolean).join(' '));
  if(!raw)return 'Não classificado';
  if(/front[\s_-]*camera|camera[\s_-]*front|frontal/.test(raw))return 'Front Camera';
  if(/rear[\s_-]*camera|main[\s_-]*camera|camera/.test(raw))return 'Camera';
  if(/lcd|screen|display/.test(raw))return 'Screen / LCD';
  if(/sub[\s_-]*board|subboard/.test(raw))return 'Sub Board';
  if(/speaker|loudspeaker/.test(raw))return 'Speaker';
  if(/receiver|earpiece/.test(raw))return 'Receiver';
  if(/antenna|\bant\b/.test(raw))return 'Antenna';
  if(/main[\s_-]*board|motherboard|pcba/.test(raw))return 'Main Board';
  if(/battery/.test(raw))return 'Battery';
  if(/motor|vibrator/.test(raw))return 'Motor';
  return first(row.item_type,row.material_type,row['Tipo material'],row.part_name,'Não classificado');
}

function htmlTable(rows,columns){
  if(!rows.length)return '<div class="ames-empty"><span>—</span><p>Nenhum registro para os filtros atuais.</p></div>';
  return `<div class="table-wrap ames-fastlane-table"><table><thead><tr>${columns.map(col=>`<th>${esc(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(col=>`<td>${esc(fmt(typeof col.value==='function'?col.value(row):row[col.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function snResult(store){
  const agent=store.agent();
  return agent.resultSource==='sn'?agent.job?.result:null;
}

function priorFailureFields(ev={}){
  return {
    pcba:first(ev.pcba_sn,ev.historical_pcba,ev.previous_pcba,ev['PCBA desvinculada']),
    relation:first(ev.relation,ev.relation_to_current_failure,ev.classification),
    code:first(ev.defect_code,ev['Defect Code'],ev.old_defect_code,ev['Defect Code antigo']),
    desc:first(ev.defect_desc,ev.defect_description,ev['Defect Description'],ev.old_defect_desc,ev['Defect Description antigo']),
    time:first(ev.defect_time,ev['Defect Time'],ev.old_defect_time),
    log:first(ev.manual_or_auto,ev['Manual/Automatic']),
    repair:first(ev.repair_status,ev['Repair Status']),
    reason:first(ev.reason,ev.note)
  };
}

function operatorCandidates(result={}){
  const trace=result.trace_3022||{};
  const local=result.local_snapshot||{};
  const pools=[];
  for(const value of [trace.process_passages,trace.rows,trace.raw_rows,local.process_contexts])if(Array.isArray(value))pools.push(...value);
  return pools.map(row=>{
    const code=first(row.operator_id,row.employee_id,row.user_id,row.badge,row.repair_user,row.analysis_user,row['Operator ID'],row['Repair User']);
    const name=first(row.operator_name,row.employee_name,row.user_name,row.repair_user_name,row.analysis_user_name,row['Operator Name']);
    const station=first(row.operation_code,row.station,row.reference_station_code,row['Operation Code']);
    const process=first(row.operation_name,row.process,row.repair_action,row['Operation Name']);
    const time=first(row.event_time,row.event_time_utc,row.reference_event_time,row.repair_event_time);
    return {code,name,station,process,time};
  }).filter(row=>row.code||row.name).filter(row=>normalize(row.station).includes('a6900')||normalize(row.process).includes('export repair')||row.code||row.name);
}

function renderSnEnhancement(root,store){
  root.querySelector('[data-fastlane-sn]')?.remove();
  const result=snResult(store);if(!result)return;
  const trace2114=result.trace_2114||{},trace3074=result.trace_3074||{};
  const previous=Array.isArray(trace2114.previous_failures)?trace2114.previous_failures:[];
  const reused=Array.isArray(trace3074.reused_components)?trace3074.reused_components:[];
  const historicalMaterials=[];
  for(const item of reused){
    const evidence=Array.isArray(item.previous_pcba_evidence)?item.previous_pcba_evidence:[];
    for(const ev of evidence)historicalMaterials.push({
      family:componentFamily(item),material_sn:first(item.item_sn,item.material_sn),material_type:first(item.item_type,item.material_type),
      uses:first(item.known_use_count,item.use_count),reuses:first(item.reuse_count,item.reuses),...priorFailureFields(ev)
    });
  }
  const operators=operatorCandidates(result);
  const section=document.createElement('section');section.dataset.fastlaneSn='1';section.className='ames-fastlane-sn';
  section.innerHTML=`<section class="mes-context-panel ames-fastlane-panel"><div class="section-head"><div><h3>Histórico enriquecido</h3><p>Nome da falha antiga da própria PCBA e dos componentes reutilizados, sem transformar ausência de fonte em zero.</p></div><span class="status">SN 360°</span></div>
    <div class="ames-fastlane-grid"><div><h4>Falhas antigas da PCBA</h4>${htmlTable(previous.map(row=>({code:first(row['Defect Code'],row.defect_code),desc:first(row['Defect Description'],row.defect_desc,row.defect_description),time:first(row['Defect Time'],row.defect_time),relation:relationLabel(first(row.relation,row.relation_to_current_failure)),log:first(row['Manual/Automatic'],row.manual_or_auto),repair:first(row['Repair Status'],row.repair_status)})),[
      {key:'code',label:'Defect Code'},{key:'desc',label:'Nome da falha'},{key:'time',label:'Defect Time'},{key:'relation',label:'Relação'},{key:'log',label:'Log'},{key:'repair',label:'Repair'}])}</div>
    <div><h4>Falhas antigas ligadas aos materiais</h4>${htmlTable(historicalMaterials,[
      {key:'family',label:'Componente'},{key:'material_sn',label:'Material SN'},{key:'pcba',label:'PCBA anterior'},{key:'code',label:'Defect Code antigo'},{key:'desc',label:'Nome da falha antiga'},{key:'time',label:'Defect Time antigo'},{key:'relation',label:'Relação',value:r=>relationLabel(r.relation)}])}</div></div>
    ${operators.length?`<div class="ames-fastlane-operator"><h4>Análise / reparo identificado no 3022</h4>${htmlTable(operators,[{key:'code',label:'Código'},{key:'name',label:'Nome'},{key:'station',label:'Posto'},{key:'process',label:'Processo'},{key:'time',label:'Horário'}])}<small>Exibido somente quando o retorno real da 3022 fornece operador/analisador.</small></div>`:''}
  </section>`;
  root.querySelector('[data-sn-result]')?.append(section);
}

export function withFastlaneSnEnhancements(base,root,store){
  return {render(){base.render();renderSnEnhancement(root,store);},clear(){base.clear?.();root.querySelector('[data-fastlane-sn]')?.remove();}};
}

const LINK_COLUMNS=[
  {key:'currentPcba',label:'PCBA atual'},{key:'line',label:'Linha'},{key:'model',label:'CPH / modelo'},{key:'family',label:'Componente'},{key:'materialType',label:'Tipo material'},{key:'materialSn',label:'Material SN'},{key:'partNumber',label:'Part Number'},{key:'defectCode',label:'Defect Code atual'},{key:'defectDesc',label:'Falha atual'},{key:'historicalPcba',label:'PCBA anterior'},{key:'oldDefectCode',label:'Defect Code antigo'},{key:'oldDefectDesc',label:'Falha antiga'},{key:'relation',label:'Relação'},{key:'reuseCount',label:'Reusos'}
];
const PCBA_COLUMNS=[
  {key:'currentPcba',label:'PCBA atual'},{key:'line',label:'Linha'},{key:'model',label:'CPH / modelo'},{key:'defectCodes',label:'Falha atual'},{key:'materialCount',label:'Materiais reutilizados'},{key:'families',label:'Famílias / componentes'},{key:'historicalCount',label:'PCBAs históricas'},{key:'relations',label:'Relações'}
];

function normalizeReuseRow(row={}){
  return {
    currentPcba:first(row.current_pcba_sn,row.pcba_sn,row['PCBA atual'],row.PCBA,row['PCBA']),
    line:first(row.line,row.Linha),model:first(row.product_model,row.model,row.Modelo),
    materialSn:first(row.item_sn,row.material_sn,row['Material SN']),materialType:first(row.item_type,row.material_type,row['Tipo material']),
    partNumber:first(row.part_number,row.material_code,row.item_code,row['Part Number']),
    defectCode:first(row.defect_code,row['Defect Code atual'],row['Defect Code']),defectDesc:first(row.defect_desc,row['Defect Description atual'],row['Defect Description']),
    historicalPcba:first(row.historical_pcba,row['PCBA desvinculada'],row.previous_pcba),
    oldDefectCode:first(row.old_defect_code,row['Defect Code antigo']),oldDefectDesc:first(row.old_defect_desc,row['Defect Description antigo']),
    relation:relationLabel(first(row.relation,row['Classificação desta PCBA'],row.relation_to_current_failure,row['Situação da PCBA'])),
    reuseCount:first(row.reuse_count,row['Reusos conhecidos material'],row['Reusos anteriores material']),
    family:componentFamily(row),raw:row
  };
}

function allReuseRows(insights){
  const rows=[];for(const [drill,list] of Object.entries(insights?.drilldowns||{}))for(const row of list||[])rows.push({...normalizeReuseRow(row),drill});
  const seen=new Set();return rows.filter(row=>{const key=[row.currentPcba,row.materialSn,row.historicalPcba,row.defectCode,row.oldDefectCode,row.drill].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
function pcbaRows(links){
  const map=new Map();
  for(const row of links){if(!row.currentPcba)continue;let item=map.get(row.currentPcba);if(!item){item={currentPcba:row.currentPcba,line:row.line,model:row.model,defects:new Set(),materials:new Set(),families:new Set(),historical:new Set(),relations:new Set()};map.set(row.currentPcba,item);}if(row.defectCode)item.defects.add(row.defectCode);if(row.materialSn)item.materials.add(row.materialSn);if(row.family)item.families.add(row.family);if(row.historicalPcba)item.historical.add(row.historicalPcba);if(row.relation&&row.relation!=='—')item.relations.add(row.relation);}
  return [...map.values()].map(item=>({currentPcba:item.currentPcba,line:item.line,model:item.model,defectCodes:[...item.defects].join(', '),materialCount:item.materials.size,families:[...item.families].join(', '),historicalCount:item.historical.size,relations:[...item.relations].join(', ')}));
}

function csvDownload(rows,columns,filename){
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;const body=[columns.map(c=>quote(c.label)).join(';'),...rows.map(r=>columns.map(c=>quote(r[c.key])).join(';'))].join('\n');
  const blob=new Blob(['\uFEFF'+body],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function withFastlaneReuseEnhancements(base,root,store){
  const state={mode:'pcba',search:'',family:'',relation:'',preset:'PCBAs AFETADAS',hidden:new Set()};let installed=false;
  function currentLine(){return root.querySelector('[data-reuse-line]')?.value||LINE_IDS.find(id=>store.read(id)?.snapshot?.insights)||LINE_IDS[0];}
  function renderPanel(){
    root.querySelector('[data-fastlane-reuse]')?.remove();const line=currentLine(),insights=store.read(line)?.snapshot?.insights;if(!insights)return;
    const links=allReuseRows(insights),pcbas=pcbaRows(links);let rows=state.mode==='links'?links:pcbas;
    if(state.family&&state.mode==='links')rows=rows.filter(r=>r.family===state.family);if(state.family&&state.mode==='pcba')rows=rows.filter(r=>normalize(r.families).includes(normalize(state.family)));
    if(state.relation)rows=rows.filter(r=>normalize(state.mode==='links'?r.relation:r.relations).includes(normalize(state.relation)));
    if(state.search){const q=normalize(state.search);rows=rows.filter(r=>normalize(Object.values(r).filter(v=>typeof v!=='object').join(' ')).includes(q));}
    const uniqueLinks=new Set(links.map(r=>[r.currentPcba,r.materialSn,r.historicalPcba].join('|'))).size,uniqueMaterials=new Set(links.map(r=>r.materialSn).filter(Boolean)).size;
    const sameFailurePcbas=new Set(links.filter(r=>normalize(r.relation).includes('mesma falha')).map(r=>r.currentPcba).filter(Boolean)).size;
    const families=[...new Set(links.map(r=>r.family).filter(Boolean))].sort();const relations=[...new Set(links.map(r=>r.relation).filter(v=>v&&v!=='—'))].sort();
    const allColumns=state.mode==='links'?LINK_COLUMNS:PCBA_COLUMNS,columns=allColumns.filter(c=>!state.hidden.has(c.key));
    const panel=document.createElement('section');panel.dataset.fastlaneReuse='1';panel.className='mes-context-panel ames-fastlane-panel ames-fastlane-reuse';
    panel.innerHTML=`<div class="section-head"><div><h3>Análise configurável de reuso</h3><p>Separe quantidade real de PCBAs afetadas da quantidade de vínculos de materiais sem perder a evidência individual.</p></div><span class="status">visão tipo SAP</span></div>
      <div class="ames-fastlane-kpis"><div><small>PCBAs únicas afetadas</small><b>${pcbas.length}</b></div><div><small>Material SN únicos</small><b>${uniqueMaterials}</b></div><div><small>Vínculos encontrados</small><b>${uniqueLinks}</b></div><div><small>PCBAs com mesma falha</small><b>${sameFailurePcbas}</b></div></div>
      <div class="ames-fastlane-toolbar"><label>Visualização<select data-fl-mode><option value="pcba"${state.mode==='pcba'?' selected':''}>PCBAs únicas afetadas</option><option value="links"${state.mode==='links'?' selected':''}>Vínculos de material</option></select></label><label>Preset<select data-fl-preset>${['PCBAs AFETADAS','MATERIAIS REUTILIZADOS','FALHA HISTÓRICA','PROCESSO / 3022','PADRÃO'].map(v=>`<option${state.preset===v?' selected':''}>${v}</option>`).join('')}</select></label><label>Componente<select data-fl-family><option value="">Todos</option>${families.map(v=>`<option${state.family===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Relação<select data-fl-relation><option value="">Todas</option>${relations.map(v=>`<option${state.relation===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label class="ames-fastlane-search">Busca<input data-fl-search value="${esc(state.search)}" placeholder="PCBA, Screen, câmera, SN, falha..."></label><button class="button secondary" data-fl-export>Exportar visão</button></div>
      <details class="ames-fastlane-columns"><summary>Colunas visíveis (${columns.length}/${allColumns.length})</summary><div>${allColumns.map(c=>`<label><input type="checkbox" data-fl-column="${esc(c.key)}"${state.hidden.has(c.key)?'':' checked'}>${esc(c.label)}</label>`).join('')}<button class="button secondary" data-fl-reset>Restaurar padrão</button></div></details>
      <div class="ames-fastlane-count"><b>${rows.length}</b> linha(s) na visão filtrada · Linha ${esc(line)}</div>${htmlTable(rows,columns)}`;
    root.append(panel);
    panel.querySelector('[data-fl-mode]').addEventListener('change',e=>{state.mode=e.target.value;state.hidden.clear();renderPanel();});
    panel.querySelector('[data-fl-preset]').addEventListener('change',e=>{state.preset=e.target.value;if(state.preset==='MATERIAIS REUTILIZADOS')state.mode='links';if(state.preset==='PCBAs AFETADAS')state.mode='pcba';renderPanel();});
    panel.querySelector('[data-fl-family]').addEventListener('change',e=>{state.family=e.target.value;renderPanel();});
    panel.querySelector('[data-fl-relation]').addEventListener('change',e=>{state.relation=e.target.value;renderPanel();});
    panel.querySelector('[data-fl-search]').addEventListener('input',e=>{state.search=e.target.value;renderPanel();requestAnimationFrame(()=>{const input=root.querySelector('[data-fl-search]');input?.focus();input?.setSelectionRange(state.search.length,state.search.length);});});
    panel.querySelector('[data-fl-export]').addEventListener('click',()=>csvDownload(rows,columns,`AMES_reuso_${state.mode}_${line}.csv`));
    panel.querySelector('[data-fl-reset]').addEventListener('click',()=>{state.hidden.clear();state.search='';state.family='';state.relation='';state.mode='pcba';state.preset='PCBAs AFETADAS';localStorage.removeItem('ames.reuse.fastlane.columns');renderPanel();});
    for(const input of panel.querySelectorAll('[data-fl-column]'))input.addEventListener('change',e=>{e.target.checked?state.hidden.delete(e.target.dataset.flColumn):state.hidden.add(e.target.dataset.flColumn);try{localStorage.setItem('ames.reuse.fastlane.columns',JSON.stringify([...state.hidden]));}catch{}renderPanel();});
  }
  function install(){if(installed)return;installed=true;try{state.hidden=new Set(JSON.parse(localStorage.getItem('ames.reuse.fastlane.columns')||'[]'));}catch{}
    root.addEventListener('change',e=>{if(e.target.matches('[data-reuse-line]'))requestAnimationFrame(renderPanel);});
    root.addEventListener('click',e=>{if(e.target.closest('[data-reuse-drill],[data-reuse-clear]'))requestAnimationFrame(renderPanel);});
  }
  return {render(){install();base.render();renderPanel();},clear(){base.clear?.();root.querySelector('[data-fastlane-reuse]')?.remove();}};
}
