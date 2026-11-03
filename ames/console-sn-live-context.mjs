import {formatFactoryDateTime as time} from './data/time-display.mjs';
import {buildLiveSnForensics} from './data/sn-forensics.mjs';
import {productionEvidenceForOccurrence,trustedProductionEvidence} from './data/production-evidence.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';
import {decorateSnMaterialBindings} from './console-sn-material-bindings.mjs';
import {decorateSnRepairEvidence,provenRepairUserName} from './console-sn-repair-evidence.mjs';
import {decorateSnHistoryDetail} from './console-sn-history-detail.mjs';
import {decorateSnTemporalProof} from './console-sn-temporal-proof.mjs';
import {decorateSmartSnAlerts} from './console-sn-smart-alerts.mjs';
import {renderMaterialSnInvestigation} from './console-sn-material-investigation.mjs';
import {renderSnMountingViews} from './console-sn-mounting-views.mjs';

const lang=()=>globalThis.document?.documentElement?.lang||'pt-BR';
const t=(pt,en)=>lang().startsWith('en')?en:pt;
const fmt=value=>value===null||value===undefined||value===''?'—':String(value);

export function snLiveSummaryEvidence(result={}){
  const model=buildLiveSnForensics(result),trace2114=result.trace_2114||null;
  const current=model.current||null,previous=Array.isArray(model.own_history)?model.own_history:[];
  const has2114=Boolean(current||previous.length||(trace2114&&Array.isArray(trace2114.previous_failures)));
  const contexts=result.local_snapshot?.process_contexts||[];
  const production=current?productionEvidenceForOccurrence(current,contexts):trustedProductionEvidence({});
  return {model,current,previous,has2114,production};
}

function setKpi(root,labelRx,value,title=''){
  for(const row of root.querySelectorAll('.ames-sn-kpi-row')){
    const card=[...row.children].find(el=>labelRx.test(el.querySelector('small')?.textContent?.trim()||''));
    const target=card?.querySelector('b');if(!target)continue;target.textContent=String(value);if(title)target.title=title;
  }
}
function failureCards(root){return [...root.querySelectorAll('.ames-sn-digest-card')].filter(card=>/^(Falha da PCBA|PCBA failure)$/i.test(card.querySelector('h3')?.textContent?.trim()||''));}
function processCards(root){return [...root.querySelectorAll('.ames-sn-digest-card')].filter(card=>/^(Processo 3022|3022 process)$/i.test(card.querySelector('h3')?.textContent?.trim()||''));}
function patchFailureCards(root,current,previousCount){
  if(!current)return;
  const description=current.defect_desc||t('Descrição não informada','Description not provided');
  for(const card of failureCards(root)){
    card.classList.add('ames-sn-digest-primary');
    card.innerHTML=`<h3>${t('Falha da PCBA','PCBA failure')}</h3><strong>${esc(description)}</strong><dl><dt>${t('Registro da falha (MES)','Failure record (MES)')}</dt><dd>${esc(time(current.defect_time))}</dd><dt>Manual / Automatic</dt><dd>${esc(fmt(current.manual_or_auto))}</dd><dt>${t('Falhas anteriores','Previous failures')}</dt><dd>${previousCount}</dd></dl>`;
  }
}
function patchProcessCards(root,production){
  const station=production.trusted?production.station:'—';
  const eventTime=production.trusted?time(production.event_time):'—';
  const shift=production.trusted?production.shift:'—';
  for(const card of processCards(root)){
    card.innerHTML=`<h3>${t('Processo 3022','3022 process')}</h3><dl><dt>${t('Posto de referência (3022)','Reference station (3022)')}</dt><dd>${esc(fmt(station))}</dd><dt>${t('Horário de geração (3022)','Generation time (3022)')}</dt><dd>${esc(fmt(eventTime))}</dd><dt>${t('Turno comprovado (3022)','Proven shift (3022)')}</dt><dd>${esc(fmt(shift))}</dd></dl>${production.trusted?'':`<small>${t('Sem referência 3022 comprovada para classificar geração/turno.','No proven 3022 reference to classify generation/shift.')}</small>`}`;
  }
}
// Only the compact Summary tab receives these facts; detailed source views stay
// untouched. Unknown association/clock never becomes a proven AT intervention.
export function renderSnCompactContext(model={},result={},locale='pt-BR'){
 const isEn=String(locale).startsWith('en');
 const label=(pt,en)=>isEn?en:pt;
 const previous=model.own_history||[],process=model.process||[];
 const picked=process.filter(p=>p.pcba_sn===model.current_pcba);
 const repairsFor=f=>(f?.repairs||[]).filter(r=>r.association==='exact_occurrence');
 const oldCards=previous.map((f,index)=>{
   const sameClock=(f.defect_time&&model.current?.defect_time&&f.defect_time===model.current.defect_time);
   const repairs=repairsFor(f);
   const cards=repairs.map(r=>{
     const name=provenRepairUserName(r,result,model.current_pcba);
     const identity=name||label('Nome do AT não comprovado','Technician name unproven');
     return '<small>'+esc(identity)+' · 3012 · '+esc(fmt(r.repair_time))+
       (r.repair_comment?' · '+esc(r.repair_comment):'')+'</small>';
   }).join('');
   const possible=(model.repairs||[]).filter(r=>r.pcba_sn===model.current_pcba&&r.defect_code===f.defect_code);
   const unique=new Map(possible.map(r=>[JSON.stringify([r.row_key,r.repair_user,r.repair_time,r.repair_comment]),r]));
   const remarks=[...unique.values()].slice(0,5).map(r=>{
     const name=provenRepairUserName(r,result,model.current_pcba);
     return '<small>3012 · '+esc(name||label('Nome não comprovado','Name unproven'))+
       ' · '+label('ocorrência não atribuída','unassigned occurrence')+
       (r.repair_comment?' · '+esc(r.repair_comment):'')+'</small>';
   }).join('');
   const remark=sameClock?'<small>'+label('Horário 2114 empatado: comentários 3012 não atribuídos individualmente','Equal 2114 times: 3012 comments cannot be attributed individually')+'</small>'+remarks:'';
   return '<div><small>'+label('Falha anterior','Previous fault')+' '+(index+1)+(f.hist_seq!=null?' · Hist Seq '+esc(f.hist_seq):'')+
     '</small><b>'+esc([f.defect_code,f.defect_desc].filter(Boolean).join(' · ')||'—')+'</b>'+
     '<small>2114 · '+esc(fmt(f.defect_type))+' · '+esc(time(f.defect_time))+'</small>'+remark+
     (sameClock?'':cards)+'</div>';
 });
 const processLatest=picked.find(p=>p.event_time&&p.operation_name)||picked.find(p=>p.event_time)||picked[0];
 return '<section class="ames-sn-digest-card" data-sn-compact-context style="grid-column:1/-1"><h3>'+label('Histórico e análise · visão rápida','History and analysis · quick view')+'</h3>'+
   '<div class="ames-sn-digest-grid" style="margin-top:8px">'+
   '<div><small>'+label('Falhas anteriores da própria PCBA','Previous failures on this PCBA')+'</small><b>'+
      previous.length+'</b>'+ (oldCards.length?'<div class="ames-sn-repair-story" style="display:grid;gap:8px;margin-top:7px">'+oldCards.join('')+'</div>':'<small>'+label('Nenhuma falha anterior comprovada','No proven prior fault')+'</small>')+'</div>'+
   '<div><small>'+label('3022 · passagens observadas nesta consulta','3022 · observed process passages')+'</small><b>'+
     (picked.length||'—')+'</b>'+
     (processLatest?'<small>'+esc([processLatest.station,processLatest.operation_name,time(processLatest.event_time)].filter(Boolean).join(' · '))+'</small>':'')+
     '<small>'+label('Passagens não provam geração ou análise específica sem vínculo temporal','Passages do not prove production or a specific analysis without temporal evidence')+'</small></div>'+
   '</div></section>';
}

