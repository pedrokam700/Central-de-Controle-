import {LINE_IDS} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';
import {reuseLinks} from './data/reuse-analysis.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const uniq=a=>[...new Set(a.filter(v=>v!==null&&v!==undefined&&String(v)!==''))];
const first=(obj,...keys)=>keys.map(k=>obj?.[k]).find(v=>v!==null&&v!==undefined&&String(v)!=='')??null;
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const day=v=>String(v||'').slice(0,10);
const pcbaOf=r=>first(r,'current_pcba_sn','pcba_sn','PCBA atual','PCBA');
const relationText=v=>String(v||'').replaceAll('_',' ').replace('FALHA SIMILAR','MESMA FAMÍLIA').replace('FALHA DIFERENTE','OUTRA FALHA').toUpperCase();

function records(snapshot,name){
  if(name==='defects')return snapshot?.occurrences||snapshot?.canonical?.datasets?.defects||[];
  if(name==='pcba_history')return snapshot?.pcba_history?.records||snapshot?.canonical?.datasets?.pcba_history||[];
  if(name==='process_contexts')return snapshot?.process_timeline?.contexts||snapshot?.process_contexts||[];
  return [];
}

function repairCandidate(occ){
  const rows=[...(occ?.repair_evidence_3012||[])];
  if(!rows.length)return {best:null,rows:[]};
  const score=r=>{
    let s=0;
    if(String(r.defect_code||'')===String(occ.defect_code||''))s+=100;
    if(day(r.defect_time)===day(occ.defect_time))s+=30;
    if(r.repair_comment)s+=10;
    if(r.repair_user)s+=5;
    return s;
  };
  rows.sort((a,b)=>score(b)-score(a)||String(b.repair_time||b.defect_time||'').localeCompare(String(a.repair_time||a.defect_time||'')));
  return {best:rows[0],rows};
}

function selfReuseMaps(snapshot){
  const drill=snapshot?.insights?.drilldowns||{};
  const reused=[...(drill.pcba_second_use||[]),...(drill.pcba_3plus_use||[]),...(drill.pcba_reused_with_prior_failure||[])];
  const withFailure=drill.pcba_reused_with_prior_failure||[];
  const reuse=new Map(),prior=new Map();
  for(const row of reused){const id=pcbaOf(row);if(id)reuse.set(String(id),row);}
  for(const row of withFailure){const id=pcbaOf(row);if(id)prior.set(String(id),row);}
  return {reuse,prior};
}

function priorFailureText(row,history=[]){
  const codes=uniq([first(row,'Defect Code antigo','previous_defect_code','prior_defect_code','defect_code'),...history.map(h=>h.defect_code)]);
  const descs=uniq([first(row,'Defect Description antigo','previous_defect_desc','prior_defect_desc','defect_desc'),...history.map(h=>h.defect_desc)]);
  return {code:codes.join(', ')||null,desc:descs.join(' | ')||null};
}

