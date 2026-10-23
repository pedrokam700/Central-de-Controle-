import {defectDescription,defectLabel} from './defect-label.mjs';
import {targetRankingRows,targetRankingCoverage} from './data/target-impact.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {selectDashboard} from './data/dashboard.mjs';
import {reuseLinks} from './data/reuse-analysis.mjs';
import {productionEvidenceForOccurrence,parseFailureInstant} from './data/production-evidence.mjs';
import {factoryHourKey,formatFactoryDateTime as displayTime,formatFactoryDate as displayDate} from './data/time-display.mjs';
import {observedReuseDashboard,REUSE_GROUPS} from './data/daily-reuse-evidence.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const uniq=a=>[...new Set(a.filter(v=>v!==null&&v!==undefined&&String(v)!==''))];
const first=(obj,...keys)=>keys.map(k=>obj?.[k]).find(v=>v!==null&&v!==undefined&&String(v)!=='')??null;
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const day=v=>String(v||'').slice(0,10);
const pcbaOf=r=>first(r,'current_pcba_sn','pcba_sn','PCBA atual','PCBA');
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const relationText=v=>String(v||'').replaceAll('_',' ').replace('FALHA SIMILAR','MESMA FAMÍLIA').replace('FALHA DIFERENTE','OUTRA FALHA').toUpperCase();
const relationDisplay=v=>({
  'MESMA FALHA':t('MESMA FALHA','SAME FAILURE'),
  'MESMA FAMÍLIA':t('MESMA FAMÍLIA','SAME FAMILY'),
  'OUTRA FALHA':t('OUTRA FALHA','OTHER FAILURE')
}[String(v||'').toUpperCase()]||String(v||''));

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
      const production=productionEvidenceForOccurrence(occ,contexts);
      const repairs=repairCandidate(occ),repair=repairs.best||{};
      const componentLinks=linksByPcba.get(pcba)||[];
      const moment=parseFailureInstant(occ.defect_time);
      const componentLinksExact=componentLinks.filter(link=>
        String(link.pcba||'')===pcba&&String(link.defect_code||'')===String(occ.defect_code||'')&&
        moment!==null&&parseFailureInstant(link.defect_time)===moment);
      const componentHistory=componentLinks.filter(r=>r.history_code||r.history_desc);
      const componentFamilies=uniq(componentLinks.map(r=>r.component_group||r.family||r.item_type));
      const componentHistoryFamilies=uniq(componentHistory.map(r=>r.component_group||r.family||r.item_type));
      const relation=uniq(componentLinks.flatMap(r=>String(r.relations||'').split(',').map(x=>relationText(x.trim())).filter(Boolean)));
      const reused=self.reuse.get(pcba),selfPrior=self.prior.get(pcba);
      const historyRows=history.filter(h=>String(h.pcba_sn||'')===pcba&&String(h.defect_time||'')!==String(occ.defect_time||''));
      const prior=priorFailureText(selfPrior,selfPrior?historyRows:[]);
      const explicitCause=Boolean(occ.root_cause_confirmed||repair.root_cause_confirmed||componentLinks.some(r=>r.root_cause_confirmed));
      out.push({
        line,pcba,defect_key:occ.defect_key||null,defect_code:occ.defect_code||null,defect_desc:occ.defect_desc||null,defect_time:occ.defect_time||null,failure_record_date:day(occ.defect_time)||null,
        product:occ.product_model||occ.product_key||occ.product||null,repair_status:occ.repair_status||null,registration_mode:occ.registration_mode||occ.manual_or_auto||occ['Manual/Automatic']||null,
        production_event_time:production.event_time,production_shift:production.shift,production_operational_date:production.operational_date,production_evidence_proven:production.trusted,
        repair_user:repair.repair_user||occ.repair_user||null,repair_comment:repair.repair_comment||occ.repair_comment||null,repair_time:repair.repair_time||occ.repair_time||null,repair_code:repair.repair_code||occ.repair_code||null,repair_source:repairs.best?'3012':(occ.repair_source||occ.source_view||null),repair_rows:repairs.rows,
        pcba_reused:Boolean(reused),pcba_prior_failure:Boolean(selfPrior),pcba_prior_failure_code:prior.code,pcba_prior_failure_desc:prior.desc,
        component_links:componentLinks,component_links_count:componentLinks.length,
        component_links_exact:componentLinksExact,component_families:componentFamilies,component_group_count:componentFamilies.length,
        component_history_links:componentHistory,component_history_count:componentHistory.length,component_history_families:componentHistoryFamilies,
        relations:relation,cause_confirmed:explicitCause,
        reuse_present:Boolean(reused||componentLinks.length),reuse_with_failure:Boolean(selfPrior||componentHistory.length),
        source_snapshot:snapshot.snapshot_id||null,
      });
    }
  }
  return out;
}