function decorate(root,result,mountingMode='compare'){
  const evidence=snLiveSummaryEvidence(result);
  root.querySelector('[data-sn-mounting-views]')?.remove();
  const mountingMarkup=renderSnMountingViews(result,lang(),mountingMode);
  if(mountingMarkup)root.querySelector('[data-sn-result]')?.insertAdjacentHTML('afterbegin',mountingMarkup);
  root.querySelector('[data-material-sn-investigation]')?.remove();
  const investigation=renderMaterialSnInvestigation(result,lang());
  if(investigation)root.querySelector('[data-sn-result]')?.insertAdjacentHTML('afterbegin',investigation);
  // Show the reference of the investigated mounting. A 2114 latest-failure
  // fallback must never silently look like an exact 3028 occurrence.
  root.querySelector('[data-sn-assembly-scope]')?.remove();
  const scope=evidence.model.material_selection;
  if(scope){
    const selected=Number(scope.scanned_components||0);
    const excluded=Number(scope.historical_components_ignored||0);
    const unknown=Number(scope.temporal_unknown||0);
    const message=scope.cycle_state==='current_new_cycle'
      ?t('Novo ciclo comprovado por vínculo Y posterior à última falha 2114. O indicador principal permanece na montagem atual; o recorte da última falha é mostrado separadamente na comparação 3074.',
         'New assembly proven by Y binding after the last 2114 failure. The primary KPI uses the current assembly; the last-failure mounting is shown separately in the 3074 comparison.')
      :scope.cycle_state==='current_same_cycle'
        ?t('Montagem atual Y pertence ao mesmo ciclo da última falha 2114; não duplicamos conjuntos.',
           'Current Y assembly belongs to the last 2114 failure cycle; no duplicated assemblies.')
      :scope.cycle_state==='current_cycle_unanchored'
        ?t('Vínculos atuais Y comprovados na 3074, mas não há última falha 2114 para ancorar análise de recorrência.',
           'Current Y bindings proven in 3074, but no last 2114 failure exists to anchor recurrence analysis.')
      :scope.cycle_state==='last_failure_assembly'
        ?t('Sem conjunto atual Y: reconstrução dos vínculos da última falha 2114, inclusive materiais hoje N comprovados naquele instante.',
           'No current Y assembly: links from the last 2114 failure, including materials now N but proven at that instant.')
      :t('Ciclo da montagem indeterminado; vínculos candidatos não são apresentados como peças comprovadas.',
         'Assembly cycle undetermined; candidate links are not presented as proven parts.');
    const section=root.ownerDocument.createElement('section');
    section.dataset.snAssemblyScope='1';
    section.className='mes-context-panel';
    section.setAttribute('role','status');
    const header=root.ownerDocument.createElement('strong');
    header.textContent=t('Escopo temporal da montagem','Assembly time scope');
    const details=root.ownerDocument.createElement('p');
    details.textContent=message+' '+t('Selecionados','Selected')+': '+selected+
      ' · '+t('Históricos fora do recorte','Historical outside scope')+': '+excluded+
      ' · '+t('Indeterminados','Uncertain')+': '+unknown;
    section.append(header,details);
    if(evidence.model.candidate_materials?.length){
      const candidateBlock=root.ownerDocument.createElement('details');
      candidateBlock.dataset.snAssemblyCandidates='1';
      candidateBlock.innerHTML='<summary>'+esc(t('Materiais candidatos sem comprovação temporal','Candidate materials without temporal proof'))+
        ' ('+evidence.model.candidate_materials.length+')</summary><ul>'+
        evidence.model.candidate_materials.map(item=>'<li><b>'+esc(item.item_type||'Material')+'</b> · '+
          esc(item.item_sn||'—')+' · '+esc(item.temporal_reason)+'</li>').join('')+'</ul>';
      section.append(candidateBlock);
    }
    root.prepend(section);
  }
  if(evidence.has2114){
    setKpi(root,/^(Falha atual|Current failure)$/i,evidence.current?1:0,'2114');
    setKpi(root,/^(Falhas antigas PCBA|Previous PCBA failures)$/i,evidence.previous.length,'2114');
    setKpi(root,/^(Histórias 2114|2114 histories)$/i,evidence.previous.length+(evidence.current?1:0),'2114');
  }
  patchFailureCards(root,evidence.current,evidence.previous.length);
  patchProcessCards(root,evidence.production);
  decorateSnRepairEvidence(root,evidence.model,result);
  decorateSnMaterialBindings(root,evidence.model);
  decorateSnHistoryDetail(root,evidence.model,result);
  decorateSnTemporalProof(root,evidence.model,result);
  decorateSmartSnAlerts(root,evidence.model,result);
  const summary=root.querySelector('[data-sn-tab-panel="summary"]');
  summary?.querySelector('[data-sn-compact-context]')?.remove();
  if(summary)summary.insertAdjacentHTML('beforeend',renderSnCompactContext(evidence.model,result,lang()));
}

