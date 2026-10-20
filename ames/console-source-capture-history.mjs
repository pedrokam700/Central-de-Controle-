import {LINE_IDS} from './data/contract.mjs';
import {formatFactoryDateTime} from './data/time-display.mjs';

// Captures are workstation-local. A shared revision must never ask this
// browser's localhost for captures of a different workstation.
export function sourceCaptureEligibility(payload,entry,agent){
  if(!payload||!entry||entry.history_source!=='local')return {state:'shared'};
  const snapshot_id=Number(payload.snapshot_id),snapshot_revision=Number(payload.snapshot_revision);
  const period=payload.summary?.period;
  if(!LINE_IDS.includes(payload.line_id)||!Number.isSafeInteger(snapshot_id)||snapshot_id<1||
     !Number.isSafeInteger(snapshot_revision)||snapshot_revision<1||
     !/^[a-f0-9]{64}$/.test(payload.content_hash||'')||!payload.source_id||
     !period?.start_at||!period?.end_at||!period?.mode||
     entry.source_id!==payload.source_id||entry.line_id!==payload.line_id||
     String(entry.snapshot_id)!==String(payload.snapshot_id)||
     Number(entry.snapshot_revision)!==snapshot_revision)return {state:'invalid'};
  if(agent?.status!=='connected')return {state:'offline'};
  if(agent?.capabilities?.source_id!==payload.source_id)return {state:'foreign'};
  return {state:'ready',params:{snapshot_id,line_id:payload.line_id,
    snapshot_revision,content_hash:payload.content_hash},source_id:payload.source_id,period};
}

export function validateSourceCapturePage(page,identity){
  if(!page||page.source_id!==identity.source_id||
     page.period?.start_at!==identity.period.start_at||
     page.period?.end_at!==identity.period.end_at||
     page.period?.mode!==identity.period.mode||!Array.isArray(page.items)||
     page.items.length>10||page.schema!=='ames-local-source-capture-v1'||
     page.metadata_only!==true||page.local_only!==true||
     page.source_complete!==false||
     page.items.some(r=>r.source_id!==identity.source_id||
       r.period_start!==identity.period.start_at||
       r.period_end!==identity.period.end_at||
       r.period_mode!==identity.period.mode||r.source_complete!==false||
       r.population_complete!==false||r.local_only!==true||
       !['3074','2114','3022'].includes(r.source_view)||
       !['done','partial','error'].includes(r.source_status)))throw Error('capture_identity_mismatch');
  return page;
}

const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const node=(tag,text='',cls='')=>{
  const x=document.createElement(tag);x.textContent=String(text);
  if(cls)x.className=cls;return x;
};
const message=state=>({
  shared:t('Capturas disponíveis somente no posto de origem; esta revisão compartilhada não autoriza consultar o localhost de outro computador.','Captures are available only at the source workstation; a shared revision cannot query another computer via localhost.'),
  invalid:t('Identidade da revisão não comprovada; consulta local bloqueada.','Revision identity is unverified; local lookup blocked.'),
  offline:t('Agente local desconectado. A leitura só consulta o SQLite salvo e nunca executa o MES.','Local agent disconnected. The reader accesses saved SQLite metadata, never executes MES.'),
  foreign:t('Origem diferente: os metadados deste computador não pertencem à revisão selecionada.','Different source: this computer’s metadata does not belong to the selected revision.')
})[state]||'';