export function buildDailyFailureRows(store){
  const out=[];
  for(const line of LINE_IDS){
    const snapshot=store.read(line)?.snapshot;if(!snapshot)continue;
    const occurrences=records(snapshot,'defects'),contexts=records(snapshot,'process_contexts'),history=records(snapshot,'pcba_history');
    const links=reuseLinks(snapshot),linksByPcba=new Map();
    for(const link of links){if(!linksByPcba.has(link.pcba))linksByPcba.set(link.pcba,[]);linksByPcba.get(link.pcba).push(link);}
    const self=selfReuseMaps(snapshot);
    for(const occ of occurrences){
      const pcba=String(occ.pcba_sn||'');
      const ctx=contexts.find(c=>c.defect_key&&c.defect_key===occ.defect_key)||contexts.find(c=>c.pcba_sn===pcba&&String(c.defect_code||'')===String(occ.defect_code||''))||{};
      const repairs=repairCandidate(occ),repair=repairs.best||{};
      const componentLinks=linksByPcba.get(pcba)||[];
      const componentHistory=componentLinks.filter(r=>r.history_code||r.history_desc);
      const componentFamilies=uniq(componentLinks.map(r=>r.component_group||r.family||r.item_type));
      const componentHistoryFamilies=uniq(componentHistory.map(r=>r.component_group||r.family||r.item_type));
      const relation=uniq(componentLinks.flatMap(r=>String(r.relations||'').split(',').map(x=>relationText(x.trim())).filter(Boolean)));
      const reused=self.reuse.get(pcba),selfPrior=self.prior.get(pcba);
      const historyRows=history.filter(h=>String(h.pcba_sn||'')===pcba&&String(h.defect_time||'')!==String(occ.defect_time||''));
      const prior=priorFailureText(selfPrior, selfPrior?historyRows:[]);
      const productionTime=occ.production_event_time||ctx.production_event_time||ctx.reference_event_time||null;
      const productionShift=occ.production_shift||ctx.production_shift||null;
      const operationalDate=occ.production_operational_date||ctx.production_operational_date||day(occ.defect_time)||null;
      const explicitCause=Boolean(occ.root_cause_confirmed||repair.root_cause_confirmed||componentLinks.some(r=>r.root_cause_confirmed));
      out.push({
        line,pcba,defect_key:occ.defect_key||null,defect_code:occ.defect_code||null,defect_desc:occ.defect_desc||null,defect_time:occ.defect_time||null,
        product:occ.product_model||occ.product_key||occ.product||null,repair_status:occ.repair_status||null,registration_mode:occ.registration_mode||occ.manual_or_auto||occ['Manual/Automatic']||null,
        production_event_time:productionTime,production_shift:productionShift,production_operational_date:operationalDate,
        repair_user:repair.repair_user||null,repair_comment:repair.repair_comment||null,repair_time:repair.repair_time||null,repair_code:repair.repair_code||null,repair_rows:repairs.rows,
        pcba_reused:Boolean(reused),pcba_prior_failure:Boolean(selfPrior),pcba_prior_failure_code:prior.code,pcba_prior_failure_desc:prior.desc,
        component_links:componentLinks,component_links_count:componentLinks.length,component_families:componentFamilies,component_group_count:componentFamilies.length,
        component_history_links:componentHistory,component_history_count:componentHistory.length,component_history_families:componentHistoryFamilies,
        relations:relation,cause_confirmed:explicitCause,
        reuse_present:Boolean(reused||componentLinks.length),reuse_with_failure:Boolean(selfPrior||componentHistory.length),
        source_snapshot:snapshot.snapshot_id||null,
      });
    }
  }
  return out;
}

export function filterDailyFailureRows(rows,state={}){
  const q=norm(state.query||''),name=norm(state.defectName||'');
  return rows.filter(r=>{
    if(state.line&&r.line!==state.line)return false;
    if(state.shift&&r.production_shift!==state.shift)return false;
    if(state.product&&r.product!==state.product)return false;
    if(state.defect&&String(r.defect_code||'')!==String(state.defect))return false;
    if(name&&!norm(r.defect_desc).includes(name))return false;
    if(state.repairUser&&!norm(r.repair_user).includes(norm(state.repairUser)))return false;
    if(state.pcba&&!norm(r.pcba).includes(norm(state.pcba)))return false;
    if(state.family&&!r.component_families.some(v=>norm(v)===norm(state.family)))return false;
    if(state.relation&&!r.relations.some(v=>norm(v).includes(norm(state.relation))))return false;
    if(state.reuse==='present'&&!r.reuse_present)return false;
    if(state.reuse==='with_failure'&&!r.reuse_with_failure)return false;
    if(state.reuse==='pcba_failure'&&!r.pcba_prior_failure)return false;
    if(state.reuse==='component_failure'&&!r.component_history_count)return false;
    if(state.reuse==='both'&&!(r.pcba_prior_failure&&r.component_history_count))return false;
    const d=r.production_operational_date||day(r.defect_time);
    if(state.from&&d<state.from)return false;
    if(state.to&&d>state.to)return false;
    if(q&&!norm([r.pcba,r.defect_code,r.defect_desc,r.product,r.repair_user,r.repair_comment,r.pcba_prior_failure_desc,r.component_families.join(' '),r.relations.join(' ')].join(' ')).includes(q))return false;
    return true;
  });
}

