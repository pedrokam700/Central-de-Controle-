import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {sameFailureOccurrence,trustedProductionEvidence,genericReturnEvidence} from './data/production-evidence.mjs';
import {reuseLinks} from './data/reuse-analysis.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {EXTRA_EN} from './console-i18n-extra.mjs';
import {MES_SOURCE_VIEWS,mesSourceProvenance,snapshotProvenance} from './data/observation-provenance.mjs';
import {sourceStateLabel} from './data/source-provenance.mjs';

Object.assign(EXTRA_EN,{
  'Evidências':'Evidence',
  'Ver cadeia de evidências':'View evidence chain',
  'parcial':'partial',
  'fonte/dimensão não comprovada':'source/dimension not proven',
  'Ocorrência':'Occurrence',
  'Histórico anterior':'Previous history',
  'Componentes reutilizados':'Reused components',
  'PCBA(s) anterior(es)':'previous PCBA(s)',
  'com mesma falha/família':'with same failure/family',
  'Processo comprovado':'Proven process',
  'Retorno':'Return',
  'Reparo':'Repair',
  'Proveniência do snapshot':'Snapshot provenance',
  'PCBA 2º+':'PCBA 2nd+',
  'Item 2º+':'2nd+ item',
  'Correlação':'Correlation',
  'não correlacionado':'not correlated',
  'Fonte posterior ausente não apaga evidência já comprovada; correlação não confirma causa raiz.':'A missing later source does not erase already proven evidence; correlation does not confirm root cause.'
});

const text=value=>String(value??'').trim();
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const t=(locale,pt,en)=>String(locale||'pt-BR').startsWith('en')?en:pt;
const value=(row,...keys)=>keys.map(key=>row?.[key]).find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const first=(...values)=>values.find(item=>item!==undefined&&item!==null&&text(item)!=='')??null;
const same=(a,b)=>text(a)!==''&&text(a)===text(b);
const sameInstant=(a,b)=>{const aa=Date.parse(text(a)),bb=Date.parse(text(b));return Number.isFinite(aa)&&Number.isFinite(bb)&&aa===bb;};

function drillRows(snapshot,key){const value=snapshot?.insights?.drilldowns?.[key];return Array.isArray(value)?value:[];}
function pcbaOf(row){return text(first(row?.current_pcba_sn,row?.pcba_sn,row?.['PCBA atual'],row?.PCBA,row?.['PCBA']));}
function drillMatches(row,occurrence){
  if(pcbaOf(row)&&!same(pcbaOf(row),occurrence.pcba_sn))return false;
  const code=first(row?.defect_code,row?.['Defect Code atual'],row?.['Defect Code']);
  if(code&&occurrence.defect_code&&!same(code,occurrence.defect_code))return false;
  const at=first(row?.defect_time,row?.['Defect Time atual'],row?.['Defect Time']);
  if(at&&occurrence.defect_time&&!sameInstant(at,occurrence.defect_time))return false;
  return Boolean(pcbaOf(row)||code||at);
}
function exactContext(snapshot,occurrence){return (snapshot?.process_timeline?.contexts||[]).find(context=>sameFailureOccurrence(occurrence,context))||null;}
function historyRows(snapshot,occurrence){
  const rows=snapshot?.pcba_history?.records;
  if(!Array.isArray(rows))return {available:false,rows:[]};
  const defect=Date.parse(text(occurrence.defect_time));
  const matches=rows.filter(row=>same(row.pcba_sn,occurrence.pcba_sn)&&(!Number.isFinite(defect)||!Number.isFinite(Date.parse(text(row.defect_time)))||Date.parse(text(row.defect_time))<defect));
  // A partial or unscoped empty history is not proof of zero prior failures.
  return {available:matches.length>0,rows:matches};
}
function relationState(snapshot,occurrence){
  const drill=snapshot?.insights?.drilldowns||{};
  const keys=['pcba_same_failure','pcba_same_family','pcba_second_use_same_failure','pcba_second_use_same_family'];
  const matches=keys.flatMap(key=>drillRows(snapshot,key).filter(row=>drillMatches(row,occurrence)).map(row=>({key,row})));
  const available=own(drill,'pcba_same_failure')||own(drill,'pcba_same_family')||own(drill,'pcba_second_use_same_failure')||own(drill,'pcba_second_use_same_family');
  return {available,matches};
}
function ownReuseState(snapshot,occurrence){
  const drill=snapshot?.insights?.drilldowns||{};
  const keys=['pcba_second_use','pcba_3plus_use','pcba_reused_with_prior_failure'];
  const matches=keys.flatMap(key=>drillRows(snapshot,key).filter(row=>drillMatches(row,occurrence)).map(row=>({key,row})));
  const available=own(drill,'pcba_second_use')||own(drill,'pcba_3plus_use')||own(drill,'pcba_reused_with_prior_failure');
  return {available,matches};
}
function materialLinks(snapshot,occurrence){
  const all=reuseLinks(snapshot||{});
  const rows=all.filter(link=>{
    if(!same(link.pcba,occurrence.pcba_sn))return false;
    if(link.defect_code&&occurrence.defect_code&&!same(link.defect_code,occurrence.defect_code))return false;
    if(link.defect_time&&occurrence.defect_time&&!sameInstant(link.defect_time,occurrence.defect_time))return false;
    return true;
  });
  // An empty partial 3074 collection cannot prove this component had zero prior PCBA bindings.
  return {available:rows.length>0,rows};
}
function repairEvidence(occurrence){
  const fields={user:occurrence.repair_user||null,time:occurrence.repair_time||null,code:occurrence.repair_code||null,comment:occurrence.repair_comment||null,reason:occurrence.defect_reason_desc||occurrence.repair_desc||null};
  const sourceRows=Array.isArray(occurrence.repair_evidence_3012)?occurrence.repair_evidence_3012:[];
  const exactRows=sourceRows.filter(row=>row&&typeof row==='object'&&(!row.pcba_sn||same(row.pcba_sn,occurrence.pcba_sn))&&(!row.defect_code||same(row.defect_code,occurrence.defect_code)));
  // Repair User/Comment can also arrive through 3028; never label these as
  // directly collected from 3012 without a linked 3012 evidence record.
  return {present:Object.values(fields).some(item=>text(item)!=='')||exactRows.length>0,source_confirmed:exactRows.length>0,...fields};
}