export function createSourceCaptureHistory(root,client,store){
  let disposed=false,identity=null,key='',visible=false,loading=false,items=null;
  let cursors=[null],index=0,error='',revision=0;
  function draw(){
    if(disposed)return;
    root.replaceChildren();
    const panel=node('section','','mes-context-panel');panel.dataset.sourceCaptureHistory='';
    panel.setAttribute('data-no-i18n','');root.append(panel);
    panel.append(node('h4',t('Capturas locais desta revisão · 3074 / 2114 / 3022','Local captures for this revision · 3074 / 2114 / 3022')));
    panel.append(node('p',t('Somente metadados. Progresso parcial, busca vazia e transporte não comprovam cobertura completa. A 3012 permanece candidata.','Metadata only. Partial progress, empty search and transport do not prove full coverage. 3012 remains a candidate.'),'mes-context'));
    const status=node('p','','mes-context');status.setAttribute('role','status');status.dataset.sourceCaptureStatus='';
    if(identity?.state!=='ready'){
      status.textContent=message(identity?.state);panel.append(status);return;
    }
    const toggle=node('button',visible?t('Ocultar capturas','Hide captures'):t('Ver capturas salvas','View saved captures'),'button secondary');
    toggle.type='button';toggle.dataset.sourceCaptureToggle='';toggle.setAttribute('aria-expanded',String(visible));
    toggle.addEventListener('click',()=>{
      visible=!visible;if(!visible){revision++;loading=false;}
      draw();if(visible&&!items)void load(0);
    });
    panel.append(toggle);
    if(!visible)return;
    status.textContent=error||(loading?t('Lendo índice local salvo…','Reading saved local index…'):
      !items?t('Ainda não consultado.','Not loaded yet.'):
      !items.length?t('Nenhum metadado encontrado; não significa ausência de falhas ou coletas.','No metadata found; this does not mean no failures or collection.'):
      t('Capturas nesta página','Captures on this page')+': '+items.length);
    panel.append(status);
    const list=node('div','','mes-record-list');list.dataset.sourceCaptureItems='';panel.append(list);
    for(const item of items||[]){
      const card=node('article','','ames-evidence-card');card.dataset.captureSource=item.source_view;
      const state=item.source_status==='done'
        ?t('resultado salvo; integralidade não comprovada','saved result; completeness unverified')
        :item.source_status==='error'?t('erro/registro parcial','error/partial record')
        :t('parcial','partial');
      card.append(node('strong',item.source_view+' · '+state));
      card.append(node('p',t('Armazenado','Stored')+': '+(item.stored_at?formatFactoryDateTime(item.stored_at):'—')+
        ' · '+t('Revisão da captura','Capture revision')+': '+item.capture_revision,'mes-context'));
      // IDs are text nodes, never innerHTML, even for malformed local payloads.
      card.append(node('p',t('Execução','Job')+': '+(item.job_id||'—'),'mes-context'));
      if(item.progress_only)card.append(node('p',t('3022: somente progresso, não comprova passagens completas.','3022: progress only, not proof of completed passages.'),'mes-context'));
      if(item.checkpoint_kind==='bounded_partial_progress')card.append(node('p',t('Checkpoint intermediário limitado; não é uma coleta integral.','Bounded intermediate checkpoint, not a complete collection.'),'mes-context'));
      if(Number.isSafeInteger(item.sample_count)&&item.sample_count>0)
        card.append(node('p',t('Itens amostrados (não total)','Sampled items (not a total)')+': '+item.sample_count,'mes-context'));
      list.append(card);
    }
    const nav=node('div','','mes-pagination');
    const prev=node('button',t('Anterior','Previous'),'button secondary');
    const next=node('button',t('Próxima','Next'),'button secondary');
    prev.type=next.type='button';prev.dataset.sourceCapturePrev='';next.dataset.sourceCaptureNext='';
    prev.disabled=loading||index===0;next.disabled=loading||cursors.length<=index+1;
    prev.addEventListener('click',()=>void load(index-1));
    next.addEventListener('click',()=>void load(index+1));
    nav.append(prev,node('span',t('Página','Page')+' '+(index+1)),next);panel.append(nav);
  }
  async function load(pageIndex){
    if(disposed||loading||identity?.state!=='ready'||pageIndex<0||pageIndex>=cursors.length)return;
    const seq=++revision,selected=identity;
    loading=true;error='';draw();
    try{
      const page=validateSourceCapturePage(await client.sourceCaptures(
        {...selected.params,limit:10,before:cursors[pageIndex]}),selected);
      if(disposed||seq!==revision)return;
      items=page.items;index=pageIndex;cursors=cursors.slice(0,pageIndex+1);
      if(page.next_cursor)cursors.push(page.next_cursor);
    }catch(err){
      if(!disposed&&seq===revision){items=null;error=String(err?.message||err);}
    }finally{if(!disposed&&seq===revision){loading=false;draw();}}
  }
  function show(payload,entry){
    if(disposed)return;
    const candidate=sourceCaptureEligibility(payload,entry,store.agent());
    const next=JSON.stringify([payload?.source_id,payload?.line_id,payload?.snapshot_id,
      payload?.snapshot_revision,payload?.content_hash,payload?.summary?.period,
      entry?.history_source,candidate.state,document.documentElement.lang]);
    if(next===key)return;
    key=next;identity=candidate;revision++;visible=false;loading=false;
    items=null;index=0;cursors=[null];error='';draw();
  }
  return Object.freeze({show,clear(){disposed=true;revision++;root.replaceChildren();}});
}
