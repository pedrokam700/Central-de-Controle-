import {SOURCE_STATE,sourceStateFromTrace,sourceStateHasEvidence,sourceStateLabel} from './data/source-provenance.mjs';

const locale=()=>document.documentElement.lang||'pt-BR';
const t=(pt,en)=>String(locale()).toLowerCase().startsWith('en')?en:pt;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
  if(group==='correlation_kpis'||group==='rate_kpis')return combineCorrelation(sourceFor(snapshot,'material',readState),sourceFor(snapshot,'pcba',readState));
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
const num=value=>{const parsed=Number.parseFloat(String(value??'').replace(',','.'));return Number.isFinite(parsed)?parsed:0;};
const uniq=(rows,keyFn)=>{const seen=new Set();return (rows||[]).filter(row=>{const key=keyFn(row);if(!key||seen.has(key))return false;seen.add(key);return true;});};
const reuseIndex=row=>num(row?._pcba_use_index??row?.['Uso da PCBA na falha']);
const materialReuseIndex=row=>num(row?.['Reusos anteriores material']);
const oldFailures=row=>num(row?.['Falhas 2114 nas desvinculadas']);
const sameFailures=row=>num(row?.['PCBAs com mesma falha']);
const familyFailures=row=>num(row?.['PCBAs com mesma família']);
const materialType=row=>String(row?.['Tipo material']||row?.item_type||row?.material_type||'').toLowerCase();
const pcbaKey=row=>String(row?.PCBA||row?.['PCBA atual']||row?.pcba_sn||row?.current_pcba_sn||'');
const materialKey=row=>String(row?.['Material SN']||row?.item_sn||row?.material_sn||'');

/** Exact numerator/source evidence for KPI cards that older insight payloads did not expose as named drill-downs. */
export function reuseKpiEvidence(snapshot,label){
  const insights=snapshot?.insights||{},drill=insights.drilldowns||{};
  const pcbas=drill.pcba_analysis||[],materials=drill.material_analysis||[],histories=drill.pcba_history||[];
  const text=String(label||'').trim();
  let rows=null,kind='exact';
  if(text==='PCBA em 1º uso')rows=pcbas.filter(r=>reuseIndex(r)===1);
  else if(text==='PCBA uso não determinado')rows=pcbas.filter(r=>reuseIndex(r)===0);
  else if(text==='PCBAs 2º+ uso com só 1 falha 2114')rows=pcbas.filter(r=>reuseIndex(r)>=2&&num(r['Falhas registradas 2114'])===1);
  else if(text==='PCBAs com 2+ falhas 2114')rows=pcbas.filter(r=>num(r['Falhas registradas 2114'])>=2);
  else if(text==='PCBAs com 3+ falhas 2114')rows=pcbas.filter(r=>num(r['Falhas registradas 2114'])>=3);
  else if(text==='Recorrência após MainBoard + Y'){
    const matched=histories.filter(r=>String(r['Posição no histórico']||'')==='ANTERIOR'&&['MESMA FALHA','MESMA FAMÍLIA'].includes(String(r['Relação com falha atual']||''))&&String(r['Situação reparo']||'')==='REPARO DE PLACA CONCLUÍDO');
    rows=uniq(matched,pcbaKey);
  }
  else if(text==='Reuso SEM falha em PCBA desvinculada')rows=materials.filter(r=>materialReuseIndex(r)>=1&&oldFailures(r)===0);
  else if(text==='Reuso com somente outras falhas')rows=materials.filter(r=>materialReuseIndex(r)>=1&&oldFailures(r)>0&&sameFailures(r)===0&&familyFailures(r)===0);
  else if(text==='Screens/LCDs reutilizados')rows=materials.filter(r=>materialReuseIndex(r)>=1&&/(screen|lcd|display|显示屏|液晶|屏幕|屏组件|屏模组)/i.test(materialType(r)));
  else if(text==='Câmeras reutilizadas')rows=materials.filter(r=>materialReuseIndex(r)>=1&&/(camera|摄像|相机)/i.test(materialType(r)));
  else if(text==='Tipos de componente com reuso')rows=uniq(materials.filter(r=>materialReuseIndex(r)>=1),r=>materialType(r));
  else if(text==='% PCBAs atuais em 2º+ uso')rows=pcbas.filter(r=>reuseIndex(r)>=2);
  else if(text==='% PCBAs reutilizadas com falha anterior')rows=pcbas.filter(r=>reuseIndex(r)>=2&&num(r['Falhas anteriores 2114'])>0);
  else if(text==='% PCBAs em 2º uso que repetiram mesma falha')rows=pcbas.filter(r=>reuseIndex(r)===2&&num(r['Mesma falha anterior'])>0);
  else if(text==='% materiais presentes que são 2º+ uso')rows=materials.filter(r=>materialReuseIndex(r)>=1);
  else if(text==='% materiais reutilizados com falha anterior')rows=materials.filter(r=>materialReuseIndex(r)>=1&&oldFailures(r)>0);
  else if(text==='% materiais reutilizados com mesma falha')rows=materials.filter(r=>materialReuseIndex(r)>=1&&sameFailures(r)>0);
  else if(text==='% materiais reutilizados com mesma família')rows=materials.filter(r=>materialReuseIndex(r)>=1&&sameFailures(r)===0&&familyFailures(r)>0);
  if(rows!==null)return {rows,kind};
  const groupRows=[...(drill.pcba_analysis||[]),...(drill.material_analysis||[])];
  return {rows:groupRows,kind:'source'};
}