function rowHour(r){return r.production_evidence_proven&&r.production_event_time?factoryHourKey(r.production_event_time):'';}
function baseFilter(rows,state,q,name){
  return rows.filter(r=>{
    if(state.line&&r.line!==state.line)return false;
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
    const d=r.failure_record_date;
    if(state.from&&(!d||d<state.from))return false;
    if(state.to&&(!d||d>state.to))return false;
    if(q&&!norm([r.pcba,r.defect_code,r.defect_desc,r.product,r.repair_user,r.repair_comment,r.pcba_prior_failure_desc,r.component_families.join(' '),r.relations.join(' ')].join(' ')).includes(q))return false;
    return true;
  });
}
export function filterDailyFailureRows(rows,state={}){
  const q=norm(state.query||''),name=norm(state.defectName||''),scoped=baseFilter(rows,state,q,name);
  const shiftProven=scoped.some(r=>r.production_evidence_proven&&r.production_shift);
  const hourProven=scoped.some(r=>r.production_evidence_proven&&r.production_event_time);
  return scoped.filter(r=>{
    if(state.shift&&shiftProven&&r.production_shift!==state.shift)return false;
    if(state.hour&&hourProven&&rowHour(r)!==state.hour)return false;
    return true;
  });
}

export function rankDailyFailures(rows){
  const map=new Map();
  const eligible=targetRankingRows(rows);
  for(const row of eligible){
    const key=JSON.stringify([row.defect_code||'',row.defect_desc||'']);
    if(!map.has(key))map.set(key,{code:row.defect_code||'',description:row.defect_desc||'',rows:[]});
    map.get(key).rows.push(row);
  }
  const total=eligible.length||1;let cumulative=0;
  return [...map.values()].map(g=>{
    const count=g.rows.length,pcbas=uniq(g.rows.map(r=>r.pcba)),reusePcbas=uniq(g.rows.filter(r=>r.reuse_with_failure).map(r=>r.pcba));
    const componentHistory=uniq(g.rows.flatMap(r=>r.component_history_links.map(x=>x.material))).length;
    return {...g,count,pcbas:pcbas.length,lines:uniq(g.rows.map(r=>r.line)),shifts:{first:g.rows.filter(r=>r.production_shift==='1st Shift').length,second:g.rows.filter(r=>r.production_shift==='2nd Shift').length,unknown:g.rows.filter(r=>!r.production_shift).length},reusePcbas:reusePcbas.length,componentHistory,percent:count/total*100};
  }).sort((a,b)=>b.count-a.count||String(a.code).localeCompare(String(b.code))).map(g=>({...g,cumulative:(cumulative+=g.percent)}));
}

function metric(model,name){return model?.aggregates?.find(x=>x.name===name)?.value??null;}
export function productionMetrics(store,state,rows=[]){
  const lines=state.line?[state.line]:LINE_IDS;let quantity=0,weightedCheck=0,weight=0,complete=true;
  let temporalScopeProven=!state.shift&&!state.hour;
  if(temporalScopeProven&&(state.from||state.to)){
    temporalScopeProven=Boolean(state.from&&state.to&&state.from===state.to);
    if(temporalScopeProven){for(const line of lines){const lineRows=rows.filter(r=>r.line===line&&(!state.from||r.failure_record_date>=state.from)&&(!state.to||r.failure_record_date<=state.to));if(!lineRows.length||!lineRows.every(r=>r.production_evidence_proven&&r.production_operational_date===state.from)){temporalScopeProven=false;break;}}}
  }
  for(const line of lines){const m=selectDashboard(store,{line_id:line,product:state.product||undefined}),q=num(metric(m,'quantity')),c=num(metric(m,'check_fpy'));if(q===null){complete=false;continue;}quantity+=q;if(c!==null){weightedCheck+=c*q;weight+=q;}}
  const trustworthy=complete&&temporalScopeProven;
  return {quantity:trustworthy?quantity:null,checkFpy:trustworthy&&weight?weightedCheck/weight:null,denominatorProven:trustworthy};
}

function selectOptions(values,selected,allLabel){
  return `<option value="">${esc(allLabel)}</option>${uniq(values).sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).map(v=>`<option value="${esc(v)}"${String(v)===String(selected)?' selected':''}>${esc(v)}</option>`).join('')}`;
}
function shiftLabel(v){return v==='1st Shift'?t('1º Turno','1st Shift'):v==='2nd Shift'?t('2º Turno','2nd Shift'):t('Sem turno 3022','No 3022 shift');}
function fmtPct(v){return Number.isFinite(v)?`${v.toFixed(1)}%`:'—';}
function fmtRate(count,quantity){return Number.isFinite(quantity)&&quantity>0?`${(count/quantity*100).toFixed(2)}%`:'—';}