export function failureOccurrenceEvidence(snapshot={},occurrence={}){
  const context=exactContext(snapshot,occurrence),production=context?trustedProductionEvidence(context):trustedProductionEvidence({}),ret=context?genericReturnEvidence(context):genericReturnEvidence({});
  const history=historyRows(snapshot,occurrence),reuse=ownReuseState(snapshot,occurrence),relations=relationState(snapshot,occurrence),materials=materialLinks(snapshot,occurrence),repair=repairEvidence(occurrence);
  return {occurrence,production,returnEvidence:ret,context,history,reuse,relations,materials,repair};
}

function badge(label,tone=''){return `<span class="status${tone?` ${tone}`:''}">${esc(label)}</span>`;}
function unavailable(locale,label){return `<div><small>${esc(label)}</small><b>—</b><span>${esc(t(locale,'fonte/dimensão não comprovada','source/dimension not proven'))}</span></div>`;}
function renderDetails(evidence,locale,read={}){
  const {occurrence,production,returnEvidence:ret,history,materials,repair}=evidence;
  const materialSame=materials.rows.filter(row=>/MESMA FALHA|MESMA FAMÍLIA/i.test(text(row.relations)));
  const rows=[];
  rows.push(`<div><small>3028 · ${esc(t(locale,'Ocorrência','Occurrence'))}</small><b>${esc([occurrence.defect_code,occurrence.pcba_sn].filter(Boolean).join(' · '))}</b><span>${esc(time(occurrence.defect_time))} · ${esc(occurrence.line_id||'—')} · ${esc(occurrence.product_model||occurrence.product_key||'—')}</span></div>`);
  if(history.available)rows.push(`<div><small>2114 · ${esc(t(locale,'Histórico anterior','Previous history'))}</small><b>${esc(String(history.rows.length))}</b>${history.rows.slice(0,3).map(row=>`<span>${esc([row.defect_code,row.defect_desc].filter(Boolean).join(' · ')||'—')} · ${esc(time(row.defect_time))}</span>`).join('')}</div>`);else rows.push(unavailable(locale,'2114'));
  if(materials.available)rows.push(`<div><small>3074 · ${esc(t(locale,'Componentes reutilizados','Reused components'))}</small><b>${esc(String(materials.rows.length))}</b>${materials.rows.slice(0,4).map(row=>`<span>${esc([row.item_type,row.material,row.usage].filter(Boolean).join(' · ')||row.material||'—')}${row.previous_pcbas?` · ${esc(t(locale,'PCBA(s) anterior(es)','previous PCBA(s)'))}: ${esc(row.previous_pcbas)}`:''}</span>`).join('')}${materialSame.length?`<span><b>${esc(materialSame.length)}</b> ${esc(t(locale,'com mesma falha/família','with same failure/family'))}</span>`:''}</div>`);else rows.push(unavailable(locale,'3074'));
  if(production.trusted)rows.push(`<div><small>3022 · ${esc(t(locale,'Processo comprovado','Proven process'))}</small><b>${esc([production.station,evidence.context?.reference_operation_name].filter(Boolean).join(' · '))}</b><span>${esc(time(production.event_time))} · ${esc(production.shift||'—')} · ${esc(production.operational_date||'—')}</span>${ret.proven?`<span>${esc(t(locale,'Retorno','Return'))}: ${esc([ret.station,ret.operation].filter(Boolean).join(' · '))} · ${esc(time(ret.event_time))}</span>`:''}</div>`);else rows.push(unavailable(locale,'3022'));
  if(repair.present)rows.push(`<div><small>${repair.source_confirmed?'3012':esc(t(locale,'Reparo · origem 3012 não comprovada','Repair · 3012 source unproven'))} · ${esc(t(locale,'Reparo','Repair'))}</small><b>${esc([repair.code,repair.user].filter(Boolean).join(' · ')||'—')}</b><span>${esc(repair.time?time(repair.time):'—')}</span>${repair.comment?`<span style="white-space:pre-wrap">${esc(repair.comment)}</span>`:''}${repair.reason?`<span>${esc(repair.reason)}</span>`:''}</div>`);else rows.push(unavailable(locale,'3012'));
  rows.push(renderSnapshotFacts(read,locale));
  rows.push(renderSourceFacts(read,locale,evidence));
  return rows.join('');
}
function snapshotLabel(read={}){return [read.snapshot?.snapshot_id||'—',read.source||'none',read.snapshot?.collected_at||'—'].join(' · ');}
const fact=value=>value===null||value===undefined||value===''?'—':String(value);
function renderSnapshotFacts(read,locale){
  const p=snapshotProvenance(read);
  const period=p.period_start||p.period_end?[fact(p.period_start),fact(p.period_end)].join(' → '):'—';
  return `<div data-ames-snapshot-provenance><small>${esc(t(locale,'Proveniência do snapshot','Snapshot provenance'))}</small><b>${esc(snapshotLabel(read))}</b>
    <span>${esc(t(locale,'Revisão','Revision'))}: ${esc(p.revision??'—')} · ${esc(t(locale,'Linha','Line'))}: ${esc(fact(p.line_id))} · ${esc(t(locale,'Cobertura','Coverage'))}: ${esc(fact(p.coverage))}</span>
    <span>${esc(t(locale,'Período MES comprovado','Proven MES period'))}: ${esc(period)}</span>
    <span>${esc(t(locale,'ID da origem','Source ID'))}: ${esc(fact(p.source_id))} · ${esc(t(locale,'Posto/PC informado','Reported workstation'))}: ${esc(fact(p.workstation_id))}</span>
    <span>${esc(t(locale,'Transporte','Transport'))}: ${esc(fact(p.transport))} · ${esc(t(locale,'Atualidade','Freshness'))}: ${esc(fact(p.freshness))} · ${esc(t(locale,'Hash (prefixo)','Hash (prefix)'))}: ${esc(p.content_hash?p.content_hash.slice(0,16):'—')}</span>
    <span>${esc(t(locale,'A identificação da fonte não comprova o nome do computador; período desconhecido não é inferido da data de coleta.','A source ID does not prove a computer name; an unknown query period is not inferred from collection time.'))}</span>
  </div>`;
}
function renderSourceFacts(read,locale,evidence){
  const cells=MES_SOURCE_VIEWS.map(view=>{
    const p=mesSourceProvenance(read,view,{observed:view==='3012'&&evidence.repair.source_confirmed});
    const count=p.count===null?'':` · ${esc(t(locale,'registros no snapshot','snapshot records'))}: ${esc(p.count)}`;
    return `<div data-ames-source-view="${view}" data-ames-source-state="${esc(p.state)}"><small>${view} · ${esc(t(locale,'Estado da fonte','Source state'))}</small><b>${esc(sourceStateLabel(p.state,locale))}</b><span>${esc(t(locale,'Evidência neste snapshot; não comprova cobertura completa da consulta MES.','Evidence in this snapshot; it does not prove full MES query coverage.'))}${count}</span></div>`;
  }).join('');
  return `<div data-ames-source-provenance><small>${esc(t(locale,'Fontes consultadas e lacunas','Source evidence and gaps'))}</small><span>${esc(t(locale,'Zero somente quando a fonte confirma consulta completa; dados em cache não são leitura atual.','Zero only when the source confirms a completed query; cached data is not a current read.'))}</span><div class="ames-sn-repair-cycles">${cells}</div></div>`;
}

