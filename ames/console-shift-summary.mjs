import {defectDescription,defectLabel} from './defect-label.mjs';
import {LINE_IDS} from './data/contract.mjs';
import {buildDailyFailureRows,rankDailyFailures,productionMetrics} from './daily-failure-analytics.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const uniq=a=>[...new Set(a.filter(Boolean))];
const fmtPct=v=>Number.isFinite(v)?`${Number(v).toFixed(1)}%`:'—';

function parseClock(text,fallback){
  const match=/^(\d{2}):(\d{2})$/.exec(String(text||fallback).trim());
  if(!match)return null;
  const h=Number(match[1]),m=Number(match[2]);
  return h>=0&&h<=23&&m>=0&&m<=59?h*60+m:null;
}
function minuteInTimezone(instant,timeZone){
  try{const date=instant instanceof Date?instant:new Date(instant);if(!Number.isFinite(date.getTime()))return null;const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timeZone||'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const hour=Number(parts.find(part=>part.type==='hour')?.value),minute=Number(parts.find(part=>part.type==='minute')?.value);return Number.isInteger(hour)&&Number.isInteger(minute)?hour*60+minute:null;}catch{return null;}
}
export function configuredShiftAt(config={},instant=new Date()){
  const shifts=config.work_shifts||{'1':{start:'07:30',end:'17:30'},'2':{start:'17:30',end:'07:30'}};
  const minute=minuteInTimezone(instant,config.timezone||'America/Sao_Paulo');if(minute===null)return '';
  for(const [id,item] of Object.entries(shifts)){const start=parseClock(item?.start,id==='1'?'07:30':'17:30'),end=parseClock(item?.end,id==='1'?'17:30':'07:30');if(start===null||end===null||start===end)continue;const inside=start<end?(minute>=start&&minute<end):(minute>=start||minute<end);if(inside)return id==='1'?'1st Shift':id==='2'?'2nd Shift':'';}
  return '';
}
function shiftLabel(value){return value==='1st Shift'?t('1º Turno','1st Shift'):value==='2nd Shift'?t('2º Turno','2nd Shift'):t('Todos os turnos','All shifts');}
function lineLabel(value){const index=LINE_IDS.indexOf(value);return value?`${t('Linha','Line')} ${index+1} · ${value}`:t('Todas as linhas','All lines');}

export function createShiftSummaryView(root,store,{onEvidence=()=>{}}={}){
  let line=store.preferredLine?.()||'',shift='',last='';
  function render(){
    const shared=store.context?.();if(shared?.line_id&&shared.line_id!==line)line=shared.line_id;
    const all=buildDailyFailureRows(store),lineRows=all.filter(row=>!line||row.line===line),classified=lineRows.filter(row=>Boolean(row.production_shift));
    const filtered=lineRows.filter(row=>!shift||row.production_shift===shift);
    const snapshots=LINE_IDS.filter(id=>!line||id===line).map(id=>({line:id,read:store.read(id)}));
    const hasSnapshot=snapshots.some(x=>x.read.snapshot),shiftProven=!shift||classified.length>0,scopeProven=hasSnapshot&&shiftProven;
    const ranking=scopeProven?rankDailyFailures(filtered):[],top=ranking[0]||null,pcbas=scopeProven?uniq(filtered.map(row=>row.pcba)):[];
    const repaired=scopeProven?filtered.filter(row=>row.repair_comment||row.repair_user||row.repair_time||row.repair_code).length:null;
    const reuse=scopeProven?uniq(filtered.filter(row=>row.reuse_with_failure).map(row=>row.pcba)).length:null;
    const metrics=productionMetrics(store,{line,shift:shift||'',hour:'',product:'',from:'',to:''},filtered);
    const key=JSON.stringify([line,shift,scopeProven,filtered.length,classified.length,pcbas.length,repaired,reuse,top?.code,top?.count,metrics,snapshots.map(x=>[x.line,x.read.snapshot?.snapshot_id,x.read.freshness]),document.documentElement.lang]);if(key===last)return;last=key;
    const value=v=>v===null||v===undefined?'—':v;
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<section class="mes-context-panel ames-shift-summary"><div class="section-head"><div><h3>${t('Resumo operacional do turno','Operational shift summary')}</h3><p>${t('Sem turno selecionado, mostra o snapshot carregado. Um turno só filtra quando existe classificação 3022 que o comprove.','With no shift selected, the loaded snapshot is shown. A shift filters only when 3022 classification proves it.')}</p></div><div class="ames-shift-controls"><label>${t('Linha','Line')}<select data-shift-line><option value="">${t('Todas','All')}</option>${LINE_IDS.map((id,i)=>`<option value="${id}"${id===line?' selected':''}>${t('Linha','Line')} ${i+1}</option>`).join('')}</select></label><label>${t('Turno','Shift')}<select data-shift><option value=""${!shift?' selected':''}>${t('Todos / não filtrar','All / do not filter')}</option><option value="1st Shift"${shift==='1st Shift'?' selected':''}>${t('1º Turno','1st Shift')}</option><option value="2nd Shift"${shift==='2nd Shift'?' selected':''}>${t('2º Turno','2nd Shift')}</option></select></label></div></div>${shift&&!shiftProven?`<div class="notice warn"><b>${t('Turno não comprovado','Shift not proven')}</b><br>${t('As falhas carregadas ainda não possuem classificação 3022 suficiente para afirmar zero neste turno. O filtro não transforma ausência de evidência em zero.','Loaded failures do not yet have enough 3022 classification to assert zero for this shift. The filter does not turn missing evidence into zero.')}</div>`:''}<div class="ames-shift-summary-grid"><div class="stat"><span class="stat-label">${t('Falhas no escopo','Failures in scope')}</span><strong class="stat-value">${scopeProven?filtered.length:'—'}</strong></div><div class="stat"><span class="stat-label">${t('PCBAs únicas','Unique PCBAs')}</span><strong class="stat-value">${scopeProven?pcbas.length:'—'}</strong></div><div class="stat"><span class="stat-label">${t('Com evidência de reparo','With repair evidence')}</span><strong class="stat-value">${value(repaired)}</strong></div><div class="stat"><span class="stat-label">${t('Reuso + falha histórica','Reuse + prior failure')}</span><strong class="stat-value">${value(reuse)}</strong></div></div><div class="ames-shift-detail"><div><span>${t('Falha líder','Top failure')}</span><b>${esc(top?`${defectLabel(top.code,top.description)} · ${top.count}`:'—')}</b></div><div><span>${t('Produção','Production')}</span><b>${scopeProven&&metrics.denominatorProven?esc(metrics.quantity):'—'}</b><small>${scopeProven&&metrics.denominatorProven?t('denominador comprovado','proven denominator'):t('não exibida sem denominador do escopo','hidden without a proven scope denominator')}</small></div><div><span>Check FPY</span><b>${scopeProven&&metrics.denominatorProven?fmtPct(metrics.checkFpy):'—'}</b><small>${scopeProven&&metrics.denominatorProven?t('ponderado pela produção','production-weighted'):t('não calculado sem cobertura comprovada','not calculated without proven coverage')}</small></div><div><span>${t('Escopo','Scope')}</span><b>${esc(`${lineLabel(line)} · ${shiftLabel(shift)}`)}</b><small>${snapshots.filter(x=>x.read.snapshot).length}/${snapshots.length} ${t('linhas com snapshot','lines with snapshot')} · ${classified.length}/${lineRows.length} ${t('falhas com turno 3022','failures with 3022 shift')}</small></div></div><div class="ames-shift-actions"><button type="button" class="button secondary" data-shift-evidence>${t('Ver evidência do resumo','View summary evidence')}</button></div></section>`;
    root.querySelector('[data-shift-line]')?.addEventListener('change',event=>{line=event.target.value;if(line)store.updateContext?.({line_id:line});last='';render();});
    root.querySelector('[data-shift]')?.addEventListener('change',event=>{shift=event.target.value;store.updateContext?.({shift:shift||null});last='';render();});
    root.querySelector('[data-shift-evidence]')?.addEventListener('click',()=>onEvidence({title:t('Evidência · resumo de turno','Evidence · shift summary'),description:shift&&!shiftProven?t('Turno selecionado sem classificação 3022 suficiente; valores dependentes do turno permanecem indisponíveis.','Selected shift lacks sufficient 3022 classification; shift-dependent values remain unavailable.'):t('Os números abaixo vêm somente das ocorrências carregadas no snapshot atual.','The figures below come only from occurrences loaded in the current snapshot.'),fields:[[t('Escopo','Scope'),`${lineLabel(line)} · ${shiftLabel(shift)}`],[t('Falhas','Failures'),scopeProven?filtered.length:'—'],[t('PCBAs únicas','Unique PCBAs'),scopeProven?pcbas.length:'—'],[t('Classificadas por turno 3022','3022 shift-classified'),`${classified.length}/${lineRows.length}`],[t('Produção','Production'),scopeProven&&metrics.denominatorProven?metrics.quantity:t('não comprovada para este escopo','not proven for this scope')]],lines:snapshots.map(x=>({label:`${t('Linha','Line')} ${LINE_IDS.indexOf(x.line)+1} · ${x.line}`,snapshot:x.read.snapshot?.snapshot_id||t('sem snapshot','no snapshot'),freshness:x.read.freshness,detail:x.read.source})),notes:[t('0 é reservado a consultas com cobertura comprovada. Falta de classificação de turno aparece como — / turno não comprovado.','0 is reserved for queries with proven coverage. Missing shift classification appears as — / shift not proven.')]}));
  }
  return {render,clear(){root?.replaceChildren();last='';}};
}
