import {SOURCE_STATE,sourceStateFromTrace,sourceStateHasEvidence,sourceStateLabel} from './data/source-provenance.mjs';

const locale=()=>document.documentElement.lang||'pt-BR';
const t=(pt,en)=>String(locale()).toLowerCase().startsWith('en')?en:pt;
const hasState=trace=>Boolean(trace&&(trace.status!==undefined||trace.state!==undefined||trace.ok!==undefined||trace.completed!==undefined||trace.error||trace.reason));
const rowsOf=(snapshot,kind)=>{
  if(kind==='pcba')return snapshot?.pcba_history?.records||snapshot?.canonical?.datasets?.pcba_history||[];
  if(kind==='material')return snapshot?.material_trace?.records||snapshot?.canonical?.datasets?.material_reuse||[];
  return [];
};
const traceOf=(snapshot,kind)=>kind==='pcba'?snapshot?.pcba_history||null:kind==='material'?snapshot?.material_trace||null:null;
function sourceFor(snapshot,kind,readState=SOURCE_STATE.OK){
  if(!snapshot)return SOURCE_STATE.NOT_COLLECTED;
  const rows=rowsOf(snapshot,kind),trace=traceOf(snapshot,kind);
  let state;
  if(hasState(trace))state=sourceStateFromTrace(trace,{recordCount:rows.length,countProven:true});
  else state=rows.length?SOURCE_STATE.OK:SOURCE_STATE.NOT_COLLECTED;
  if(rows.length&&[SOURCE_STATE.ERROR,SOURCE_STATE.UNAVAILABLE,SOURCE_STATE.NOT_COLLECTED].includes(state))state=SOURCE_STATE.PARTIAL;
  if(readState===SOURCE_STATE.CACHED&&sourceStateHasEvidence(state)&&state!==SOURCE_STATE.ERROR&&state!==SOURCE_STATE.UNAVAILABLE)return SOURCE_STATE.CACHED;
  return state;
}
function combineCorrelation(material,pcba){
  const states=[material,pcba];
  const evidence=states.filter(sourceStateHasEvidence).length;
  if(states.includes(SOURCE_STATE.ERROR))return evidence?SOURCE_STATE.PARTIAL:SOURCE_STATE.ERROR;
  if(states.includes(SOURCE_STATE.UNAVAILABLE))return evidence?SOURCE_STATE.PARTIAL:SOURCE_STATE.UNAVAILABLE;
  if(states.includes(SOURCE_STATE.NOT_COLLECTED))return evidence?SOURCE_STATE.PARTIAL:SOURCE_STATE.NOT_COLLECTED;
  if(states.includes(SOURCE_STATE.PARTIAL))return SOURCE_STATE.PARTIAL;
  if(states.includes(SOURCE_STATE.CACHED))return SOURCE_STATE.CACHED;
  if(states.includes(SOURCE_STATE.ZERO))return SOURCE_STATE.ZERO;
  return SOURCE_STATE.OK;
}

export function reuseGroupSourceState(snapshot,group,readState=SOURCE_STATE.OK){
  if(group==='material_kpis')return sourceFor(snapshot,'material',readState);
  if(group==='pcba_kpis')return sourceFor(snapshot,'pcba',readState);
  if(group==='correlation_kpis')return combineCorrelation(sourceFor(snapshot,'material',readState),sourceFor(snapshot,'pcba',readState));
  return null;
}

function sourceNote(state){
  if(state===SOURCE_STATE.ERROR)return t('Fonte com erro · valor não confirmado','Source error · value not confirmed');
  if(state===SOURCE_STATE.UNAVAILABLE)return t('Fonte indisponível · valor desconhecido','Source unavailable · value unknown');
  if(state===SOURCE_STATE.NOT_COLLECTED)return t('Fonte não coletada · valor desconhecido','Source not collected · value unknown');
  if(state===SOURCE_STATE.PARTIAL)return t('Cobertura parcial','Partial coverage');
  if(state===SOURCE_STATE.CACHED)return t('Cache local','Local cache');
  if(state===SOURCE_STATE.ZERO)return t('Zero confirmado','Confirmed zero');
  return t('Fonte disponível','Source available');
}
function tone(state){return state===SOURCE_STATE.ERROR?'bad':state===SOURCE_STATE.PARTIAL||state===SOURCE_STATE.CACHED?'warn':sourceStateHasEvidence(state)?'ok':'unknown';}

export function withReuseProvenance(base,root,store){
  function decorate(){
    const line=store.context?.().line_id||store.preferredLine?.();
    const read=line?store.read(line):{snapshot:null,source_state:SOURCE_STATE.NOT_COLLECTED};
    for(const section of root.querySelectorAll('[data-reuse-group]')){
      const group=section.dataset.reuseGroup,state=reuseGroupSourceState(read.snapshot,group,read.source_state||SOURCE_STATE.OK);
      if(!state)continue;
      section.dataset.reuseSourceState=state;
      section.querySelector('[data-reuse-provenance]')?.remove();
      const badge=document.createElement('span');badge.dataset.reuseProvenance='1';badge.className=`status ${tone(state)}`;badge.textContent=`${sourceStateLabel(state,locale())} · ${sourceNote(state)}`;
      section.querySelector('.section-head')?.append(badge);
      const proven=sourceStateHasEvidence(state);
      for(const card of section.querySelectorAll('.stat')){
        const value=card.querySelector('.stat-value'),note=card.querySelector('.stat-note');
        if(!proven&&value){value.textContent='—';value.dataset.sourceUnknown='1';}
        if(!proven&&note)note.textContent=sourceNote(state);
        if(card.matches('button')){
          card.disabled=!proven;
          card.setAttribute('aria-disabled',String(!proven));
        }
      }
    }
  }
  return {render(){base.render();decorate();},clear(){base.clear?.();}};
}