export function withSnLiveContext(base,root,store){
  // Polling a running job should never close the operator's expanded evidence.
  // Capture before base rerenders, restore only for the same SN; no manual
  // navigation/collection should be triggered from a UI refresh.
  let openBySn=new Map(),lastSn='',linked=false,mountingMode='compare';
  const openRelatedPcba=event=>{
    const modeButton=event.target.closest('[data-sn-mounting-mode]');
    if(modeButton){
      const panel=modeButton.closest('[data-sn-mounting-views]');
      const raw=store.agent().job?.result;
      if(panel&&raw){mountingMode=modeButton.dataset.snMountingMode;panel.outerHTML=renderSnMountingViews(raw,lang(),mountingMode);}
      return;
    }
    const trigger=event.target.closest('[data-sn-open-pcba],[data-sn-open-material]');
    if(!trigger)return;
    const sn=String(trigger.dataset.snOpenPcba||trigger.dataset.snOpenMaterial||'').trim();
    if(!sn)return;
    const input=root.querySelector('[data-sn-form] [name=sn]');
    if(!input)return;
    input.value=sn;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    root.querySelector('[data-sn-form] [data-sn-run]')?.click();
  };
  return {
    render(){
      if(!linked){root.addEventListener('click',openRelatedPcba);linked=true;}
      const incoming=store.agent().resultSource==='sn'?store.agent().job?.result:null;
      const nextSn=String(incoming?.sn||'');
      if(nextSn!==lastSn){openBySn.clear();mountingMode='compare';lastSn=nextSn;}
      for(const [index,node] of [...root.querySelectorAll('[data-sn-correlation-alerts] [data-correlation-evidence]')].entries()){
        openBySn.set(index,node.open);
      }
      base.render();
      const agent=store.agent(),result=agent.resultSource==='sn'?agent.job?.result:null;
      if(result)decorate(root,result,mountingMode);
      for(const [index,node] of [...root.querySelectorAll('[data-sn-correlation-alerts] [data-correlation-evidence]')].entries()){
        if(openBySn.has(index))node.open=openBySn.get(index);
      }
    },
    clear(){openBySn.clear();lastSn='';mountingMode='compare';if(linked)root.removeEventListener('click',openRelatedPcba);linked=false;base.clear?.();}
  };
}
