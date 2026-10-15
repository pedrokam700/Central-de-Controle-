import {buildLiveSnForensics} from './data/sn-forensics.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function snConsistencySummary(result={}){
  const model=buildLiveSnForensics(result),rawCurrent=model.current?.source==='2114-raw',rawPrevious=model.materials.flatMap(item=>item.history||[]).filter(entry=>entry.failure?.source==='2114-raw');
  return {model,current:model.current,own_history:model.own_history,raw_current_recovered:rawCurrent,raw_previous_recovered:rawPrevious};
}
function setKpi(root,labelRx,value,title=''){
  const card=[...root.querySelectorAll('.ames-sn-kpi-row > div')].find(el=>labelRx.test(el.querySelector('small')?.textContent?.trim()||''));
  const target=card?.querySelector('b');if(!target)return;if(value!==null&&value!==undefined)target.textContent=String(value);if(title)target.title=title;
}
function patchDigest(root,summary){
  if(!summary.current)return;
  const card=[...root.querySelectorAll('.ames-sn-digest-card')].find(el=>/^(Falha da PCBA|PCBA failure)$/i.test(el.querySelector('h3')?.textContent?.trim()||''));
  if(!card)return;
  const already=card.querySelector('strong');
  if(already)return;
  const f=summary.current,title=[f.defect_code,f.defect_desc].filter(Boolean).join(' — ')||'—';
  card.classList.add('ames-sn-digest-primary');
  card.innerHTML=`<h3>${t('Falha da PCBA','PCBA failure')}</h3><strong>${esc(title)}</strong><dl><dt>Defect Time</dt><dd>${esc(f.defect_time||'—')}</dd><dt>Manual / Automatic</dt><dd>${esc(f.manual_or_auto||'—')}</dd><dt>${t('Falhas anteriores','Previous failures')}</dt><dd>${summary.own_history.length}</dd></dl>`;
}
function decorate(root,store){
  root.querySelector('[data-sn-consistency-note]')?.remove();
  const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;if(!result)return;
  const summary=snConsistencySummary(result),has2114Evidence=Boolean(summary.current||summary.own_history.length);
  if(has2114Evidence){
    setKpi(root,/^(Falha atual|Current failure)$/i,summary.current?1:0,summary.raw_current_recovered?t('Recuperada das linhas brutas da mesma consulta 2114','Recovered from raw rows of the same 2114 query'):'2114');
    setKpi(root,/^(Falhas antigas PCBA|Previous PCBA failures)$/i,summary.own_history.length,'2114');
    setKpi(root,/^(Histórias 2114|2114 histories)$/i,summary.own_history.length+(summary.current?1:0),'2114');
    patchDigest(root,summary);
  }
  if(!summary.raw_current_recovered&&!summary.raw_previous_recovered.length)return;
  const note=document.createElement('div');note.dataset.snConsistencyNote='1';note.className='notice warn';
  const current=summary.current?`${summary.current.defect_code||'—'} — ${summary.current.defect_desc||'—'}`:'';
  const old=[...new Set(summary.raw_previous_recovered.map(entry=>`${entry.pcba_sn}: ${entry.failure?.defect_code||'—'} — ${entry.failure?.defect_desc||'—'}`))];
  note.innerHTML=`<b>${t('2114 · associação recuperada','2114 · recovered association')}</b><br>${t('A tela 2114 retornou linhas exatas, mas o resumo pré-selecionado não havia ligado todas elas à PCBA. O Console usou essas mesmas linhas 2114; isto não é inferência.','2114 returned exact rows, but the preselected summary had not attached all of them to the PCBA. The Console used those same 2114 rows; this is not an inference.')}${current?`<br><strong>${t('Falha atual','Current failure')}:</strong> ${esc(current)}`:''}${old.length?`<br><strong>${t('PCBAs anteriores','Previous PCBAs')}:</strong> ${old.map(esc).join(' | ')}`:''}`;
  const anchor=root.querySelector('.ames-sn-forensic-intro,.ames-sn-hero,[data-sn-result]');anchor?.parentNode?.insertBefore(note,anchor);
}
export function withSnEvidenceConsistency(base,root,store){return {render(){base.render();decorate(root,store);},clear(){base.clear?.();root.querySelector('[data-sn-consistency-note]')?.remove();}};}