export function rankDailyFailures(rows){
  const map=new Map();
  for(const row of rows){
    const key=JSON.stringify([row.defect_code||'',row.defect_desc||'']);
    if(!map.has(key))map.set(key,{code:row.defect_code||'',description:row.defect_desc||'',rows:[]});
    map.get(key).rows.push(row);
  }
  const total=rows.length||1;let cumulative=0;
  return [...map.values()].map(g=>{
    const count=g.rows.length,pcbas=uniq(g.rows.map(r=>r.pcba)),reusePcbas=uniq(g.rows.filter(r=>r.reuse_with_failure).map(r=>r.pcba));
    const componentHistory=uniq(g.rows.flatMap(r=>r.component_history_links.map(x=>x.material))).length;
    return {...g,count,pcbas:pcbas.length,lines:uniq(g.rows.map(r=>r.line)),shifts:{first:g.rows.filter(r=>r.production_shift==='1st Shift').length,second:g.rows.filter(r=>r.production_shift==='2nd Shift').length,unknown:g.rows.filter(r=>!r.production_shift).length},reusePcbas:reusePcbas.length,componentHistory,percent:count/total*100};
  }).sort((a,b)=>b.count-a.count||String(a.code).localeCompare(String(b.code))).map(g=>({...g,cumulative:(cumulative+=g.percent)}));
}

function metric(model,name){return model?.aggregates?.find(x=>x.name===name)?.value??null;}
function productionMetrics(store,state){
  const lines=state.line?[state.line]:LINE_IDS;let quantity=0,weightedCheck=0,weight=0,complete=true;
  for(const line of lines){const m=selectDashboard(store,{line_id:line,product:state.product||undefined}),q=num(metric(m,'quantity')),c=num(metric(m,'check_fpy'));if(q===null){complete=false;continue;}quantity+=q;if(c!==null){weightedCheck+=c*q;weight+=q;}}
  return {quantity:complete?quantity:null,checkFpy:complete&&weight?weightedCheck/weight:null};
}

function selectOptions(values,selected,allLabel='Todos'){
  return `<option value="">${esc(allLabel)}</option>${uniq(values).sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).map(v=>`<option value="${esc(v)}"${String(v)===String(selected)?' selected':''}>${esc(v)}</option>`).join('')}`;
}
function shiftLabel(v){return v==='1st Shift'?'1º Turno':v==='2nd Shift'?'2º Turno':'Sem turno 3022';}
function fmtPct(v){return Number.isFinite(v)?`${v.toFixed(1)}%`:'—';}
function fmtRate(count,quantity){return Number.isFinite(quantity)&&quantity>0?`${(count/quantity*100).toFixed(2)}%`:'—';}

function occurrenceMiniTable(rows){
  if(!rows.length)return '<p>Nenhuma ocorrência.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>PCBA</th><th>Linha</th><th>Falha</th><th>Horário</th><th>Turno</th><th>AT</th><th>Reuso relevante</th></tr></thead><tbody>${rows.slice(0,250).map(r=>`<tr><td>${esc(r.pcba||'—')}</td><td>${esc(r.line)}</td><td>${esc(r.defect_desc||r.defect_code||'—')}</td><td>${esc(r.defect_time||'—')}</td><td>${esc(shiftLabel(r.production_shift))}</td><td>${esc(r.repair_comment||'—')}</td><td>${esc(r.reuse_with_failure?'Sim':'Não')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderRanking(rows,quantity){
  const ranking=rankDailyFailures(rows),max=ranking[0]?.count||1;
  if(!ranking.length)return '<div class="ames-empty"><span>—</span><p>Nenhuma falha no escopo selecionado.</p></div>';
  return `<div class="ames-dfa-ranking">${ranking.map((g,i)=>`<details class="ames-dfa-rank-item"><summary><span class="ames-dfa-rank-no">${i+1}</span><span class="ames-dfa-rank-name"><b>${esc(g.description||g.code||'Falha sem descrição')}</b><small>${esc(g.code||'Código não informado')} · ${g.pcbas} PCBA(s) · ${g.lines.map(x=>esc(x)).join(', ')}</small></span><span class="ames-dfa-rank-values"><b>${g.count}</b><small>${fmtPct(g.percent)} das falhas · ${fmtRate(g.count,quantity)} da produção</small></span></summary><div class="ames-dfa-bar"><i style="width:${Math.max(2,g.count/max*100)}%"></i></div><div class="ames-dfa-rank-meta"><span>Acumulado <b>${fmtPct(g.cumulative)}</b></span><span>1º turno <b>${g.shifts.first}</b></span><span>2º turno <b>${g.shifts.second}</b></span><span>PCBAs com reuso + falha histórica <b>${g.reusePcbas}</b></span><span>Materiais reutilizados com falha histórica <b>${g.componentHistory}</b></span></div>${occurrenceMiniTable(g.rows)}</details>`).join('')}</div>`;
}