export function renderFailureOccurrenceEvidence(evidence,locale='pt-BR',read={}){
  const tags=[badge('3028','ok')];
  if(evidence.history.available&&evidence.history.rows.length)tags.push(badge(`2114 ${evidence.history.rows.length}`));
  if(evidence.reuse.matches.length)tags.push(badge(t(locale,'PCBA 2º+','PCBA 2nd+'),'warn'));
  if(evidence.materials.rows.length)tags.push(badge(`${t(locale,'Item 2º+','2nd+ item')} ${evidence.materials.rows.length}`,'warn'));
  if(evidence.relations.matches.length||evidence.materials.rows.some(row=>/MESMA FALHA|MESMA FAMÍLIA/i.test(text(row.relations))))tags.push(badge(t(locale,'Correlação','Correlation'),'warn'));
  if(evidence.production.trusted)tags.push(badge(`3022 ${evidence.production.station||''}`.trim(),'ok'));
  if(evidence.repair.present)tags.push(badge(evidence.repair.source_confirmed?'3012':t(locale,'Reparo','Repair'),evidence.repair.source_confirmed?'ok':''));
  const partial=[!evidence.history.available,!evidence.materials.available,!evidence.production.trusted&&!evidence.context,!evidence.repair.present].filter(Boolean).length;
  return `<div class="ames-failure-evidence-summary" style="display:flex;gap:4px;flex-wrap:wrap">${tags.join('')}</div><details class="ames-failure-evidence-detail" style="margin-top:5px"><summary style="cursor:pointer;font-weight:750">${esc(t(locale,'Ver cadeia de evidências','View evidence chain'))}${partial?` · ${esc(t(locale,'parcial','partial'))}`:''}</summary><div class="ames-sn-repair-cycles" style="margin-top:7px">${renderDetails(evidence,locale,read)}</div><small style="display:block;margin-top:6px">${esc(t(locale,'Fonte posterior ausente não apaga evidência já comprovada; correlação não confirma causa raiz.','A missing later source does not erase already proven evidence; correlation does not confirm root cause.'))}</small></details>`;
}

