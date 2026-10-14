import {SOURCE_STATE,sourceStateFromTrace,sourceStateLabel} from './data/source-provenance.mjs';

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const locale=()=>document.documentElement.lang||'pt-BR';
const hasExplicitState=trace=>Boolean(trace&&(trace.status!==undefined||trace.state!==undefined||trace.ok!==undefined||trace.completed!==undefined||trace.error||trace.reason));
const rowsOf=snapshot=>{
  const timeline=snapshot?.process_timeline||null;
  const events=timeline?.events||snapshot?.canonical?.datasets?.process_timeline||[];
  const contexts=timeline?.contexts||snapshot?.process_contexts||snapshot?.canonical?.datasets?.process_defect_contexts||[];
  return {timeline,events:Array.isArray(events)?events:[],contexts:Array.isArray(contexts)?contexts:[]};
};

export function processSourceState(snapshot,readState=SOURCE_STATE.OK){
  if(!snapshot)return SOURCE_STATE.NOT_COLLECTED;
  const {timeline,events,contexts}=rowsOf(snapshot),count=events.length+contexts.length;
  let state;
  if(hasExplicitState(timeline))state=sourceStateFromTrace(timeline,{recordCount:count,countProven:true});
  else state=count?SOURCE_STATE.OK:SOURCE_STATE.NOT_COLLECTED;
  if(count&&[SOURCE_STATE.ERROR,SOURCE_STATE.UNAVAILABLE,SOURCE_STATE.NOT_COLLECTED].includes(state))state=SOURCE_STATE.PARTIAL;
  if(readState===SOURCE_STATE.CACHED&&[SOURCE_STATE.OK,SOURCE_STATE.ZERO,SOURCE_STATE.PARTIAL].includes(state))return SOURCE_STATE.CACHED;
  return state;
}

function hasUsableCounts(state,snapshot){
  if([SOURCE_STATE.OK,SOURCE_STATE.ZERO,SOURCE_STATE.CACHED].includes(state))return true;
  if(state!==SOURCE_STATE.PARTIAL)return false;
  const {events,contexts}=rowsOf(snapshot);return events.length+contexts.length>0;
}
function tone(state){return state===SOURCE_STATE.ERROR?'bad':state===SOURCE_STATE.PARTIAL||state===SOURCE_STATE.CACHED?'warn':[SOURCE_STATE.OK,SOURCE_STATE.ZERO].includes(state)?'ok':'unknown';}
function explanation(state){
  if(state===SOURCE_STATE.ERROR)return t('A 3022 falhou nesta leitura. Os zeros visuais foram bloqueados porque a ausência de retorno não comprova ausência de eventos.','3022 failed in this read. Visual zeros were blocked because no response does not prove there are no events.');
  if(state===SOURCE_STATE.UNAVAILABLE)return t('A 3022 está indisponível neste contexto. Isso não equivale a zero eventos ou zero contextos.','3022 is unavailable in this context. This does not equal zero events or zero contexts.');
  if(state===SOURCE_STATE.NOT_COLLECTED)return t('A 3022 não foi coletada neste snapshot. Valores dependentes dessa fonte ficam como — até existir evidência.','3022 was not collected in this snapshot. Values that depend on this source stay — until evidence exists.');
  if(state===SOURCE_STATE.PARTIAL)return t('A 3022 tem cobertura parcial. Os valores exibidos refletem somente a evidência carregada.','3022 has partial coverage. Shown values reflect only loaded evidence.');
  if(state===SOURCE_STATE.CACHED)return t('A evidência 3022 exibida vem do cache local; ela não comprova o estado atual do A-MES.','Displayed 3022 evidence comes from local cache; it does not prove the current A-MES state.');
  if(state===SOURCE_STATE.ZERO)return t('A coleta 3022 foi concluída e confirmou zero registros neste escopo.','3022 collection completed and confirmed zero records in this scope.');
  return t('A 3022 possui evidência carregada para este escopo.','3022 evidence is loaded for this scope.');
}
function syncContext(root,store,state){
  const context=store.context?.()||{},line=root.querySelector('[data-process-line]'),shift=root.querySelector('[data-process-shift]'),defect=root.querySelector('[data-process-defect]');
  if(!state.syncing&&line&&context.line_id&&line.value!==context.line_id){state.syncing=true;line.value=context.line_id;line.dispatchEvent(new Event('change',{bubbles:true}));state.syncing=false;}
  const nextShift=root.querySelector('[data-process-shift]');
  if(!state.syncing&&nextShift&&context.shift&&nextShift.value!==context.shift){state.syncing=true;nextShift.value=context.shift;nextShift.dispatchEvent(new Event('change',{bubbles:true}));state.syncing=false;}
  const nextDefect=root.querySelector('[data-process-defect]');
  if(!state.syncing&&nextDefect&&context.defect&&[...nextDefect.options].some(option=>option.value===context.defect)&&nextDefect.value!==context.defect){state.syncing=true;nextDefect.value=context.defect;nextDefect.dispatchEvent(new Event('change',{bubbles:true}));state.syncing=false;}
  for(const [selector,key] of [['[data-process-line]','line_id'],['[data-process-shift]','shift'],['[data-process-defect]','defect']]){
    const el=root.querySelector(selector);if(!el||el.dataset.processContextBound)return;el.dataset.processContextBound='1';el.addEventListener('change',()=>{if(state.syncing)return;store.updateContext?.({[key]:el.value||null});});
  }
}
function decorate(root,store){
  const line=root.querySelector('[data-process-line]')?.value||store.context?.().line_id||store.preferredLine?.();
  const read=line?store.read(line):{snapshot:null,source_state:SOURCE_STATE.NOT_COLLECTED},snapshot=read.snapshot;
  const sourceState=processSourceState(snapshot,read.source_state||SOURCE_STATE.OK),usable=hasUsableCounts(sourceState,snapshot);
  const toolbar=root.querySelector('.ames-process-toolbar');if(!toolbar)return;
  toolbar.querySelector('[data-process-provenance]')?.remove();
  const badge=document.createElement('span');badge.dataset.processProvenance='1';badge.className=`status ${tone(sourceState)}`;badge.textContent=`3022 · ${sourceStateLabel(sourceState,locale())}`;toolbar.querySelector('.section-head')?.append(badge);
  root.querySelector('[data-process-source-note]')?.remove();
  const note=document.createElement('div');note.dataset.processSourceNote='1';note.className=`notice ${sourceState===SOURCE_STATE.ERROR||sourceState===SOURCE_STATE.PARTIAL||sourceState===SOURCE_STATE.CACHED?'warn':''}`;note.innerHTML=`<b>${sourceStateLabel(sourceState,locale())}</b><br>${explanation(sourceState)}`;toolbar.after(note);
  const kpis=root.querySelector('.ames-process-kpis');if(kpis){kpis.dataset.processSourceState=sourceState;if(!usable)for(const value of kpis.querySelectorAll('.ames-kv > b')){value.textContent='—';value.dataset.sourceUnknown='1';}}
  const timeline=root.querySelector('.ames-timeline-panel > summary');if(timeline&&!usable)timeline.textContent=timeline.textContent.replace(/\b0\s+evento\(s\)/i,'— evento(s)').replace(/\b0\s+event\(s\)/i,'— event(s)');
}

export function withProcessProvenance(view,root,store){
  const state={syncing:false};
  return Object.freeze({
    render(){view.render();syncContext(root,store,state);decorate(root,store);},
    clear(){view.clear?.();state.syncing=false;}
  });
}