function rowIdentity(row){return row?.PCBA||row?.['PCBA atual']||row?.pcba_sn||row?.['Material SN']||row?.item_sn||row?.historical_pcba||row?.['PCBA desvinculada']||'—';}
function evidencePanel(root,snapshot,label,value){
  root.querySelector('[data-reuse-fallback-evidence]')?.remove();
  const {rows,kind}=reuseKpiEvidence(snapshot,label),panel=document.createElement('section');
  panel.dataset.reuseFallbackEvidence='1';panel.className='mes-context-panel ames-selected-evidence';
  const exact=kind==='exact';
  const intro=exact
    ?t(`${rows.length} item(ns) formam o conjunto deste indicador.`,`The indicator set contains ${rows.length} item(s).`)
    :t('Este build antigo do insight não trouxe um drill-down 1:1 para este indicador. A evidência de origem disponível é mostrada abaixo sem fingir equivalência exata.','This older insight build did not provide a 1:1 drill-down for this KPI. Available source evidence is shown below without pretending exact equivalence.');
  const shown=rows.slice(0,120);
  panel.innerHTML=`<div class="section-head"><div><h3>${esc(label)}</h3><p>${esc(intro)}</p></div><button type="button" class="button secondary" data-reuse-fallback-close>${t('Fechar evidência','Close evidence')}</button></div><div class="ames-summary-grid"><div class="ames-kv"><small>${t('Valor do indicador','KPI value')}</small><b>${esc(value)}</b></div><div class="ames-kv"><small>${t('Registros exibidos','Shown records')}</small><b>${shown.length}</b></div></div>${shown.length?`<div class="ames-reuse-fallback-list">${shown.map(row=>{const fields=Object.entries(row||{}).filter(([key,val])=>!key.startsWith('_')&&val!==null&&val!==undefined&&val!==''&&typeof val!=='object').slice(0,8);return `<article class="ames-evidence-card"><div class="ames-evidence-card-head"><b>${esc(rowIdentity(row))}</b></div><div class="ames-inline-facts">${fields.map(([key,val])=>`<span>${esc(key)} <b>${esc(val)}</b></span>`).join('')}</div></article>`;}).join('')}</div>`:`<div class="notice warn"><b>${t('Sem linha detalhada transportada','No detailed row transported')}</b><br>${t('O valor agregado existe, mas este snapshot não trouxe a linha de evidência correspondente. Isso fica explícito em vez de um botão sem resposta.','The aggregate value exists, but this snapshot did not transport the corresponding evidence row. This is shown explicitly instead of leaving an unresponsive KPI.')}</div>`}`;
  root.append(panel);panel.querySelector('[data-reuse-fallback-close]')?.addEventListener('click',()=>panel.remove());
  requestAnimationFrame(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));
}

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
          continue;
        }
        const numeric=num(value?.textContent);
        if(proven&&numeric>0){
          const label=card.querySelector('.stat-label')?.textContent?.trim()||t('Indicador','Indicator');
          card.classList.remove('ames-kpi-disabled');card.classList.add('ames-kpi-button');card.dataset.reuseFallback='1';card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-label',`${label} · ${t('abrir evidência','open evidence')}`);
          if(note)note.textContent=t('ver evidência','view evidence');
          const open=()=>evidencePanel(root,read.snapshot,label,value?.textContent?.trim()||numeric);
          card.addEventListener('click',open);card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
        }
      }
    }
  }
  return {render(){base.render();decorate();},clear(){base.clear?.();}};
}