function occurrenceMiniTable(rows){
  if(!rows.length)return `<p>${t('Nenhuma ocorrência.','No occurrences.')}</p>`;
  const limit=250,visible=rows.slice(0,limit),limited=rows.length>limit;
  return `<div class="table-wrap"><table><thead><tr><th>PCBA</th><th>${t('Linha','Line')}</th><th>${t('Falha','Failure')}</th><th>${t('Registro da falha (MES)','Failure record (MES)')}</th><th>${t('Turno comprovado (3022)','Proven shift (3022)')}</th><th>AT</th><th>${t('Reuso relevante','Relevant reuse')}</th></tr></thead><tbody>${visible.map(r=>`<tr><td>${esc(r.pcba||'—')}</td><td>${esc(r.line)}</td><td>${esc(defectLabel(r.defect_code,r.defect_desc))}</td><td>${esc(displayTime(r.defect_time))}</td><td>${esc(shiftLabel(r.production_shift))}</td><td>${esc(r.repair_comment||'—')}</td><td>${esc(r.reuse_with_failure?t('Sim','Yes'):t('Não','No'))}</td></tr>`).join('')}</tbody></table></div>${limited?`<p class="ames-dfa-preview-note">${t(`Prévia: ${limit} de ${rows.length} ocorrências. Use “Ocorrências detalhadas” e os filtros para investigar o conjunto completo.`,`Preview: ${limit} of ${rows.length} occurrences. Use “Detailed occurrences” and filters to investigate the full set.`)}</p>`:''}`;
}

function renderRanking(rows,quantity){
  const ranking=rankDailyFailures(rows),max=ranking[0]?.count||1;
  if(!ranking.length)return `<div class="ames-empty"><span>—</span><p>${t('Nenhuma falha no escopo selecionado.','No failures in the selected scope.')}</p></div>`;
  return `<div class="ames-dfa-ranking">${ranking.map((g,i)=>`<details class="ames-dfa-rank-item"><summary><span class="ames-dfa-rank-no">${i+1}</span><span class="ames-dfa-rank-name"><b>${esc(defectLabel(g.code,g.description))}</b><small>${esc(g.code||t('Código não informado','Code not provided'))} · ${g.pcbas} PCBA(s) · ${g.lines.map(x=>esc(x)).join(', ')}</small></span><span class="ames-dfa-rank-values"><b>${g.count}</b><small>${fmtPct(g.percent)} ${t('das falhas','of failures')} · ${fmtRate(g.count,quantity)} ${t('da produção','of production')}</small></span></summary><div class="ames-dfa-bar"><i style="width:${Math.max(2,g.count/max*100)}%"></i></div><div class="ames-dfa-rank-meta"><span>${t('Acumulado','Cumulative')} <b>${fmtPct(g.cumulative)}</b></span><span>${t('1º turno','1st shift')} <b>${g.shifts.first}</b></span><span>${t('2º turno','2nd shift')} <b>${g.shifts.second}</b></span><span>${t('PCBAs com reuso + falha histórica','PCBAs with reuse + prior failure')} <b>${g.reusePcbas}</b></span><span>${t('Materiais reutilizados com falha histórica','Reused materials with prior failure')} <b>${g.componentHistory}</b></span></div>${occurrenceMiniTable(g.rows)}</details>`).join('')}</div>`;
}

