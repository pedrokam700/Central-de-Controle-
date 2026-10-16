import {buildLiveSnForensics} from './data/sn-forensics.mjs';
import {LINE_IDS} from './data/contract.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=value=>String(value??'').trim();
const pcbaOf=row=>text(row?.pcba_sn||row?.PCBA||row?.['Lot Id']||row?.current_pcba_sn);
const failureOf=(row,source)=>row?{pcba_sn:pcbaOf(row),defect_code:row.defect_code||row['Defect Code']||null,defect_desc:row.defect_desc||row['Defect Description']||row['Defect Desc']||null,defect_time:row.defect_time||row['Defect Time']||null,manual_or_auto:row.manual_or_auto||row['Manual/Automatic']||null,source,raw:row}:null;
const newest=rows=>[...(rows||[])].sort((a,b)=>text(b?.defect_time||b?.['Defect Time']).localeCompare(text(a?.defect_time||a?.['Defect Time'])))[0]||null;

export function snConsistencySummary(result={}){
  const model=buildLiveSnForensics(result),rawCurrent=model.current?.source==='2114-raw',rawPrevious=model.materials.flatMap(item=>item.history||[]).filter(entry=>entry.failure?.source==='2114-raw');
  return {model,current:model.current,own_history:model.own_history,raw_current_recovered:rawCurrent,raw_previous_recovered:rawPrevious};
}
export function localSnEvidence(store,result,model=buildLiveSnForensics(result||{})){
  const query=text(result?.sn),oldPcbas=new Set(model.materials.flatMap(item=>item.previous_pcbas||[]).map(text).filter(Boolean)),current3028=[],history=[];
  for(const line of LINE_IDS){
    const snapshot=store.read?.(line)?.snapshot;if(!snapshot)continue;
    for(const row of snapshot.occurrences||[])if(pcbaOf(row)===query)current3028.push(row);
    const rows=snapshot?.pcba_history?.records||snapshot?.canonical?.datasets?.pcba_history||[];
    for(const row of rows)if(pcbaOf(row)===query||oldPcbas.has(pcbaOf(row)))history.push(row);
  }
  const currentHistory=history.filter(row=>pcbaOf(row)===query),previousHistory=history.filter(row=>oldPcbas.has(pcbaOf(row)));
  return {current_3028:failureOf(newest(current3028),'3028-cache'),current_2114:failureOf(newest(currentHistory),'2114-cache'),previous_2114:previousHistory.map(row=>failureOf(row,'2114-cache')).filter(Boolean)};
}
function setKpi(root,labelRx,value,title=''){
  const card=[...root.querySelectorAll('.ames-sn-kpi-row > div')].find(el=>labelRx.test(el.querySelector('small')?.textContent?.trim()||''));
  const target=card?.querySelector('b');if(!target)return;if(value!==null&&value!==undefined)target.textContent=String(value);if(title)target.title=title;
}
function patchDigest(root,current,previousCount=0,source='2114'){
  if(!current)return;
  const card=[...root.querySelectorAll('.ames-sn-digest-card')].find(el=>/^(Falha da PCBA|PCBA failure)$/i.test(el.querySelector('h3')?.textContent?.trim()||''));
  if(!card)return;
  const f=current,title=[f.defect_code,f.defect_desc].filter(Boolean).join(' — ')||'—';
  card.classList.add('ames-sn-digest-primary');
  card.innerHTML=`<h3>${t('Falha da PCBA','PCBA failure')}</h3><strong>${esc(title)}</strong><dl><dt>Defect Time</dt><dd>${esc(f.defect_time||'—')}</dd><dt>Manual / Automatic</dt><dd>${esc(f.manual_or_auto||'—')}</dd><dt>${t('Fonte','Source')}</dt><dd>${esc(source)}</dd><dt>${t('Falhas anteriores','Previous failures')}</dt><dd>${previousCount}</dd></dl>`;
}
function cachedHistoryPanel(root,evidence){
  root.querySelector('[data-sn-cached-history]')?.remove();if(!evidence.previous_2114.length)return;
  const panel=document.createElement('section');panel.dataset.snCachedHistory='1';panel.className='mes-context-panel ames-sn-cached-history';
  panel.innerHTML=`<div class="section-head"><div><h3>${t('Histórico local das PCBAs anteriores','Local history of previous PCBAs')}</h3><p>${t('Evidência exata 2114 já armazenada neste posto. Ela complementa a consulta ao vivo quando a associação da resposta atual fica incompleta.','Exact 2114 evidence already stored on this workstation. It complements the live query when the current response association is incomplete.')}</p></div><span class="status warn">CACHE LOCAL</span></div><div class="ames-sn-material-history">${evidence.previous_2114.map(f=>`<article class="ames-sn-history-story"><header><div><small>${t('PCBA anterior','Previous PCBA')}</small><b>${esc(f.pcba_sn||'—')}</b></div><span class="status">2114 · CACHE</span></header><div class="ames-sn-old-failure"><small>${t('Falha antiga','Previous failure')}</small><strong>${esc([f.defect_code,f.defect_desc].filter(Boolean).join(' — ')||'—')}</strong><span>${esc(f.defect_time||'—')}</span></div></article>`).join('')}</div>`;
  const anchor=root.querySelector('.ames-sn-materials-story');anchor?.parentNode?.insertBefore(panel,anchor);
}
function decorate(root,store){
  root.querySelector('[data-sn-consistency-note]')?.remove();root.querySelector('[data-sn-cached-history]')?.remove();
  const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;if(!result)return;
  const summary=snConsistencySummary(result),local=localSnEvidence(store,result,summary.model),liveCurrent=summary.current,cachedCurrent=!liveCurrent?(local.current_2114||local.current_3028):null,current=liveCurrent||cachedCurrent;
  const liveHistoryCount=summary.own_history.length,localOwnCount=local.current_2114&&!liveCurrent?1:0;
  if(current){
    setKpi(root,/^(Falha atual|Current failure)$/i,1,cachedCurrent?t('Evidência exata já armazenada neste posto','Exact evidence already stored on this workstation'):summary.raw_current_recovered?t('Recuperada das linhas brutas da mesma consulta 2114','Recovered from raw rows of the same 2114 query'):'2114');
    setKpi(root,/^(Falhas antigas PCBA|Previous PCBA failures)$/i,liveHistoryCount,'2114');
    setKpi(root,/^(Histórias 2114|2114 histories)$/i,Math.max(liveHistoryCount+(liveCurrent?1:0),liveHistoryCount+localOwnCount),'2114/cache');
    patchDigest(root,current,liveHistoryCount,cachedCurrent?(current.source==='2114-cache'?'2114 · cache local':'3028 · cache local'):'2114');
  }
  cachedHistoryPanel(root,local);
  const hasLocalCorrection=Boolean(cachedCurrent||local.previous_2114.length),hasRawCorrection=summary.raw_current_recovered||summary.raw_previous_recovered.length;
  if(!hasLocalCorrection&&!hasRawCorrection)return;
  const note=document.createElement('div');note.dataset.snConsistencyNote='1';note.className='notice warn';
  const liveCurrentText=summary.current?`${summary.current.defect_code||'—'} — ${summary.current.defect_desc||'—'}`:'';
  const cachedCurrentText=cachedCurrent?`${cachedCurrent.defect_code||'—'} — ${cachedCurrent.defect_desc||'—'}`:'';
  const rawOld=[...new Set(summary.raw_previous_recovered.map(entry=>`${entry.pcba_sn}: ${entry.failure?.defect_code||'—'} — ${entry.failure?.defect_desc||'—'}`))];
  const cachedOld=[...new Set(local.previous_2114.map(f=>`${f.pcba_sn}: ${f.defect_code||'—'} — ${f.defect_desc||'—'}`))];
  note.innerHTML=`<b>${t('Consulta por SN · verificação cruzada de evidência','SN query · evidence cross-check')}</b><br>${cachedCurrent?t('A consulta 2114 ao vivo não ligou uma falha atual, mas este posto possui evidência exata da mesma PCBA. O Console mostra essa evidência como cache local em vez de afirmar que a placa não tem falha.','The live 2114 query did not attach a current failure, but this workstation has exact evidence for the same PCBA. The Console shows it as local cache instead of claiming the board has no failure.'):t('A 2114 retornou linhas exatas que o resumo pré-selecionado não havia ligado completamente. O Console reaproveitou as mesmas linhas da fonte; isto não é inferência.','2114 returned exact rows that the preselected summary had not fully attached. The Console reused the same source rows; this is not an inference.')}${(cachedCurrentText||liveCurrentText)?`<br><strong>${t('Falha atual','Current failure')}:</strong> ${esc(cachedCurrentText||liveCurrentText)}`:''}${(cachedOld.length||rawOld.length)?`<br><strong>${t('PCBAs anteriores','Previous PCBAs')}:</strong> ${[...new Set([...cachedOld,...rawOld])].map(esc).join(' | ')}`:''}`;
  const anchor=root.querySelector('.ames-sn-forensic-intro,.ames-sn-hero,[data-sn-result]');anchor?.parentNode?.insertBefore(note,anchor);
}
export function withSnEvidenceConsistency(base,root,store){return {render(){base.render();decorate(root,store);},clear(){base.clear?.();root.querySelector('[data-sn-consistency-note]')?.remove();root.querySelector('[data-sn-cached-history]')?.remove();}};}