export function withFailureOccurrenceEvidence(base,root,store){
  let observer=null,queued=false;
  function decorate(){
    queued=false;const table=root.querySelector('.ames-failures-table table');if(!table)return;
    const line=root.querySelector('[data-failure-line]')?.value||store.preferredLine?.(),read=store.read(line),snapshot=read.snapshot;if(!snapshot)return;
    const rows=[...(snapshot.occurrences||[]),...(snapshot.removed_occurrences||[])];
    const signature=JSON.stringify([snapshot.snapshot_id,table.querySelectorAll('tbody tr').length,root.querySelector('[data-failure-search]')?.value||'',root.querySelector('[data-failure-status]')?.value||'',root.querySelector('[data-failure-shift]')?.value||'',document.documentElement.lang]);
    if(table.dataset.occurrenceEvidence===signature)return;table.dataset.occurrenceEvidence=signature;
    const head=table.querySelector('thead tr');if(head&&!head.querySelector('[data-failure-evidence-head]')){const th=table.ownerDocument.createElement('th');th.dataset.failureEvidenceHead='1';th.textContent=t(document.documentElement.lang,'Evidências','Evidence');head.append(th);}
    for(const tr of table.querySelectorAll('tbody tr')){
      tr.querySelector('[data-failure-evidence-cell]')?.remove();const cells=[...tr.children];if(cells.length<4)continue;
      const code=text(cells[1]?.textContent),pcba=text(cells[2]?.textContent),at=text(cells[3]?.textContent);
      const occurrence=rows.find(row=>same(row.pcba_sn,pcba)&&(!code||same(row.defect_code,code))&&(!at||same(text(row.defect_time),at)||sameInstant(row.defect_time,at)));
      const td=table.ownerDocument.createElement('td');td.dataset.failureEvidenceCell='1';
      td.innerHTML=occurrence?renderFailureOccurrenceEvidence(failureOccurrenceEvidence(snapshot,occurrence),document.documentElement.lang||'pt-BR',read):`<span class="status">${esc(t(document.documentElement.lang,'não correlacionado','not correlated'))}</span>`;tr.append(td);
    }
  }
  function queue(){if(queued)return;queued=true;queueMicrotask(decorate);}
  observer=globalThis.MutationObserver?new MutationObserver(queue):null;observer?.observe(root,{childList:true,subtree:true});
  return {render(){base.render();decorate();},clear(){observer?.disconnect();base.clear?.();}};
}