function renderOccurrences(rows){
  if(!rows.length)return '<div class="ames-empty"><span>—</span><p>Nenhuma ocorrência no escopo selecionado.</p></div>';
  return `<div class="ames-dfa-occurrences">${rows.slice(0,800).map(r=>`<details class="ames-dfa-occurrence"><summary><span><b>${esc(r.defect_desc||r.defect_code||'Falha')}</b><small>${esc(r.pcba||'—')} · ${esc(r.line)} · ${esc(r.defect_time||'—')}</small></span><span><b>${esc(shiftLabel(r.production_shift))}</b><small>${esc(r.product||'CPH não informado')}</small></span></summary><div class="ames-dfa-occ-grid"><div><small>Processo 3022</small><b>${esc(r.production_event_time||'—')}</b><span>${esc(r.production_operational_date||'—')}</span></div><div><small>AT / 3012</small><b>${esc(r.repair_user||'—')}</b><span>${esc(r.repair_comment||'Sem comentário 3012 carregado')}</span></div><div><small>Própria PCBA</small><b>${r.pcba_prior_failure?'2º+ uso com falha histórica':r.pcba_reused?'2º+ uso sem falha histórica relevante':'Sem evidência de reuso da PCBA'}</b><span>${esc(r.pcba_prior_failure_desc||r.pcba_prior_failure_code||'—')}</span></div><div><small>Componentes reutilizados</small><b>${r.component_links_count} vínculo(s) · ${r.component_group_count} grupo(s)</b><span>${esc(r.component_history_count?`${r.component_history_count} vínculo(s) com falha histórica`:'Sem falha histórica relevante nos vínculos carregados')}</span></div><div><small>Relação histórica</small><b>${esc(r.relations.join(' · ')||'—')}</b><span>${r.cause_confirmed?'CAUSA CONFIRMADA POR EVIDÊNCIA EXPLÍCITA':'Associação não é causa confirmada'}</span></div></div>${r.component_links.length?`<div class="table-wrap"><table><thead><tr><th>Material SN</th><th>Grupo/família</th><th>PCBA anterior</th><th>Falha antiga</th><th>Relação</th></tr></thead><tbody>${r.component_links.map(x=>`<tr><td>${esc(x.material||'—')}</td><td>${esc(x.component_group||x.family||x.item_type||'—')}</td><td>${esc(x.previous_pcbas||'—')}</td><td>${esc(x.history_desc||x.history_code||'—')}</td><td>${esc(x.relations||'—')}</td></tr>`).join('')}</tbody></table></div>`:''}</details>`).join('')}</div><p>${rows.length>800?'Exibição limitada a 800 ocorrências neste modo; use filtros para refinar.':''}</p>`;
}

function renderMatrix(rows){
  const cell=(line,shift)=>rows.filter(r=>r.line===line&&r.production_shift===shift).length,unknown=line=>rows.filter(r=>r.line===line&&!r.production_shift).length;
  return `<div class="table-wrap"><table class="ames-dfa-matrix"><thead><tr><th>Linha</th><th>1º Turno</th><th>2º Turno</th><th>Sem turno 3022</th><th>Total</th></tr></thead><tbody>${LINE_IDS.map((line,i)=>{const a=cell(line,'1st Shift'),b=cell(line,'2nd Shift'),u=unknown(line);return `<tr><th>Linha ${i+1} · ${esc(line)}</th><td><button data-matrix-line="${esc(line)}" data-matrix-shift="1st Shift">${a}</button></td><td><button data-matrix-line="${esc(line)}" data-matrix-shift="2nd Shift">${b}</button></td><td>${u}</td><td><b>${a+b+u}</b></td></tr>`;}).join('')}</tbody></table></div>`;
}