function renderHistoricalComponents(links){
  if(!links?.length)return '';
  const rows=[];
  for(const link of links){
    const evidence=Array.isArray(link.historical_evidence)?link.historical_evidence:[];
    if(evidence.length){
      for(const ev of evidence)rows.push({material:link.material,group:link.component_group||link.family||link.item_type,pcba:ev.pcba,defect_code:ev.defect_code,defect_desc:ev.defect_desc,defect_time:ev.defect_time,relation:ev.relation,repair_user:ev.repair_user,repair_comment:ev.repair_comment,station:ev.station,operation:ev.operation});
    }else rows.push({material:link.material,group:link.component_group||link.family||link.item_type,pcba:link.previous_pcbas,defect_code:link.history_code,defect_desc:link.history_desc,defect_time:null,relation:link.relations,repair_user:null,repair_comment:null,station:null,operation:null});
  }
  return `<div class="table-wrap"><table><thead><tr><th>Material SN</th><th>${t('Grupo/família','Group/family')}</th><th>${t('PCBA anterior','Prior PCBA')}</th><th>${t('Falha antiga','Prior failure')}</th><th>${t('Registro antigo (MES)','Prior MES record')}</th><th>${t('Relação','Relation')}</th><th>AT / 3012</th><th>${t('Processo histórico','Historical process')}</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.material||'—')}</td><td>${esc(x.group||'—')}</td><td>${esc(x.pcba||'—')}</td><td>${esc(defectLabel(x.defect_code,x.defect_desc))}</td><td>${esc(displayTime(x.defect_time))}</td><td>${esc(String(x.relation||'').split(',').map(v=>relationDisplay(v.trim())).filter(Boolean).join(', ')||'—')}</td><td>${esc([x.repair_user,x.repair_comment].filter(Boolean).join(' · ')||'—')}</td><td>${esc([x.station,x.operation].filter(Boolean).join(' · ')||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderOccurrences(rows){
  if(!rows.length)return `<div class="ames-empty"><span>—</span><p>${t('Nenhuma ocorrência no escopo selecionado.','No occurrence in the selected scope.')}</p></div>`;
  return `<div class="ames-dfa-occurrences">${rows.slice(0,800).map(r=>`<details class="ames-dfa-occurrence"><summary><span><b>${esc(defectLabel(r.defect_code,r.defect_desc))}</b><small>${esc(r.pcba||'—')} · ${esc(r.line)} · ${esc(displayTime(r.defect_time))}</small></span><span><b>${esc(shiftLabel(r.production_shift))}</b><small>${esc(r.product||t('CPH não informado','CPH not provided'))}</small></span></summary><div class="ames-dfa-occ-grid"><div><small>${t('Produção comprovada · 3022','Proven production · 3022')}</small><b>${esc(r.production_event_time?displayTime(r.production_event_time):'—')}</b><span>${esc(r.production_operational_date?displayDate(r.production_operational_date):'—')}</span></div><div><small>AT / ${esc(r.repair_source||t('evidência carregada','loaded evidence'))}</small><b>${esc(r.repair_user||'—')}</b><span>${esc(r.repair_comment||t('Sem comentário de reparo carregado','No repair comment loaded'))}</span></div><div><small>${t('Própria PCBA','PCBA itself')}</small><b>${r.pcba_prior_failure?t('2º+ uso com falha histórica','2nd+ use with prior failure'):r.pcba_reused?t('2º+ uso sem falha histórica relevante','2nd+ use without relevant prior failure'):t('Sem evidência de reuso da PCBA','No PCBA reuse evidence')}</b><span>${esc(r.pcba_prior_failure_desc||r.pcba_prior_failure_code||'—')}</span></div><div><small>${t('Componentes reutilizados','Reused components')}</small><b>${r.component_links_count} ${t('vínculo(s)','link(s)')} · ${r.component_group_count} ${t('grupo(s)','group(s)')}</b><span>${esc(r.component_history_count?`${r.component_history_count} ${t('vínculo(s) com falha histórica','link(s) with prior failure')}`:t('Sem falha histórica relevante nos vínculos carregados','No relevant prior failure in loaded links'))}</span></div><div><small>${t('Relação histórica','Historical relation')}</small><b>${esc(r.relations.map(relationDisplay).join(' · ')||'—')}</b><span>${r.cause_confirmed?t('CAUSA CONFIRMADA POR EVIDÊNCIA EXPLÍCITA','CAUSE CONFIRMED BY EXPLICIT EVIDENCE'):t('Associação não é causa confirmada','Association is not confirmed cause')}</span></div></div>${renderHistoricalComponents(r.component_links)}</details>`).join('')}</div><p>${rows.length>800?t('Exibição limitada a 800 ocorrências neste modo; use filtros para refinar.','Display limited to 800 occurrences in this mode; use filters to refine.'):''}</p>`;
}

function renderMatrix(rows){
  const cell=(line,shift)=>rows.filter(r=>r.line===line&&r.production_evidence_proven&&r.production_shift===shift).length,unknown=line=>rows.filter(r=>r.line===line&&!r.production_evidence_proven).length;
  return `<div class="table-wrap"><table class="ames-dfa-matrix"><thead><tr><th>${t('Linha','Line')}</th><th>${t('1º Turno','1st Shift')}</th><th>${t('2º Turno','2nd Shift')}</th><th>${t('Sem turno 3022 comprovado','No proven 3022 shift')}</th><th>${t('Total','Total')}</th></tr></thead><tbody>${LINE_IDS.map((line,i)=>{const a=cell(line,'1st Shift'),b=cell(line,'2nd Shift'),u=unknown(line),proven=rows.some(r=>r.line===line&&r.production_evidence_proven&&r.production_shift);return `<tr><th>${t('Linha','Line')} ${i+1} · ${esc(line)}</th><td>${proven?`<button data-matrix-line="${esc(line)}" data-matrix-shift="1st Shift">${a}</button>`:'—'}</td><td>${proven?`<button data-matrix-line="${esc(line)}" data-matrix-shift="2nd Shift">${b}</button>`:'—'}</td><td>${u}</td><td><b>${a+b+u}</b></td></tr>`;}).join('')}</tbody></table></div>`;
}

function renderHourChart(rows,selected=''){
  const bins=new Map();
  for(const r of rows){const h=rowHour(r);if(h)bins.set(h,(bins.get(h)||0)+1);}
  const data=[...bins].sort((a,b)=>a[0].localeCompare(b[0])),max=Math.max(1,...data.map(x=>x[1]));
  return data.length?`<div class="ames-dfa-hour-chart">${data.map(([h,n])=>`<button type="button" class="ames-dfa-hour-row${selected===h?' active':''}" data-dfa-hour="${h}"><span>${h}</span><i><b style="width:${Math.max(2,n/max*100)}%"></b></i><strong>${n}</strong></button>`).join('')}</div>`:`<p>${t('Sem horários de geração 3022 comprovados para o gráfico.','No proven 3022 generation times for the chart.')}</p>`;
}

function renderReuseDashboard(rows,state){
  const model=observedReuseDashboard(rows,state.reuseAxis),focused=state.reuseFocus||'union';
  const classes={union:model.union,both:model.intersection,pcba_only:model.groups.pcba_only,
    material_only:model.groups.material_only,no_reuse_evidence:model.groups.no_reuse_evidence};
  const labels={union:t('União · PCBA ou material','Union · PCBA or material'),
    both:t('Interseção · ambos','Intersection · both'),
    pcba_only:t('Somente PCBA','PCBA only'),material_only:t('Somente material','Material only'),
    no_reuse_evidence:t('Reuso não comprovado','Reuse unproven')};
  const selected=classes[focused]||model.union,max=Math.max(1,...model.bins.map(b=>b.total));
  const chart=()=>{
    if(model.axis==='line')return model.bins.map(bin=>{
      const observed=bin.pcba_only+bin.material_only+bin.both;
      const parts=[['pcba_only','#4263a6'],['material_only','#b4781d'],['both','#287c69']];
      return `<div class="ames-dfa-hour-row"><span>${esc(bin.key)}</span><i style="display:flex;overflow:hidden">${parts.map(([kind,color])=>
        `<b title="${esc(kind)}: ${bin[kind]}" style="width:${bin[kind]/max*100}%;background:${color};height:100%;min-width:0"></b>`).join('')}</i>
        <strong>${observed} / ${bin.total}</strong></div>`;
    }).join('');
    const valid=model.bins.filter(b=>/^\d{4}-\d{2}-\d{2}$/.test(b.key));
    if(!valid.length)return '';
    const earliest=Date.parse(valid[0].key+'T12:00:00Z'),latest=Date.parse(valid.at(-1).key+'T12:00:00Z'),
      span=Math.max(86400000,latest-earliest),peak=Math.max(1,...valid.map(b=>b.pcba_only+b.material_only+b.both));
    const xy=bin=>{const at=Date.parse(bin.key+'T12:00:00Z');return {
      x:25+(at-earliest)/span*650,y:150-(bin.pcba_only+bin.material_only+bin.both)/peak*125};};
    const segments=[];
    for(let i=1;i<valid.length;i++){
      const prev=valid[i-1],now=valid[i];
      if(Date.parse(now.key+'T12:00:00Z')-Date.parse(prev.key+'T12:00:00Z')>86400000)continue;
      const a=xy(prev),b=xy(now);segments.push(`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="#287c69" stroke-width="3"/>`);
    }
    return `<svg viewBox="0 0 700 185" role="img" aria-label="${esc(t('Linha temporal de falhas observadas com reuso, sem interpolar datas ausentes',
      'Observed failures with reuse trend line, without interpolating missing dates'))}" style="width:100%;max-height:190px">
      <line x1="25" y1="150" x2="675" y2="150" stroke="currentColor" opacity="0.3"/>
      ${segments.join('')}${valid.map(bin=>{const p=xy(bin),value=bin.pcba_only+bin.material_only+bin.both;
        return `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#287c69"><title>${esc(bin.key)} · ${value} / ${bin.total}</title></circle>`;}).join('')}
      <text x="25" y="174" fill="currentColor" font-size="12">${esc(valid[0].key)}</text>
      <text x="675" y="174" text-anchor="end" fill="currentColor" font-size="12">${esc(valid.at(-1).key)}</text></svg>`;
  };
  return `<section class="ames-dfa-reuse-dashboard" data-dfa-reuse-dashboard>
    <div class="section-head"><div><h3>${t('Dashboard de reuso · evidência observada','Reuse dashboard · observed evidence')}</h3>
    <p>${t('União e interseção das ocorrências 3028 distintas com evidência de PCBA ou material reutilizado. A contagem é exata no conjunto observado, mesmo com cobertura MES parcial. Não é total produzido, Check FPY nem causalidade.',
      'Union and intersection of distinct 3028 failures with evidence of reused PCBA or material. Counts are exact within the observed rows, even if MES coverage is partial. Not production total, Check FPY or causality.')}</p></div>
    <span class="status warn">${model.total} ${t('falhas observadas','observed failures')}</span></div>
    <div class="ames-summary-grid">${Object.entries(classes).map(([key,items])=>`<button class="stat ames-dfa-kpi" type="button" data-dfa-reuse-class="${key}" aria-pressed="${focused===key}"><span class="stat-label">${labels[key]}</span><strong class="stat-value">${items.length}</strong></button>`).join('')}</div>
    <div class="mes-filters"><label>${t('Visualização do gráfico','Chart view')}<select data-dfa-reuse-axis>
      <option value="day"${model.axis==='day'?' selected':''}>${t('Evolução por dia de registro MES','MES record date trend')}</option>
      <option value="line"${model.axis==='line'?' selected':''}>${t('Comparação por linha','Comparison by line')}</option>
    </select></label></div>
    <div class="ames-dfa-hour-chart">${chart()||`<p>${t('Nenhuma ocorrência 3028 com data/linha comprovada no filtro atual.','No 3028 occurrence with proven date/line in current filters.')}</p>`}</div>
    ${model.axis==='line'?`<small>${t('Cores: azul = só PCBA, âmbar = só material, verde = ambos.','Colors: blue = PCBA only, amber = material only, green = both.')}</small>`:
      `<small>${t('Linha representa contagens observadas por dia MES. Lacunas no histórico permanecem desconectadas; não representa Check FPY.',
        'Line shows observed counts per MES date. Missing days remain disconnected; it is not Check FPY.')}</small>`}
    <details open><summary>${esc(labels[focused]||labels.union)} · ${selected.length} ${t('ocorrências distintas','distinct occurrences')}</summary>
      ${occurrenceMiniTable(selected)}</details>
    <p class="mes-context">${t('Sem evidência de reuso não significa primeiro uso. Gráfico: numerador = falhas observadas com reuso; denominador = falhas 3028 carregadas no filtro, nunca produção total.',
      'No reuse evidence does not establish first use. Chart numerator = observed failures with reuse; denominator = loaded 3028 failures under filters, never total production.')}</p>
  </section>`;
}

export function createDailyFailureAnalytics(root,store){
  let mounted=false,last='',state={mode:'ranking',query:'',line:'',shift:'',hour:'',product:'',defect:'',defectName:'',repairUser:'',pcba:'',family:'',reuse:'',relation:'',from:'',to:'',reuseAxis:'day',reuseFocus:'union'},initializedDate=false;
  function render(){
    const base=buildDailyFailureRows(store);
    if(!initializedDate&&base.length){const latest=uniq(base.map(r=>r.failure_record_date).filter(Boolean)).sort().at(-1);if(latest){state.from=latest;state.to=latest;}initializedDate=true;}
    const filtered=filterDailyFailureRows(base,state),chartRows=filterDailyFailureRows(base,{...state,hour:''}),metrics=productionMetrics(store,state,base),rankingCoverage=targetRankingCoverage(filtered);
    const products=base.map(r=>r.product).filter(Boolean),defects=base.map(r=>r.defect_code).filter(Boolean),users=base.map(r=>r.repair_user).filter(Boolean),families=base.flatMap(r=>r.component_families),relations=base.flatMap(r=>r.relations);
    const key=JSON.stringify([state,base.map(r=>[r.source_snapshot,r.pcba,r.defect_key,r.repair_comment,r.production_shift,r.production_evidence_proven,r.component_links_count]),document.documentElement.lang]);if(key===last)return;last=key;
    if(!mounted){root.classList.add('ames-daily-failure-analytics');mounted=true;}
    const uniquePcbas=uniq(filtered.map(r=>r.pcba)).length,reuseRelevant=uniq(filtered.filter(r=>r.reuse_with_failure).map(r=>r.pcba)).length,shiftEvidence=filtered.some(r=>r.production_evidence_proven&&r.production_shift),shift1=filtered.filter(r=>r.production_shift==='1st Shift').length,shift2=filtered.filter(r=>r.production_shift==='2nd Shift').length;
    root.innerHTML=`<section class="mes-context-panel ames-dfa-head"><div class="section-head"><div><h2>${t('Falhas do dia · leitura operacional','Daily failures · operational view')}</h2><p>${t('Bater o olho → identificar problema → expandir → entender as PCBAs envolvidas. Associação de reuso nunca é apresentada como causa sem evidência explícita.','Scan → identify the problem → expand → understand affected PCBAs. Reuse association is never presented as cause without explicit evidence.')}</p></div><span class="ames-runtime-job">${filtered.length} ${t('ocorrência(s)','occurrence(s)')}</span></div><div class="ames-summary-grid"><button class="stat ames-dfa-kpi" data-dfa-kpi="ranking"><span class="stat-label">${t('Falhas','Failures')}</span><strong class="stat-value">${filtered.length}</strong></button><button class="stat ames-dfa-kpi" data-dfa-kpi="occurrences"><span class="stat-label">${t('PCBAs únicas','Unique PCBAs')}</span><strong class="stat-value">${uniquePcbas}</strong></button><button class="stat ames-dfa-kpi" data-dfa-kpi="shift1"${shiftEvidence?'':' disabled aria-disabled="true"'}><span class="stat-label">${t('1º turno','1st shift')}</span><strong class="stat-value">${shiftEvidence?shift1:'—'}</strong></button><button class="stat ames-dfa-kpi" data-dfa-kpi="shift2"${shiftEvidence?'':' disabled aria-disabled="true"'}><span class="stat-label">${t('2º turno','2nd shift')}</span><strong class="stat-value">${shiftEvidence?shift2:'—'}</strong></button><button class="stat ames-dfa-kpi" data-dfa-kpi="reuse"><span class="stat-label">${t('Reuso + falha histórica','Reuse + prior failure')}</span><strong class="stat-value">${reuseRelevant}</strong></button><button class="stat ames-dfa-kpi" data-dfa-kpi="checkfpy"><span class="stat-label">Check FPY</span><strong class="stat-value">${metrics.checkFpy===null?'—':metrics.checkFpy.toFixed(2)+'%'}</strong></button></div></section>
    <section class="mes-context-panel ames-dfa-filters"><div class="mes-filters"><label>${t('Registro MES · de','MES record · from')}<input type="date" data-dfa="from" value="${esc(state.from)}"></label><label>${t('Registro MES · até','MES record · to')}<input type="date" data-dfa="to" value="${esc(state.to)}"></label><label>${t('Linha','Line')}<select data-dfa="line">${selectOptions(LINE_IDS,state.line,t('Todas','All'))}</select></label><label>${t('Turno comprovado 3022','Proven 3022 shift')}<select data-dfa="shift"><option value="">${t('Todos','All')}</option><option value="1st Shift"${state.shift==='1st Shift'?' selected':''}>${t('1º Turno','1st Shift')}</option><option value="2nd Shift"${state.shift==='2nd Shift'?' selected':''}>${t('2º Turno','2nd Shift')}</option></select></label><label>${t('Hora de geração 3022','3022 generation hour')}<select data-dfa="hour">${selectOptions(chartRows.map(rowHour).filter(Boolean),state.hour,t('Todas','All'))}</select></label><label>CPH<select data-dfa="product">${selectOptions(products,state.product,t('Todos','All'))}</select></label><label>Defect Code<select data-dfa="defect">${selectOptions(defects,state.defect,t('Todos','All'))}</select></label><label>${t('Nome da falha','Failure name')}<input data-dfa="defectName" value="${esc(state.defectName)}"></label><label>Repair User<select data-dfa="repairUser">${selectOptions(users,state.repairUser,t('Todos','All'))}</select></label><label>PCBA<input data-dfa="pcba" value="${esc(state.pcba)}"></label><label>${t('Família componente','Component family')}<select data-dfa="family">${selectOptions(families,state.family,t('Todas','All'))}</select></label><label>${t('Reuso','Reuse')}<select data-dfa="reuse"><option value="">${t('Todos','All')}</option><option value="present"${state.reuse==='present'?' selected':''}>${t('Reuso presente','Reuse present')}</option><option value="with_failure"${state.reuse==='with_failure'?' selected':''}>${t('Reuso com histórico de falha','Reuse with prior failure')}</option><option value="pcba_failure"${state.reuse==='pcba_failure'?' selected':''}>${t('PCBA reutilizada + falha antiga','Reused PCBA + prior failure')}</option><option value="component_failure"${state.reuse==='component_failure'?' selected':''}>${t('Componente reutilizado + falha antiga','Reused component + prior failure')}</option><option value="both"${state.reuse==='both'?' selected':''}>${t('PCBA + componente','PCBA + component')}</option></select></label><label>${t('Relação','Relation')}<select data-dfa="relation">${selectOptions(relations,state.relation,t('Todas','All'))}</select></label><label>${t('Busca geral','General search')}<input data-dfa="query" value="${esc(state.query)}" placeholder="${t('falha, comentário AT, SN...','failure, AT comment, SN...')}"></label></div><div class="mes-pagination"><button class="button secondary" data-dfa-clear>${t('Limpar filtros','Clear filters')}</button></div></section>
    <section class="ames-dfa-mode-tabs"><button class="button ${state.mode==='ranking'?'primary':'secondary'}" data-dfa-mode="ranking">${t('Ranking de falhas','Failure ranking')}</button><button class="button ${state.mode==='occurrences'?'primary':'secondary'}" data-dfa-mode="occurrences">${t('Ocorrências detalhadas','Detailed occurrences')}</button><button class="button ${state.mode==='matrix'?'primary':'secondary'}" data-dfa-mode="matrix">${t('Linha × turno','Line × shift')}</button><button class="button ${state.mode==='reuse'?'primary':'secondary'}" data-dfa-mode="reuse">${t('Dashboard de reuso','Reuse dashboard')}</button></section>
    <section class="mes-context-panel ames-dfa-main">${state.mode==='ranking'?`<div class="section-head"><div><h3>${t('Pareto de falhas que impactam o target','Target-impact failure Pareto')}</h3><p>${t('Ranking e percentuais excluem somente Standard Error, F1_9999, Process Skip Station e Process Inconsistent scheme/work order/version. Todas continuam nas ocorrências e nos totais gerais; FPY/Quantity não são recalculados.','Ranking and shares exclude only Standard Error, F1_9999, Process Skip Station and Process Inconsistent scheme/work order/version. All remain in occurrences and general totals; FPY/Quantity are not recalculated.')}${rankingCoverage.excluded?' · '+rankingCoverage.excluded+' '+t('fora deste Pareto','excluded from this Pareto'):''}</p></div><span>${metrics.quantity===null?t('Quantidade produzida indisponível','Production quantity unavailable'):t('Produção no escopo: ','Production in scope: ')+metrics.quantity}</span></div>${renderRanking(filtered,metrics.quantity)}`:state.mode==='occurrences'?`<div class="section-head"><div><h3>${t('Ocorrências detalhadas','Detailed occurrences')}</h3><p>${t('Uma falha por linha lógica, com AT, turno 3022 quando comprovado, PCBA e reuso relevante.','One logical failure per row, with AT, proven 3022 shift when available, PCBA and relevant reuse.')}</p></div></div>${renderOccurrences(filtered)}`:state.mode==='reuse'?renderReuseDashboard(filtered,state):`<div class="section-head"><div><h3>${t('Linha × turno','Line × shift')}</h3><p>${t('Turno só é contado quando a referência 3022 está comprovada.','Shift is counted only when the 3022 reference is proven.')}</p></div></div>${renderMatrix(filtered)}`}</section>
    <section class="mes-context-panel"><div class="section-head"><div><h3>${t('Falhas por horário de geração','Failures by generation time')}</h3><p>${t('Usa somente Horário de geração comprovado pela 3022. Registro da falha (MES) não é usado como fallback de produção.','Uses only generation time proven by 3022. Failure record (MES) is not used as a production fallback.')}</p></div>${state.hour?`<button class="button secondary" data-dfa-hour-clear>${t('Remover hora ','Clear hour ')}${esc(state.hour)}</button>`:''}</div>${renderHourChart(chartRows,state.hour)}</section>`;
    root.querySelectorAll('[data-dfa]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{state[el.dataset.dfa]=el.value;last='';render();}));
    root.querySelectorAll('[data-dfa-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.dfaMode;last='';render();});
    root.querySelector('[data-dfa-reuse-axis]')?.addEventListener('change',event=>{
      state.reuseAxis=event.target.value==='line'?'line':'day';last='';render();
    });
    root.querySelectorAll('[data-dfa-reuse-class]').forEach(button=>button.onclick=()=>{
      state.reuseFocus=button.dataset.dfaReuseClass;last='';render();
    });
    root.querySelector('[data-dfa-clear]')?.addEventListener('click',()=>{state={...state,query:'',line:'',shift:'',hour:'',product:'',defect:'',defectName:'',repairUser:'',pcba:'',family:'',reuse:'',relation:'',from:'',to:''};initializedDate=true;last='';render();});
    root.querySelectorAll('[data-matrix-line]').forEach(b=>b.onclick=()=>{state.line=b.dataset.matrixLine;state.shift=b.dataset.matrixShift;state.mode='occurrences';last='';render();});
    root.querySelectorAll('[data-dfa-hour]').forEach(b=>b.onclick=()=>{state.hour=b.dataset.dfaHour;state.mode='occurrences';last='';render();});
    root.querySelector('[data-dfa-hour-clear]')?.addEventListener('click',()=>{state.hour='';last='';render();});
    root.querySelectorAll('[data-dfa-kpi]').forEach(b=>b.onclick=()=>{const action=b.dataset.dfaKpi;if(action==='shift1'&&shiftEvidence){state.shift='1st Shift';state.mode='occurrences';}else if(action==='shift2'&&shiftEvidence){state.shift='2nd Shift';state.mode='occurrences';}else if(action==='reuse'){state.reuse='with_failure';state.mode='occurrences';}else if(action==='occurrences'){state.mode='occurrences';}else if(action==='ranking'||action==='checkfpy'){state.mode='ranking';}last='';render();});
  }
  return {render,clear(){root?.replaceChildren();mounted=false;last='';}};
}