function renderHourChart(rows){
  const bins=new Map();
  for(const r of rows){const raw=r.production_event_time||r.defect_time;if(!raw)continue;const d=new Date(raw);if(Number.isNaN(d.getTime()))continue;const h=String(d.getHours()).padStart(2,'0')+':00';bins.set(h,(bins.get(h)||0)+1);}
  const data=[...bins].sort((a,b)=>a[0].localeCompare(b[0])),max=Math.max(1,...data.map(x=>x[1]));
  return data.length?`<div class="ames-dfa-hour-chart">${data.map(([h,n])=>`<div><span>${h}</span><i><b style="width:${Math.max(2,n/max*100)}%"></b></i><strong>${n}</strong></div>`).join('')}</div>`:'<p>Sem horários 3022/Defect Time suficientes para o gráfico.</p>';
}

export function createDailyFailureAnalytics(root,store){
  let mounted=false,last='',state={mode:'ranking',query:'',line:'',shift:'',product:'',defect:'',defectName:'',repairUser:'',pcba:'',family:'',reuse:'',relation:'',from:'',to:''},initializedDate=false;
  function render(){
    const base=buildDailyFailureRows(store);
    if(!initializedDate&&base.length){const latest=uniq(base.map(r=>r.production_operational_date||day(r.defect_time)).filter(Boolean)).sort().at(-1);if(latest){state.from=latest;state.to=latest;}initializedDate=true;}
    const filtered=filterDailyFailureRows(base,state),metrics=productionMetrics(store,state),ranking=rankDailyFailures(filtered);
    const products=base.map(r=>r.product).filter(Boolean),defects=base.map(r=>r.defect_code).filter(Boolean),users=base.map(r=>r.repair_user).filter(Boolean),families=base.flatMap(r=>r.component_families),relations=base.flatMap(r=>r.relations);
    const key=JSON.stringify([state,base.map(r=>[r.source_snapshot,r.pcba,r.defect_key,r.repair_comment,r.production_shift,r.component_links_count]),document.documentElement.lang]);if(key===last)return;last=key;
    if(!mounted){root.classList.add('ames-daily-failure-analytics');mounted=true;}
    const uniquePcbas=uniq(filtered.map(r=>r.pcba)).length,reuseRelevant=uniq(filtered.filter(r=>r.reuse_with_failure).map(r=>r.pcba)).length,shift1=filtered.filter(r=>r.production_shift==='1st Shift').length,shift2=filtered.filter(r=>r.production_shift==='2nd Shift').length;
    root.innerHTML=`<section class="mes-context-panel ames-dfa-head"><div class="section-head"><div><h2>Falhas do dia · leitura operacional</h2><p>Bater o olho → identificar problema → expandir → entender as PCBAs envolvidas. Associação de reuso nunca é apresentada como causa sem evidência explícita.</p></div><span class="ames-runtime-job">${filtered.length} ocorrência(s)</span></div><div class="ames-summary-grid"><div class="stat"><span class="stat-label">Falhas</span><strong class="stat-value">${filtered.length}</strong></div><div class="stat"><span class="stat-label">PCBAs únicas</span><strong class="stat-value">${uniquePcbas}</strong></div><div class="stat"><span class="stat-label">1º turno</span><strong class="stat-value">${shift1}</strong></div><div class="stat"><span class="stat-label">2º turno</span><strong class="stat-value">${shift2}</strong></div><div class="stat"><span class="stat-label">Reuso + falha histórica</span><strong class="stat-value">${reuseRelevant}</strong></div><div class="stat"><span class="stat-label">Check FPY</span><strong class="stat-value">${metrics.checkFpy===null?'—':metrics.checkFpy.toFixed(2)+'%'}</strong></div></div></section>
    <section class="mes-context-panel ames-dfa-filters"><div class="mes-filters"><label>De<input type="date" data-dfa="from" value="${esc(state.from)}"></label><label>Até<input type="date" data-dfa="to" value="${esc(state.to)}"></label><label>Linha<select data-dfa="line">${selectOptions(LINE_IDS,state.line,'Todas')}</select></label><label>Turno<select data-dfa="shift"><option value="">Todos</option><option value="1st Shift"${state.shift==='1st Shift'?' selected':''}>1º Turno</option><option value="2nd Shift"${state.shift==='2nd Shift'?' selected':''}>2º Turno</option></select></label><label>CPH<select data-dfa="product">${selectOptions(products,state.product,'Todos')}</select></label><label>Defect Code<select data-dfa="defect">${selectOptions(defects,state.defect,'Todos')}</select></label><label>Nome da falha<input data-dfa="defectName" value="${esc(state.defectName)}"></label><label>Repair User<select data-dfa="repairUser">${selectOptions(users,state.repairUser,'Todos')}</select></label><label>PCBA<input data-dfa="pcba" value="${esc(state.pcba)}"></label><label>Família componente<select data-dfa="family">${selectOptions(families,state.family,'Todas')}</select></label><label>Reuso<select data-dfa="reuse"><option value="">Todos</option><option value="present"${state.reuse==='present'?' selected':''}>Reuso presente</option><option value="with_failure"${state.reuse==='with_failure'?' selected':''}>Reuso com histórico de falha</option><option value="pcba_failure"${state.reuse==='pcba_failure'?' selected':''}>PCBA reutilizada + falha antiga</option><option value="component_failure"${state.reuse==='component_failure'?' selected':''}>Componente reutilizado + falha antiga</option><option value="both"${state.reuse==='both'?' selected':''}>PCBA + componente</option></select></label><label>Relação<select data-dfa="relation">${selectOptions(relations,state.relation,'Todas')}</select></label><label>Busca geral<input data-dfa="query" value="${esc(state.query)}" placeholder="falha, comentário AT, SN..."></label></div><div class="mes-pagination"><button class="button secondary" data-dfa-clear>Limpar filtros</button></div></section>
    <section class="ames-dfa-mode-tabs"><button class="button ${state.mode==='ranking'?'primary':'secondary'}" data-dfa-mode="ranking">Ranking de falhas</button><button class="button ${state.mode==='occurrences'?'primary':'secondary'}" data-dfa-mode="occurrences">Ocorrências detalhadas</button><button class="button ${state.mode==='matrix'?'primary':'secondary'}" data-dfa-mode="matrix">Linha × turno</button></section>
    <section class="mes-context-panel ames-dfa-main">${state.mode==='ranking'?`<div class="section-head"><div><h3>Pareto completo</h3><p>Quantidade, percentual das falhas, acumulado e taxa sobre produção somente quando o denominador é confiável.</p></div><span>${metrics.quantity===null?'Quantidade produzida indisponível':'Produção no escopo: '+metrics.quantity}</span></div>${renderRanking(filtered,metrics.quantity)}`:state.mode==='occurrences'?`<div class="section-head"><div><h3>Ocorrências detalhadas</h3><p>Uma falha por linha lógica, com AT, turno, PCBA e reuso relevante.</p></div></div>${renderOccurrences(filtered)}`:`<div class="section-head"><div><h3>Linha × turno</h3><p>Clique em um valor para aplicar Linha + Turno como filtro.</p></div></div>${renderMatrix(filtered)}`}</section>
    <section class="mes-context-panel"><div class="section-head"><div><h3>Falhas por horário</h3><p>Usa horário de produção 3022 quando existe; Defect Time é apenas fallback visual e não muda a classificação de turno.</p></div></div>${renderHourChart(filtered)}</section>`;
    root.querySelectorAll('[data-dfa]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{state[el.dataset.dfa]=el.value;last='';render();}));
    root.querySelectorAll('[data-dfa-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.dfaMode;last='';render();});
    root.querySelector('[data-dfa-clear]')?.addEventListener('click',()=>{state={...state,query:'',line:'',shift:'',product:'',defect:'',defectName:'',repairUser:'',pcba:'',family:'',reuse:'',relation:'',from:'',to:''};initializedDate=true;last='';render();});
    root.querySelectorAll('[data-matrix-line]').forEach(b=>b.onclick=()=>{state.line=b.dataset.matrixLine;state.shift=b.dataset.matrixShift;last='';render();});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';}};
}
